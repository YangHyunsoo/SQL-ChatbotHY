import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { db } from "./db";
import { sql, eq, desc } from "drizzle-orm";
import multer from "multer";
import Papa from "papaparse";
import { datasets, structuredData, unstructuredData, knowledgeDocuments, documentChunks, type ColumnInfo } from "@shared/schema";
import * as duckdbService from "./duckdb-service";
import * as documentParser from "./document-parser";
import * as embeddingService from "./embedding-service";
import * as ragService from "./rag-service";
import * as ollamaService from "./ollama-service";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
});

const MODEL = "mistralai/devstral-2512:free";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const knowledgeUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
});

// Fix Korean filename encoding (multer returns latin1 encoded filenames)
function decodeFilename(filename: string): string {
  try {
    // Try to decode from latin1 to UTF-8
    return Buffer.from(filename, 'latin1').toString('utf8');
  } catch {
    return filename;
  }
}

function inferColumnType(values: string[]): 'text' | 'number' | 'date' | 'boolean' {
  const nonEmptyValues = values.filter(v => v !== null && v !== undefined && v.trim() !== '');
  if (nonEmptyValues.length === 0) return 'text';

  const numberCount = nonEmptyValues.filter(v => !isNaN(Number(v.replace(/,/g, '')))).length;
  if (numberCount / nonEmptyValues.length > 0.8) return 'number';

  const booleanCount = nonEmptyValues.filter(v => 
    ['true', 'false', 'yes', 'no', '1', '0', '예', '아니오', 'Y', 'N'].includes(v.toLowerCase())
  ).length;
  if (booleanCount / nonEmptyValues.length > 0.8) return 'boolean';

  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{2}\/\d{2}\/\d{4}/,
    /^\d{4}\/\d{2}\/\d{2}/,
  ];
  const dateCount = nonEmptyValues.filter(v => 
    datePatterns.some(p => p.test(v))
  ).length;
  if (dateCount / nonEmptyValues.length > 0.8) return 'date';

  return 'text';
}

function analyzeColumns(headers: string[], rows: any[]): ColumnInfo[] {
  return headers.map(header => {
    const values = rows.slice(0, 100).map(row => String(row[header] || ''));
    return {
      name: header,
      type: inferColumnType(values),
      nullable: values.some(v => !v || v.trim() === ''),
      sampleValues: values.slice(0, 3).filter(v => v.trim() !== '')
    };
  });
}

