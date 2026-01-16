import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
});

const MODEL = "mistralai/devstral-2512:free";

const ENHANCED_SCHEMA = `
=== 데이터베이스 스키마 (PostgreSQL) ===

[products 테이블] - 제품 정보
| 컬럼명      | 타입           | 설명                                    |
|-------------|----------------|----------------------------------------|
| id          | SERIAL (PK)    | 제품 고유 번호                          |
| name        | TEXT           | 제품명 (예: "노트북", "무선 마우스")      |
| category    | TEXT           | 카테고리 (예: "전자제품", "가전", "의류") |
| price       | NUMERIC        | 가격 (원 단위, 숫자형 - CAST 필요 시 사용)|
| stock       | INTEGER        | 재고 수량                               |
| description | TEXT           | 제품 상세 설명 (NULL 가능)              |

[sales 테이블] - 판매 기록
| 컬럼명      | 타입           | 설명                                    |
|-------------|----------------|----------------------------------------|
| id          | SERIAL (PK)    | 판매 고유 번호                          |
| product_id  | INTEGER (FK)   | 제품 ID (→ products.id 참조)            |
| quantity    | INTEGER        | 판매 수량                               |
| total_price | NUMERIC        | 총 판매액 (원 단위)                     |
| sale_date   | TIMESTAMP      | 판매 일시 (기본값: 현재 시간)           |

[관계]
- sales.product_id → products.id (다대일 관계: 하나의 제품에 여러 판매 기록)

[참고사항]
- price, total_price는 NUMERIC 타입으로, 정렬/계산 시 CAST(price AS DECIMAL) 권장
- 날짜 필터: sale_date >= '2024-01-01' 또는 DATE_TRUNC('month', sale_date)
`;

const FEW_SHOT_EXAMPLES = `
=== SQL 변환 예시 ===

Q: "가장 비싼 제품 5개 보여줘"
A: SELECT * FROM products ORDER BY CAST(price AS DECIMAL) DESC LIMIT 5

Q: "가장 저렴한 제품은?"
A: SELECT * FROM products ORDER BY CAST(price AS DECIMAL) ASC LIMIT 1

Q: "전자제품 카테고리 제품들"
A: SELECT * FROM products WHERE category = '전자제품'

Q: "재고가 10개 이하인 제품"
A: SELECT * FROM products WHERE stock <= 10 ORDER BY stock ASC

Q: "총 매출액은 얼마야?"
A: SELECT SUM(CAST(total_price AS DECIMAL)) as total_sales FROM sales

Q: "카테고리별 제품 수"
A: SELECT category, COUNT(*) as product_count FROM products GROUP BY category ORDER BY product_count DESC

Q: "카테고리별 평균 가격"
A: SELECT category, ROUND(AVG(CAST(price AS DECIMAL)), 0) as avg_price FROM products GROUP BY category ORDER BY avg_price DESC

Q: "가장 많이 팔린 제품 TOP 5"
A: SELECT p.name, p.category, SUM(s.quantity) as total_sold FROM products p JOIN sales s ON p.id = s.product_id GROUP BY p.id, p.name, p.category ORDER BY total_sold DESC LIMIT 5

Q: "제품별 총 매출액"
A: SELECT p.name, SUM(CAST(s.total_price AS DECIMAL)) as revenue FROM products p JOIN sales s ON p.id = s.product_id GROUP BY p.id, p.name ORDER BY revenue DESC

Q: "오늘 판매 내역"
A: SELECT p.name, s.quantity, s.total_price, s.sale_date FROM sales s JOIN products p ON s.product_id = p.id WHERE DATE(s.sale_date) = CURRENT_DATE ORDER BY s.sale_date DESC

Q: "이번 달 매출"
A: SELECT SUM(CAST(total_price AS DECIMAL)) as monthly_sales FROM sales WHERE sale_date >= DATE_TRUNC('month', CURRENT_DATE)

Q: "제품 몇 개 있어?" / "총 제품 수"
A: SELECT COUNT(*) as total_products FROM products

Q: "판매 기록 몇 건이야?"
A: SELECT COUNT(*) as total_sales FROM sales

Q: "모든 제품 보여줘"
A: SELECT * FROM products ORDER BY id

Q: "최근 판매 10건"
A: SELECT p.name, s.quantity, s.total_price, s.sale_date FROM sales s JOIN products p ON s.product_id = p.id ORDER BY s.sale_date DESC LIMIT 10
`;

