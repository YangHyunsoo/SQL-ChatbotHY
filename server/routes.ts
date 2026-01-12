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

const MODEL = "mistralai/mistral-small-24b-instruct-2501"; // Or generic "mistralai/mistral-7b-instruct"

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Initialize seed data
  await storage.seed();

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

      const systemPrompt = `You are a SQL expert. 
Your task is to convert the user's natural language question into a VALID PostgreSQL query.
Use the following schema:
${schemaDescription}

Rules:
1. Return ONLY the raw SQL query. Do not include markdown formatting (like \`\`\`sql), explanations, or anything else.
2. If the user asks for "top selling" or similar, aggregate by product_id and join with products table.
3. Ensure all table and column names match the schema exactly.
4. Use standard PostgreSQL syntax.
`;

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0, // Low temperature for deterministic code generation
      });

      let generatedSql = completion.choices[0]?.message?.content || "";
      
      // Clean up SQL if it contains markdown
      generatedSql = generatedSql.replace(/```sql/g, "").replace(/```/g, "").trim();

      console.log("Generated SQL:", generatedSql);

      // 2. Execute SQL
      let queryResult;
      try {
        const result = await db.execute(sql.raw(generatedSql));
        queryResult = result.rows;
      } catch (dbError: any) {
        console.error("Database execution error:", dbError);
        return res.status(200).json({
          answer: "I couldn't execute the query. Please verify your question.",
          sql: generatedSql,
          data: [],
          error: dbError.message
        });
      }

      // 3. Generate Natural Language Answer
      const summaryPrompt = `
User Question: "${message}"
SQL Query Executed: "${generatedSql}"
Data Returned: ${JSON.stringify(queryResult.slice(0, 10))} ${(queryResult.length > 10 ? "...(more rows)" : "")}

Task: Provide a concise, friendly answer to the user's question based on the data returned. 
If the data is empty, say so politely.
Do not mention the SQL or technical details in the answer, just the facts.
`;

      const summaryCompletion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a helpful data assistant." },
          { role: "user", content: summaryPrompt },
        ],
      });

      const answer = summaryCompletion.choices[0]?.message?.content || "Here are the results.";

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