function sanitizeDuckdbColumnName(name: string, index: number = 0): string {
  const sanitized = name
    .replace(/[^\uAC00-\uD7A3\u3131-\u3163a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized || `col_${index}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDatasetQuestion(message: string, datasetNames: string[]): boolean {
  if (!datasetNames.length) return false;
  const lowered = message.toLowerCase();
  const datasetHints = ['dataset', '데이터셋', 'csv', '업로드', '엑셀', '스프레드시트'];
  if (datasetHints.some(hint => lowered.includes(hint))) return true;
  return datasetNames.some(name => {
    if (!name) return false;
    const escaped = escapeRegExp(name.toLowerCase());
    return new RegExp(`\\b${escaped}\\b`, 'i').test(lowered) || lowered.includes(name.toLowerCase());
  });
}

function pickDuckdbTableFromSql(sqlText: string, duckdbTables: string[]): string | null {
  if (!duckdbTables.length) return null;
  for (const table of duckdbTables) {
    const escaped = escapeRegExp(table);
    const plainPattern = new RegExp(`\\b${escaped}\\b`, 'i');
    const quotedPattern = new RegExp(`"${escaped}"`, 'i');
    if (plainPattern.test(sqlText) || quotedPattern.test(sqlText)) {
      return table;
    }
  }
  const fallbackMatch = sqlText.match(/\bdataset_[a-z0-9_]+\b/i);
  return fallbackMatch ? fallbackMatch[0] : null;
}

async function buildDynamicSchema(): Promise<{ schema: string; duckdbTables: string[]; datasetNames: string[] }> {
  let schema = ENHANCED_SCHEMA;
  const duckdbTables: string[] = [];
  const datasetNames: string[] = [];
  let hasStructuredData = false;
  let hasDuckdbData = false;
  
  try {
    const uploadedDatasets = await db.select().from(datasets);
    
    if (uploadedDatasets.length > 0) {
      schema += '\n\n=== 사용자 업로드 데이터셋 ===\n';
      
      for (const dataset of uploadedDatasets) {
        if (dataset.dataType === 'structured' && dataset.columnInfo) {
          if (dataset.name) datasetNames.push(dataset.name);
          const columns: ColumnInfo[] = JSON.parse(dataset.columnInfo);
          
          // DuckDB storage (new method)
          if (dataset.duckdbTable) {
            hasDuckdbData = true;
            duckdbTables.push(dataset.duckdbTable);
            schema += `\n[DuckDB 테이블: ${dataset.duckdbTable}] - ${dataset.name}\n`;
            schema += `설명: ${dataset.description || dataset.fileName} (DuckDB 고성능 분석용)\n`;
            schema += '| 컬럼명 | 타입 |\n';
            schema += '|--------|------|\n';
            
            for (const [idx, col] of columns.entries()) {
              const duckType = col.type === 'number' ? 'DOUBLE' 
                : col.type === 'date' ? 'TIMESTAMP' 
                : col.type === 'boolean' ? 'BOOLEAN'
                : 'VARCHAR';
              const sanitizedName = sanitizeDuckdbColumnName(col.name, idx);
              schema += `| ${sanitizedName} | ${duckType} |\n`;
            }
            
            const firstColumn = columns[0];
            const firstColumnName = firstColumn ? sanitizeDuckdbColumnName(firstColumn.name, 0) : 'column';
            const numericColumnIndex = columns.findIndex(col => col.type === 'number');
            const numericColumnName = numericColumnIndex >= 0
              ? sanitizeDuckdbColumnName(columns[numericColumnIndex].name, numericColumnIndex)
              : null;
            schema += `\n이 데이터셋 관련 질문은 "${dataset.duckdbTable}" 테이블을 기준으로 DuckDB 쿼리를 작성하세요.\n`;
            schema += `쿼리 예시:\n`;
            schema += `- 전체 개수: SELECT COUNT(*) AS total_count FROM "${dataset.duckdbTable}"\n`;
            schema += `- 샘플 조회: SELECT "${firstColumnName}" FROM "${dataset.duckdbTable}" LIMIT 5\n`;
            if (numericColumnName) {
              schema += `- 합계/평균: SELECT SUM("${numericColumnName}") AS sum_value, AVG("${numericColumnName}") AS avg_value FROM "${dataset.duckdbTable}"\n`;
            }
          } else {
            // Legacy PostgreSQL storage
            hasStructuredData = true;
            schema += `\n[structured_data 테이블에서 dataset_id = ${dataset.id}] - ${dataset.name}\n`;
            schema += `설명: ${dataset.description || dataset.fileName}\n`;
            schema += '| 컬럼명 | 타입 |\n';
            schema += '|--------|------|\n';
            
            for (const col of columns) {
              const sqlType = col.type === 'number' ? 'NUMERIC' 
                : col.type === 'date' ? 'TIMESTAMP' 
                : col.type === 'boolean' ? 'BOOLEAN'
                : 'TEXT';
              schema += `| ${col.name} | ${sqlType} |\n`;
            }
            
            schema += `\n쿼리 예시: SELECT data->>'${columns[0]?.name || 'column'}' as ${columns[0]?.name || 'column'} FROM structured_data WHERE dataset_id = ${dataset.id}\n`;
          }
        } else if (dataset.dataType === 'unstructured') {
          schema += `\n[unstructured_data 테이블에서 dataset_id = ${dataset.id}] - ${dataset.name}\n`;
          schema += `설명: ${dataset.description || dataset.fileName} (비정형 텍스트 데이터, pgvector 지원)\n`;
          schema += '| 컬럼명 | 타입 | 설명 |\n';
          schema += '|--------|------|------|\n';
          schema += '| raw_content | TEXT | 원본 텍스트 |\n';
          schema += '| search_text | TEXT | 검색용 텍스트 (소문자) |\n';
          schema += `\n쿼리 예시: SELECT raw_content FROM unstructured_data WHERE dataset_id = ${dataset.id} AND search_text LIKE '%검색어%'\n`;
        }
      }
      
      if (hasStructuredData) {
        schema += `\n[참고] structured_data 정형 데이터는 JSON 형식으로 저장됨. data->>'컬럼명'으로 접근\n`;
      }
      if (hasDuckdbData) {
        schema += `\n[참고] DuckDB 테이블은 PostgreSQL에서 직접 쿼리할 수 없습니다.\n`;
      }
    }
  } catch (err) {
    console.error("Error building dynamic schema:", err);
  }
  
  return { schema, duckdbTables, datasetNames };
}

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

async function fixSqlWithLLM(
  originalSql: string,
  errorMessage: string,
  userQuestion: string,
  schema: string,
  dialect: 'postgres' | 'duckdb'
): Promise<string> {
  const fixPrompt = `
You are a SQL expert. The following SQL query failed with an error. Fix it.

Original Question: "${userQuestion}"
Failed SQL: ${originalSql}
Error: ${errorMessage}

Database Schema:
${schema}

Rules:
1. Output ONLY the corrected SQL query
2. No explanations, no markdown
3. Ensure the query is valid ${dialect === 'duckdb' ? 'DuckDB' : 'PostgreSQL'}

Fixed SQL:`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: `You are a SQL expert. Output only valid ${dialect === 'duckdb' ? 'DuckDB' : 'PostgreSQL'} queries.` },
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

      // Build dynamic schema including uploaded datasets
      const { schema: dynamicSchema, duckdbTables, datasetNames } = await buildDynamicSchema();
      const datasetQuestion = isDatasetQuestion(message, datasetNames);
      if (!datasetQuestion) {
        const generalPrompt = `
사용자 질문: "${message}"

작업:
- 질문에 대해 일반적인 설명형 답변을 한국어로 작성
- 데이터 조회, SQL, 테이블 언급 금지
- 간결하고 친절하게 답변
`;
        const generalCompletion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            { role: "system", content: "당신은 친절한 일반 지식 어시스턴트입니다. 짧고 명확하게 답변하세요." },
            { role: "user", content: generalPrompt },
          ],
          max_tokens: 512,
        });
        const answer = generalCompletion.choices[0]?.message?.content || "도움이 필요하시면 조금 더 자세히 질문해 주세요.";
        return res.json({
          answer,
          sql: '',
          data: [],
        });
      }

      const systemPrompt = `You are a SQL expert assistant. Convert natural language questions (Korean or English) into valid SQL queries.

${dynamicSchema}

${FEW_SHOT_EXAMPLES}

=== 규칙 ===
1. SQL 쿼리만 출력하세요. 설명, 마크다운, 추가 텍스트 없이 순수 SQL만.
2. 스키마의 정확한 테이블명과 컬럼명을 사용하세요.
3. price, total_price 정렬/계산 시 CAST(column AS DECIMAL) 사용
4. "가장", "top", "best" 요청 시 반드시 LIMIT 사용
5. JOIN 필요 시 올바른 FK 관계 사용: sales.product_id = products.id
6. 집계 함수 사용 시 적절한 GROUP BY 포함
7. DuckDB 테이블은 data->>'컬럼명' 같은 JSON 접근을 사용하지 마세요.
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
        if (duckdbTables.length === 1) {
          generatedSql = `SELECT * FROM "${duckdbTables[0]}" LIMIT 10`;
        } else {
          generatedSql = getFallbackSql(message);
        }
        console.log("Fallback SQL:", generatedSql);
      }

      let queryResult: any[] = [];
      let lastError: string | null = null;
      const MAX_RETRIES = 2;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const duckdbTable = pickDuckdbTableFromSql(generatedSql, duckdbTables);
          if (duckdbTable) {
            queryResult = await duckdbService.runQuery(generatedSql);
          } else {
            const result = await db.execute(sql.raw(generatedSql));
            queryResult = result.rows;
          }
          lastError = null;
          break;
        } catch (dbError: any) {
          console.error(`SQL execution error (attempt ${attempt + 1}):`, dbError.message);
          lastError = dbError.message;

          if (attempt < MAX_RETRIES) {
            console.log("Attempting to fix SQL with LLM...");
            const duckdbTable = pickDuckdbTableFromSql(generatedSql, duckdbTables);
            const fixedSql = await fixSqlWithLLM(
              generatedSql,
              dbError.message,
              message,
              dynamicSchema,
              duckdbTable ? 'duckdb' : 'postgres'
            );
            
            if (fixedSql && fixedSql !== generatedSql) {
              console.log("Fixed SQL:", fixedSql);
              generatedSql = fixedSql;
            } else {
              if (duckdbTables.length === 1 && duckdbTable) {
                generatedSql = `SELECT * FROM "${duckdbTables[0]}" LIMIT 10`;
              } else {
                generatedSql = getFallbackSql(message);
              }
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

      const previewJson = JSON.stringify(
        queryResult.slice(0, 10),
        (_key, value) => (typeof value === 'bigint' ? Number(value) : value)
      );
      const summaryPrompt = `
사용자 질문: "${message}"
실행된 SQL: "${generatedSql}"
결과 데이터: ${previewJson} ${queryResult.length > 10 ? `(총 ${queryResult.length}건 중 10건 표시)` : `(${queryResult.length}건)`}

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

      const safeData = JSON.parse(
        JSON.stringify(queryResult, (_key, value) => (typeof value === 'bigint' ? Number(value) : value))
      );

      res.json({
        answer,
        sql: generatedSql,
        data: safeData,
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

  // === Dataset Management API ===
  
  // List all datasets
  app.get("/api/datasets", async (req, res) => {
    try {
      const allDatasets = await db.select().from(datasets).orderBy(desc(datasets.createdAt));
      res.json(allDatasets);
    } catch (err) {
      console.error("Get datasets error:", err);
      res.status(500).json({ message: "Failed to get datasets" });
    }
  });

  // Get single dataset
  app.get("/api/datasets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dataset = await db.select().from(datasets).where(eq(datasets.id, id)).limit(1);
      if (dataset.length === 0) {
        return res.status(404).json({ message: "Dataset not found" });
      }
      res.json(dataset[0]);
    } catch (err) {
      console.error("Get dataset error:", err);
      res.status(500).json({ message: "Failed to get dataset" });
    }
  });

  // Get dataset data with pagination
  app.get("/api/datasets/:id/data", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;

      const dataset = await db.select().from(datasets).where(eq(datasets.id, id)).limit(1);
      if (dataset.length === 0) {
        return res.status(404).json({ message: "Dataset not found" });
      }

      const ds = dataset[0];
      let rows: any[] = [];

      if (ds.dataType === 'structured') {
        // Query from DuckDB if table exists
        if (ds.duckdbTable) {
          try {
            rows = await duckdbService.queryDataset(ds.duckdbTable, limit, offset);
          } catch (duckErr) {
            console.error("DuckDB query failed, falling back to PostgreSQL:", duckErr);
            // Fallback to PostgreSQL
            const result = await db.select()
              .from(structuredData)
              .where(eq(structuredData.datasetId, id))
              .orderBy(structuredData.rowIndex)
              .limit(limit)
              .offset(offset);
            rows = result.map(r => JSON.parse(r.data));
          }
        } else {
          // Legacy data in PostgreSQL
          const result = await db.select()
            .from(structuredData)
            .where(eq(structuredData.datasetId, id))
            .orderBy(structuredData.rowIndex)
            .limit(limit)
            .offset(offset);
          rows = result.map(r => JSON.parse(r.data));
        }
      } else {
        // Unstructured data from PostgreSQL
        const result = await db.select()
          .from(unstructuredData)
          .where(eq(unstructuredData.datasetId, id))
          .orderBy(unstructuredData.rowIndex)
          .limit(limit)
          .offset(offset);
        rows = result.map(r => ({
          _id: r.id,
          _content: r.rawContent,
          _metadata: r.metadata ? JSON.parse(r.metadata) : null
        }));
      }

      res.json({
        dataset: ds,
        data: rows,
        pagination: {
          page,
          limit,
          total: ds.rowCount,
          totalPages: Math.ceil(ds.rowCount / limit)
        },
        storage: ds.duckdbTable ? 'DuckDB' : 'PostgreSQL'
      });
    } catch (err) {
      console.error("Get dataset data error:", err);
      res.status(500).json({ message: "Failed to get dataset data" });
    }
  });

  // Upload CSV file
  app.post("/api/datasets/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { name, dataType, description } = req.body;
      if (!name || !dataType) {
        return res.status(400).json({ message: "Name and dataType are required" });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()
      });

      if (parsed.errors.length > 0) {
        console.error("CSV parse errors:", parsed.errors);
      }

      const rows = parsed.data as Record<string, string>[];
      const headers = parsed.meta.fields || [];

      if (rows.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
      }

      // Analyze column types for structured data
      const columnInfo = dataType === 'structured' 
        ? analyzeColumns(headers, rows)
        : null;

      // Decode file name properly for Korean/UTF-8 characters
      let fileName = req.file.originalname;
      try {
        // Multer may encode non-ASCII names incorrectly, try to decode
        fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      } catch {
        // Keep original if decoding fails
      }

      // Create dataset record (without DuckDB table name first)
      const [newDataset] = await db.insert(datasets).values({
        name,
        fileName,
        dataType,
        rowCount: rows.length,
        columnInfo: columnInfo ? JSON.stringify(columnInfo) : null,
        description: description || null,
        duckdbTable: null
      }).returning();

      // Insert data rows
      if (dataType === 'structured' && columnInfo) {
        // Use DuckDB for structured data (970x faster analytics)
        try {
          const tableName = await duckdbService.createDatasetTable(
            newDataset.id,
            name,
            columnInfo.map(c => ({ name: c.name, type: c.type }))
          );
          
          await duckdbService.insertDataRows(tableName, columnInfo, rows);
          
          // Update dataset with DuckDB table name
          await db.update(datasets)
            .set({ duckdbTable: tableName })
            .where(eq(datasets.id, newDataset.id));
          
          newDataset.duckdbTable = tableName;
          console.log(`Structured data stored in DuckDB table: ${tableName}`);
        } catch (duckErr) {
          console.error("DuckDB storage failed, falling back to PostgreSQL:", duckErr);
          // Fallback to PostgreSQL if DuckDB fails
          const batchSize = 100;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize).map((row, idx) => ({
              datasetId: newDataset.id,
              rowIndex: i + idx,
              data: JSON.stringify(row)
            }));
            await db.insert(structuredData).values(batch);
          }
        }
      } else {
        // For unstructured data, store in PostgreSQL with text search support
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize).map((row, idx) => {
            const content = Object.values(row).join(' ').trim();
            return {
              datasetId: newDataset.id,
              rowIndex: i + idx,
              rawContent: content,
              metadata: JSON.stringify(row),
              searchText: content.toLowerCase()
            };
          });
          await db.insert(unstructuredData).values(batch);
        }
      }

      res.json({
        message: "Dataset uploaded successfully",
        dataset: newDataset,
        columns: columnInfo,
        storage: dataType === 'structured' ? 'DuckDB' : 'PostgreSQL'
      });

    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Failed to upload dataset" });
    }
  });

  // Update dataset metadata
  app.put("/api/datasets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description } = req.body;

      const [updated] = await db.update(datasets)
        .set({ 
          name: name || undefined,
          description: description !== undefined ? description : undefined,
          updatedAt: new Date()
        })
        .where(eq(datasets.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Dataset not found" });
      }

      res.json(updated);
    } catch (err) {
      console.error("Update dataset error:", err);
      res.status(500).json({ message: "Failed to update dataset" });
    }
  });

  // Generate sample questions based on datasets
  app.get("/api/sample-questions", async (req, res) => {
    try {
      // Base sample queries for default schema
      const defaultQueries = [
        "가장 비싼 상위 5개 제품을 보여줘",
        "카테고리별 총 매출은 얼마야?",
        "최근 7일간의 모든 판매 내역을 보여줘",
        "재고가 20개 미만인 제품은?"
      ];
      
      // Fetch uploaded datasets
      const uploadedDatasets = await db.select().from(datasets).orderBy(desc(datasets.createdAt));
      
      if (uploadedDatasets.length === 0) {
        return res.json({ questions: defaultQueries, datasetQuestions: [] });
      }
      
      // Generate questions for each dataset based on its columns
      const datasetQuestions: { datasetName: string; questions: string[] }[] = [];
      
      for (const dataset of uploadedDatasets.slice(0, 3)) { // Limit to 3 most recent datasets
        if (!dataset.columnInfo) continue;
        
        try {
          const columns: ColumnInfo[] = JSON.parse(dataset.columnInfo);
          const questions: string[] = [];
          const datasetName = dataset.name;
          
          // Filter columns with valid (non-empty) names
          const validColumns = columns.filter(c => c.name && c.name.trim() !== '');
          const numberCols = validColumns.filter(c => c.type === 'number' && c.name.trim());
          const textCols = validColumns.filter(c => c.type === 'text' && c.name.trim());
          const dateCols = validColumns.filter(c => c.type === 'date' && c.name.trim());
          
          // Pattern 1: Count total records (always valid)
          questions.push(`${datasetName}의 전체 데이터 수는?`);
          
          // Pattern 2: If there are number columns with valid names, suggest aggregation
          if (numberCols.length > 0) {
            const numCol = numberCols[0].name.trim();
            questions.push(`${datasetName}에서 ${numCol}의 합계/평균은?`);
          }
          
          // Pattern 3: If there are text columns with valid names, suggest grouping
          if (textCols.length > 0) {
            const textCol = textCols[0].name.trim();
            questions.push(`${datasetName}에서 ${textCol}별로 몇 건인지 보여줘`);
          }
          
          // Pattern 4: Show sample data (always valid)
          questions.push(`${datasetName}의 최근 10건 데이터 보여줘`);
          
          // Pattern 5: If there are date columns with valid names, suggest filtering
          if (dateCols.length > 0) {
            const dateCol = dateCols[0].name.trim();
            questions.push(`${datasetName}에서 ${dateCol} 기준 최신 데이터는?`);
          }
          
          // Pattern 6: Search for specific values from text columns
          if (textCols.length > 0 && textCols[0].sampleValues && textCols[0].sampleValues.length > 0) {
            const sampleValue = textCols[0].sampleValues[0];
            if (sampleValue && sampleValue.trim() && sampleValue.length <= 30) {
              questions.push(`${datasetName}에서 "${sampleValue}" 관련 데이터 찾아줘`);
            }
          }
          
          // Only add if we have meaningful questions (more than just count/sample)
          if (questions.length >= 2) {
            datasetQuestions.push({
              datasetName,
              questions: questions.slice(0, 4) // Limit to 4 questions per dataset
            });
          }
        } catch (parseErr) {
          console.error("Failed to parse column info for dataset:", dataset.id, parseErr);
        }
      }
      
      res.json({
        questions: defaultQueries,
        datasetQuestions
      });
    } catch (err) {
      console.error("Sample questions error:", err);
      res.status(500).json({ message: "Failed to generate sample questions" });
    }
  });

  // Delete dataset
  app.delete("/api/datasets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get dataset to check for DuckDB table
      const [dataset] = await db.select().from(datasets).where(eq(datasets.id, id)).limit(1);
      
      if (!dataset) {
        return res.status(404).json({ message: "Dataset not found" });
      }
      
      // Drop DuckDB table if it exists
      if (dataset.duckdbTable) {
        try {
          await duckdbService.dropDatasetTable(dataset.duckdbTable);
        } catch (duckErr) {
          console.error("Failed to drop DuckDB table:", duckErr);
        }
      }
      
      // Delete from PostgreSQL (cascade will delete related data)
      await db.delete(datasets).where(eq(datasets.id, id));

      res.json({ message: "Dataset deleted successfully" });
    } catch (err) {
      console.error("Delete dataset error:", err);
      res.status(500).json({ message: "Failed to delete dataset" });
    }
  });

  // === Knowledge Base (RAG) API ===

  // List all knowledge documents
  app.get("/api/knowledge-base/documents", async (req, res) => {
    try {
      const docs = await db.select().from(knowledgeDocuments).orderBy(desc(knowledgeDocuments.createdAt));
      res.json(docs);
    } catch (err) {
      console.error("Get knowledge documents error:", err);
      res.status(500).json({ message: "Failed to get documents" });
    }
  });

  // Get knowledge base stats
  app.get("/api/knowledge-base/stats", async (req, res) => {
    try {
      const stats = await ragService.getDocumentStats();
      res.json(stats);
    } catch (err) {
      console.error("Get knowledge stats error:", err);
      res.status(500).json({ message: "Failed to get stats" });
    }
  });

  // Upload documents (multi-file support)
  app.post("/api/knowledge-base/upload", knowledgeUpload.array('files', 50), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "파일이 업로드되지 않았습니다" });
      }

      // Check total size limit (500MB)
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > 500 * 1024 * 1024) {
        return res.status(400).json({ message: "총 파일 크기가 500MB를 초과합니다" });
      }

      const results: any[] = [];
      const errors: any[] = [];

      for (const file of files) {
        try {
          // Decode filename for proper Korean support
          const decodedFilename = decodeFilename(file.originalname);
          
          // Validate file type
          if (!documentParser.isValidFileType(decodedFilename)) {
            errors.push({
              fileName: decodedFilename,
              error: "지원하지 않는 파일 형식입니다 (PDF, DOC, DOCX, PPT, PPTX만 가능)"
            });
            continue;
          }

          // Create document record
          const [newDoc] = await db.insert(knowledgeDocuments).values({
            name: decodedFilename.replace(/\.[^/.]+$/, ''),
            fileName: decodedFilename,
            fileType: documentParser.getFileType(decodedFilename),
            fileSize: file.size,
            status: 'processing',
          }).returning();

          // Process document asynchronously
          processDocument(newDoc.id, file.buffer, decodedFilename).catch(err => {
            console.error(`Failed to process document ${newDoc.id}:`, err);
          });

          results.push({
            id: newDoc.id,
            fileName: decodedFilename,
            status: 'processing'
          });
        } catch (fileErr: any) {
          errors.push({
            fileName: decodeFilename(file.originalname),
            error: fileErr.message
          });
        }
      }

      res.json({
        success: results.length > 0,
        uploaded: results,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (err) {
      console.error("Knowledge upload error:", err);
      res.status(500).json({ message: "파일 업로드에 실패했습니다" });
    }
  });

  // RAG query endpoint
  app.post("/api/rag/query", async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "질문을 입력해주세요" });
      }

      const result = await ragService.queryRag(query);
      res.json(result);
    } catch (err) {
      console.error("RAG query error:", err);
      res.status(500).json({ message: "질문 처리에 실패했습니다" });
    }
  });

  // Search documents
  app.post("/api/knowledge-base/search", async (req, res) => {
    try {
      const { query, topK = 5 } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "검색어를 입력해주세요" });
      }

      const searchContext = await ragService.hybridSearch(query, topK);
      res.json(searchContext);
    } catch (err) {
      console.error("Knowledge search error:", err);
      res.status(500).json({ message: "검색에 실패했습니다" });
    }
  });

  // Delete knowledge document
  app.delete("/api/knowledge-base/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      const [doc] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).limit(1);
      
      if (!doc) {
        return res.status(404).json({ message: "문서를 찾을 수 없습니다" });
      }

      // Delete chunks first (cascade should handle this, but explicit)
      await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
      
      // Delete document
      await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));

      res.json({ message: "문서가 삭제되었습니다" });
    } catch (err) {
      console.error("Delete knowledge document error:", err);
      res.status(500).json({ message: "문서 삭제에 실패했습니다" });
    }
  });

  // RAG Model Management APIs
  
  // Get all RAG models
  app.get("/api/rag/models", async (req, res) => {
    try {
      const models = ragService.getRagModels();
      res.json({ models });
    } catch (err) {
      console.error("Get RAG models error:", err);
      res.status(500).json({ message: "모델 목록을 가져오는데 실패했습니다" });
    }
  });

  // Update all RAG models (for batch updates)
  app.put("/api/rag/models", async (req, res) => {
    try {
      const { models } = req.body;
      if (!Array.isArray(models)) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      ragService.setRagModels(models);
      res.json({ models: ragService.getRagModels() });
    } catch (err) {
      console.error("Update RAG models error:", err);
      res.status(500).json({ message: "모델 업데이트에 실패했습니다" });
    }
  });

  // Toggle RAG model enabled/disabled
  app.patch("/api/rag/models/:id/toggle", async (req, res) => {
    try {
      const modelId = decodeURIComponent(req.params.id);
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "enabled 값이 필요합니다" });
      }
      
      const models = ragService.toggleRagModel(modelId, enabled);
      res.json({ models });
    } catch (err) {
      console.error("Toggle RAG model error:", err);
      res.status(500).json({ message: "모델 토글에 실패했습니다" });
    }
  });

  // Add new RAG model
  app.post("/api/rag/models", async (req, res) => {
    try {
      const { id, name } = req.body;
      
      if (!id || !name) {
        return res.status(400).json({ message: "모델 ID와 이름이 필요합니다" });
      }
      
      const models = ragService.addRagModel(id, name);
      res.json({ models });
    } catch (err) {
      console.error("Add RAG model error:", err);
      res.status(500).json({ message: "모델 추가에 실패했습니다" });
    }
  });

  // Remove RAG model
  app.delete("/api/rag/models/:id", async (req, res) => {
    try {
      const modelId = decodeURIComponent(req.params.id);
      const models = ragService.removeRagModel(modelId);
      res.json({ models });
    } catch (err) {
      console.error("Remove RAG model error:", err);
      res.status(500).json({ message: "모델 삭제에 실패했습니다" });
    }
  });

  // Ollama API Endpoints
  
  // Get Ollama configuration
  app.get("/api/ollama/config", async (req, res) => {
    try {
      const config = ollamaService.getOllamaConfig();
      const ollamaModel = ragService.getOllamaModel();
      res.json({ ...config, model: ollamaModel });
    } catch (err) {
      console.error("Get Ollama config error:", err);
      res.status(500).json({ message: "Ollama 설정을 가져오는데 실패했습니다" });
    }
  });

  // Update Ollama configuration
  app.put("/api/ollama/config", async (req, res) => {
    try {
      const { baseUrl, enabled, model } = req.body;
      
      if (baseUrl !== undefined && enabled !== undefined) {
        ollamaService.setOllamaConfig(baseUrl, enabled);
      }
      
      if (model) {
        ragService.setOllamaModel(model);
      }
      
      const config = ollamaService.getOllamaConfig();
      const ollamaModel = ragService.getOllamaModel();
      res.json({ ...config, model: ollamaModel });
    } catch (err) {
      console.error("Update Ollama config error:", err);
      res.status(500).json({ message: "Ollama 설정 업데이트에 실패했습니다" });
    }
  });

  // Check Ollama connection
  app.get("/api/ollama/status", async (req, res) => {
    try {
      const status = await ollamaService.checkOllamaConnection();
      res.json(status);
    } catch (err) {
      console.error("Ollama status check error:", err);
      res.status(500).json({ connected: false, error: "연결 확인 실패" });
    }
  });

  // List Ollama models
  app.get("/api/ollama/models", async (req, res) => {
    try {
      const result = await ollamaService.listOllamaModels();
      res.json(result);
    } catch (err) {
      console.error("List Ollama models error:", err);
      res.status(500).json({ models: [], error: "모델 목록 조회 실패" });
    }
  });

  // Get recommended Ollama models for low-spec systems
  app.get("/api/ollama/recommended-models", async (req, res) => {
    res.json({ models: ollamaService.RECOMMENDED_OLLAMA_MODELS });
  });

  return httpServer;
}

// Async document processing function
async function processDocument(docId: number, buffer: Buffer, fileName: string): Promise<void> {
  try {
    // Parse document
    const parsed = await documentParser.parseDocument(buffer, fileName, '');
    
    // Update document with page count
    await db.update(knowledgeDocuments)
      .set({ 
        pageCount: parsed.pageCount,
        hasOcr: parsed.hasOcr,
      })
      .where(eq(knowledgeDocuments.id, docId));

    // Chunk the text
    const chunks = documentParser.chunkText(parsed.text, {
      chunkSize: 500,
      chunkOverlap: 50,
    });

    if (chunks.length === 0) {
      await db.update(knowledgeDocuments)
        .set({ 
          status: 'error',
          errorMessage: '문서에서 텍스트를 추출할 수 없습니다',
        })
        .where(eq(knowledgeDocuments.id, docId));
      return;
    }

    // Insert chunks (keyword-based search, no embedding needed)
    for (let i = 0; i < chunks.length; i++) {
      await db.insert(documentChunks).values({
        documentId: docId,
        chunkIndex: i,
        content: chunks[i],
        pageNumber: Math.floor((i / chunks.length) * parsed.pageCount) + 1,
        embedding: null,
      });
    }

    // Update document status
    await db.update(knowledgeDocuments)
      .set({ 
        status: 'ready',
        chunkCount: chunks.length,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, docId));

    console.log(`Document ${docId} processed successfully: ${chunks.length} chunks`);
  } catch (error: any) {
    console.error(`Document ${docId} processing error:`, error);
    await db.update(knowledgeDocuments)
      .set({ 
        status: 'error',
        errorMessage: error.message || '문서 처리 중 오류가 발생했습니다',
      })
      .where(eq(knowledgeDocuments.id, docId));
  }
}
