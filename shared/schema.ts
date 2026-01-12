import { pgTable, text, serial, integer, numeric, timestamp, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

// Import chat models from the integration
export * from "./models/chat";

// === USERS (Restored) ===
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// === SAMPLE BUSINESS DATA FOR SQL CHATBOT ===

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: numeric("price").notNull(),
  stock: integer("stock").notNull(),
  description: text("description"),
});

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id),
  quantity: integer("quantity").notNull(),
  totalPrice: numeric("total_price").notNull(),
  saleDate: timestamp("sale_date").defaultNow(),
});

export const productsRelations = relations(products, ({ many }) => ({
  sales: many(sales),
}));

export const salesRelations = relations(sales, ({ one }) => ({
  product: one(products, {
    fields: [sales.productId],
    references: [products.id],
  }),
}));

// === SCHEMAS ===

export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertSaleSchema = createInsertSchema(sales).omit({ id: true, saleDate: true });

export type Product = typeof products.$inferSelect;
export type Sale = typeof sales.$inferSelect;

// === API TYPES ===

export interface SqlChatRequest {
  message: string;
}

export interface SqlChatResponse {
  answer: string;
  sql: string;
  data: any[];
  error?: string;
}