async function fixSqlWithLLM(originalSql: string, errorMessage: string, userQuestion: string): Promise<string> {
  const fixPrompt = `
You are a SQL expert. The following SQL query failed with an error. Fix it.

Original Question: "${userQuestion}"
Failed SQL: ${originalSql}
Error: ${errorMessage}

Database Schema:
${ENHANCED_SCHEMA}

Rules:
1. Output ONLY the corrected SQL query
2. No explanations, no markdown
3. Ensure the query is valid PostgreSQL

Fixed SQL:`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a SQL expert. Output only valid PostgreSQL queries." },
        { role: "user", content: fixPrompt },
      ],
      temperature: 0,
      max_tokens: 256,
    });

    let fixedSql = completion.choices[0]?.message?.content || "";
    fixedSql = fixedSql.replace(/```sql/gi, "").replace(/```/g, "").trim();
    const sqlMatch = fixedSql.match(/SELECT[\s\S]*?(?:;|$)/i);
    if (sqlMatch) {
      return sqlMatch[0].replace(/;$/, '');
    }
    return fixedSql;
  } catch (err) {
    console.error("SQL fix error:", err);
    return originalSql;
  }
}

function cleanSql(rawSql: string): string {
  let cleaned = rawSql.replace(/```sql/gi, "").replace(/```/g, "").trim();
  const sqlMatch = cleaned.match(/SELECT[\s\S]*?(?:;|$)/i);
  if (sqlMatch) {
    cleaned = sqlMatch[0].replace(/;$/, '');
  }
  return cleaned;
}

