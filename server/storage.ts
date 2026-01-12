import { 
  users, products, sales, conversations, messages,
  type User, type InsertUser,
  type Product, type Sale,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Products & Sales (Business Data)
  getProducts(): Promise<Product[]>;
  createProduct(product: Omit<Product, "id">): Promise<Product>;
  getSales(): Promise<Sale[]>;
  createSale(sale: Omit<Sale, "id" | "saleDate">): Promise<Sale>;
  
  // Chat
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;

  // Seed
  seed(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Business Data
  async getProducts(): Promise<Product[]> {
    return db.select().from(products);
  }

  async createProduct(product: Omit<Product, "id">): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async getSales(): Promise<Sale[]> {
    return db.select().from(sales);
  }

  async createSale(sale: Omit<Sale, "id" | "saleDate">): Promise<Sale> {
    const [newSale] = await db.insert(sales).values(sale).returning();
    return newSale;
  }

  // Chat
  async getAllConversations(): Promise<Conversation[]> {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  }

  async createConversation(title: string): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values({ title }).returning();
    return conversation;
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    return db.select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async seed() {
    const existingProducts = await this.getProducts();
    if (existingProducts.length === 0) {
      console.log("Seeding database...");
      
      const p1 = await this.createProduct({
        name: "Laptop Pro",
        category: "Electronics",
        price: "1299.99",
        stock: 50,
        description: "High performance laptop",
      });
      
      const p2 = await this.createProduct({
        name: "Wireless Mouse",
        category: "Accessories",
        price: "29.99",
        stock: 200,
        description: "Ergonomic wireless mouse",
      });

      const p3 = await this.createProduct({
        name: "4K Monitor",
        category: "Electronics",
        price: "399.99",
        stock: 30,
        description: "32-inch 4K display",
      });

      const p4 = await this.createProduct({
        name: "Office Chair",
        category: "Furniture",
        price: "199.99",
        stock: 15,
        description: "Comfortable mesh chair",
      });

      // Add some sales
      await this.createSale({ productId: p1.id, quantity: 1, totalPrice: "1299.99" });
      await this.createSale({ productId: p2.id, quantity: 2, totalPrice: "59.98" });
      await this.createSale({ productId: p3.id, quantity: 1, totalPrice: "399.99" });
      await this.createSale({ productId: p2.id, quantity: 1, totalPrice: "29.99" });
      
      console.log("Database seeded!");
    }
  }
}

export const storage = new DatabaseStorage();
