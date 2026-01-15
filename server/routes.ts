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

const MODEL = "mistralai/mistral-7b-instruct:free"; // Lightweight free model for low-spec systems

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Initialize seed data
  await storage.seed();

  // Get database tables info
  app.get("/api/tables", async (req, res) => {
    try {
      const tables = [
        {
          name: "products",
          columns: ["id", "name", "category", "price", "stock", "description"],
          rowCount: 0
        },
        {
          name: "sales",
          columns: ["id", "product_id", "quantity", "total_price", "sale_date"],
          rowCount: 0
        }
      ];

      // Get row counts
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

      // 1. Generate SQL
      const schemaDescription = `
Tables:
- products (id, name, category, price, stock, description)
- sales (id, product_id, quantity, total_price, sale_date)

Relationships:
- sales.product_id references products.id
`;

      const systemPrompt = `You are a SQL expert assistant. Your ONLY job is to convert natural language questions (in Korean or English) into valid PostgreSQL queries.

Database Schema:
${schemaDescription}

RULES:
1. Output ONLY the SQL query, nothing else. No explanations, no markdown.
2. Use exact table and column names from the schema.
3. For price-related queries, use ORDER BY price DESC or ASC.
4. Always use LIMIT when asked for "top N" or "가장" queries.

Examples:
- "가장 비싼 제품 5개" → SELECT * FROM products ORDER BY price DESC LIMIT 5
- "Show top 3 products by stock" → SELECT * FROM products ORDER BY stock DESC LIMIT 3
- "모든 제품 보여줘" → SELECT * FROM products
- "총 매출액" → SELECT SUM(total_price) as total_sales FROM sales
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

      let generatedSql = completion.choices[0]?.message?.content || "";
      
      // Clean up SQL if it contains markdown or extra text
      generatedSql = generatedSql.replace(/```sql/gi, "").replace(/```/g, "").trim();
      // Extract just the SQL if there's extra text
      const sqlMatch = generatedSql.match(/SELECT[\s\S]*?(?:;|$)/i);
      if (sqlMatch) {
        generatedSql = sqlMatch[0].replace(/;$/, '');
      }

      console.log("Generated SQL:", generatedSql);

      // Check if SQL is empty or invalid
      if (!generatedSql || !generatedSql.toLowerCase().startsWith('select')) {
        console.log("Empty or invalid SQL generated, attempting fallback");
        // Try a simpler fallback
        if (message.includes('제품') || message.includes('product')) {
          generatedSql = 'SELECT * FROM products ORDER BY price DESC LIMIT 10';
        } else if (message.includes('판매') || message.includes('sale')) {
          generatedSql = 'SELECT * FROM sales ORDER BY sale_date DESC LIMIT 10';
        } else {
          generatedSql = 'SELECT * FROM products LIMIT 10';
        }
        console.log("Fallback SQL:", generatedSql);
      }

      // 2. Execute SQL
      let queryResult;
      try {
        const result = await db.execute(sql.raw(generatedSql));
        queryResult = result.rows;
      } catch (dbError: any) {
        console.error("Database execution error:", dbError);
        return res.status(200).json({
          answer: "쿼리를 실행할 수 없습니다. 질문을 다시 확인해 주세요.",
          sql: generatedSql,
          data: [],
          error: dbError.message
        });
      }

      // 3. Generate Natural Language Answer
      const summaryPrompt = `
사용자 질문: "${message}"
실행된 SQL 쿼리: "${generatedSql}"
반환된 데이터: ${JSON.stringify(queryResult.slice(0, 10))} ${(queryResult.length > 10 ? "...(추가 행 있음)" : "")}

작업: 반환된 데이터를 기반으로 사용자의 질문에 간결하고 친근하게 한국어로 답변해 주세요.
데이터가 비어 있으면 정중하게 알려주세요.
SQL이나 기술적인 세부 사항은 언급하지 말고 사실만 전달하세요.
`;

      const summaryCompletion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "당신은 친절한 데이터 어시스턴트입니다. 간결하게 한국어로 답변하세요." },
          { role: "user", content: summaryPrompt },
        ],
        max_tokens: 512, // Limit tokens for faster response
      });

      const answer = summaryCompletion.choices[0]?.message?.content || "결과입니다.";

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