function getFallbackSql(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('매출') || lowerMessage.includes('revenue') || lowerMessage.includes('sales')) {
    if (lowerMessage.includes('총') || lowerMessage.includes('전체') || lowerMessage.includes('total')) {
      return 'SELECT SUM(CAST(total_price AS DECIMAL)) as total_sales FROM sales';
    }
    return 'SELECT p.name, s.quantity, s.total_price, s.sale_date FROM sales s JOIN products p ON s.product_id = p.id ORDER BY s.sale_date DESC LIMIT 10';
  }
  
  if (lowerMessage.includes('카테고리') || lowerMessage.includes('category')) {
    if (lowerMessage.includes('별') || lowerMessage.includes('group')) {
      return 'SELECT category, COUNT(*) as count FROM products GROUP BY category ORDER BY count DESC';
    }
  }
  
  if (lowerMessage.includes('가장') || lowerMessage.includes('top') || lowerMessage.includes('best')) {
    if (lowerMessage.includes('비싼') || lowerMessage.includes('expensive')) {
      return 'SELECT * FROM products ORDER BY CAST(price AS DECIMAL) DESC LIMIT 5';
    }
    if (lowerMessage.includes('저렴') || lowerMessage.includes('cheap')) {
      return 'SELECT * FROM products ORDER BY CAST(price AS DECIMAL) ASC LIMIT 5';
    }
    if (lowerMessage.includes('팔린') || lowerMessage.includes('sold')) {
      return 'SELECT p.name, SUM(s.quantity) as total_sold FROM products p JOIN sales s ON p.id = s.product_id GROUP BY p.id, p.name ORDER BY total_sold DESC LIMIT 5';
    }
  }
  
  if (lowerMessage.includes('제품') || lowerMessage.includes('product')) {
    if (lowerMessage.includes('몇') || lowerMessage.includes('count') || lowerMessage.includes('수')) {
      return 'SELECT COUNT(*) as total_products FROM products';
    }
    return 'SELECT * FROM products ORDER BY CAST(price AS DECIMAL) DESC LIMIT 10';
  }
  
  return 'SELECT * FROM products ORDER BY id LIMIT 10';
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await storage.seed();

  app.get("/api/tables", async (req, res) => {
    try {
      const tables = [
        {
          name: "products",
          description: "제품 정보 테이블",
          columns: [
            { name: "id", type: "SERIAL", description: "제품 고유 번호 (PK)" },
            { name: "name", type: "TEXT", description: "제품명" },
            { name: "category", type: "TEXT", description: "카테고리" },
            { name: "price", type: "NUMERIC", description: "가격 (원)" },
            { name: "stock", type: "INTEGER", description: "재고 수량" },
            { name: "description", type: "TEXT", description: "제품 설명" }
          ],
          rowCount: 0
        },
        {
          name: "sales",
          description: "판매 기록 테이블",
          columns: [
            { name: "id", type: "SERIAL", description: "판매 고유 번호 (PK)" },
            { name: "product_id", type: "INTEGER", description: "제품 ID (FK)" },
            { name: "quantity", type: "INTEGER", description: "판매 수량" },
            { name: "total_price", type: "NUMERIC", description: "총 판매액" },
            { name: "sale_date", type: "TIMESTAMP", description: "판매 일시" }
          ],
          rowCount: 0
        }
      ];

      const productsResult = await db.execute(sql.raw("SELECT COUNT(*) as count FROM products"));
      const salesResult = await db.execute(sql.raw("SELECT COUNT(*) as count FROM sales"));
      
      tables[0].rowCount = Number(productsResult.rows[0]?.count || 0);
      tables[1].rowCount = Number(salesResult.rows[0]?.count || 0);

      res.json(tables);
    } catch (err) {
      console.error("Tables error:", err);
      res.status(500).json({ message: "Failed to get tables" });
    }
  });

  app.post(api.chat.sql.path, async (req, res) => {
    try {
      const { message } = api.chat.sql.input.parse(req.body);

      const systemPrompt = `You are a PostgreSQL SQL expert assistant. Convert natural language questions (Korean or English) into valid PostgreSQL queries.

${ENHANCED_SCHEMA}

${FEW_SHOT_EXAMPLES}

=== 규칙 ===
1. SQL 쿼리만 출력하세요. 설명, 마크다운, 추가 텍스트 없이 순수 SQL만.
2. 스키마의 정확한 테이블명과 컬럼명을 사용하세요.
3. price, total_price 정렬/계산 시 CAST(column AS DECIMAL) 사용
4. "가장", "top", "best" 요청 시 반드시 LIMIT 사용
5. JOIN 필요 시 올바른 FK 관계 사용: sales.product_id = products.id
6. 집계 함수 사용 시 적절한 GROUP BY 포함
`;

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0,
        max_tokens: 256,
      });

      let generatedSql = cleanSql(completion.choices[0]?.message?.content || "");
      console.log("Generated SQL:", generatedSql);

      if (!generatedSql || !generatedSql.toLowerCase().startsWith('select')) {
        console.log("Invalid SQL, using fallback");
        generatedSql = getFallbackSql(message);
        console.log("Fallback SQL:", generatedSql);
      }

      let queryResult: any[] = [];
      let lastError: string | null = null;
      const MAX_RETRIES = 2;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await db.execute(sql.raw(generatedSql));
          queryResult = result.rows;
          lastError = null;
          break;
        } catch (dbError: any) {
          console.error(`SQL execution error (attempt ${attempt + 1}):`, dbError.message);
          lastError = dbError.message;

          if (attempt < MAX_RETRIES) {
            console.log("Attempting to fix SQL with LLM...");
            const fixedSql = await fixSqlWithLLM(generatedSql, dbError.message, message);
            
            if (fixedSql && fixedSql !== generatedSql) {
              console.log("Fixed SQL:", fixedSql);
              generatedSql = fixedSql;
            } else {
              generatedSql = getFallbackSql(message);
              console.log("Using fallback SQL:", generatedSql);
            }
          }
        }
      }

      if (lastError) {
        return res.status(200).json({
          answer: "죄송합니다. 해당 질문에 대한 쿼리를 실행할 수 없습니다. 다른 방식으로 질문해 주시겠어요?",
          sql: generatedSql,
          data: [],
          error: lastError
        });
      }

      const summaryPrompt = `
사용자 질문: "${message}"
실행된 SQL: "${generatedSql}"
결과 데이터: ${JSON.stringify(queryResult.slice(0, 10))} ${queryResult.length > 10 ? `(총 ${queryResult.length}건 중 10건 표시)` : `(${queryResult.length}건)`}

작업:
- 데이터를 기반으로 사용자 질문에 친절하게 한국어로 답변
- 숫자가 있으면 읽기 쉽게 포맷 (예: 1000000 → 100만)
- 데이터가 없으면 "조회된 데이터가 없습니다"라고 안내
- SQL이나 기술 용어 사용 금지, 결과만 자연스럽게 설명
`;

      const summaryCompletion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "당신은 친절한 데이터 분석 어시스턴트입니다. 자연스럽고 간결한 한국어로 답변하세요." },
          { role: "user", content: summaryPrompt },
        ],
        max_tokens: 512,
      });

      const answer = summaryCompletion.choices[0]?.message?.content || "결과를 확인해 주세요.";

      res.json({
        answer,
        sql: generatedSql,
        data: queryResult,
      });

    } catch (err) {
      console.error("Chat error:", err);
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid input" });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  return httpServer;
}
