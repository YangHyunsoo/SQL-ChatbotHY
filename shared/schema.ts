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

// === DATASETS (CSV Upload with Structured/Unstructured Support) ===

export const datasets = pgTable("datasets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  dataType: text("data_type").notNull(), // 'structured' or 'unstructured'
  rowCount: integer("row_count").notNull().default(0),
  columnInfo: text("column_info"), // JSON string of column metadata for structured data
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// For structured data: dynamically typed columns stored as JSONB
export const structuredData = pgTable("structured_data", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").references(() => datasets.id, { onDelete: "cascade" }),
  rowIndex: integer("row_index").notNull(),
  data: text("data").notNull(), // JSON string of row data with typed values
});

// For unstructured data: flexible JSONB storage with text search support
export const unstructuredData = pgTable("unstructured_data", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").references(() => datasets.id, { onDelete: "cascade" }),
  rowIndex: integer("row_index").notNull(),
  rawContent: text("raw_content"), // Original text content
  metadata: text("metadata"), // JSON string of extracted metadata
  searchText: text("search_text"), // Normalized text for search
});

export const datasetsRelations = relations(datasets, ({ many }) => ({
  structuredRows: many(structuredData),
  unstructuredRows: many(unstructuredData),
}));

export const structuredDataRelations = relations(structuredData, ({ one }) => ({
  dataset: one(datasets, {
    fields: [structuredData.datasetId],
    references: [datasets.id],
  }),
}));

export const unstructuredDataRelations = relations(unstructuredData, ({ one }) => ({
  dataset: one(datasets, {
    fields: [unstructuredData.datasetId],
    references: [datasets.id],
  }),
}));

export const insertDatasetSchema = createInsertSchema(datasets).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export const insertStructuredDataSchema = createInsertSchema(structuredData).omit({ id: true });
export const insertUnstructuredDataSchema = createInsertSchema(unstructuredData).omit({ id: true });

export type Dataset = typeof datasets.$inferSelect;
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type StructuredDataRow = typeof structuredData.$inferSelect;
export type UnstructuredDataRow = typeof unstructuredData.$inferSelect;

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

export interface DatasetUploadRequest {
  name: string;
  dataType: 'structured' | 'unstructured';
  description?: string;
}

export interface ColumnInfo {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  nullable: boolean;
  sampleValues: string[];
}
