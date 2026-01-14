import { 
  emails, 
  importLogs,
  type Email, 
  type InsertEmail,
  type ImportLog,
  type InsertImportLog,
  type SearchResult,
  type Stats,
  users,
  type User,
  type InsertUser,
  conversations,
  type Conversation,
  type InsertConversation,
  messages,
  type Message,
  type InsertMessage,
  calendarEvents,
  type CalendarEvent,
  type InsertCalendarEvent,
  appSettings,
  ragChunks,
  type RagChunk,
  type InsertRagChunk,
} from "@shared/schema";
import { db } from "./db";
import { eq, or, ilike, desc, sql } from "drizzle-orm";
import { cosineSimilarity } from "./ollama";


export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getEmailsCount(): Promise<number>;
  getLastImport(): Promise<ImportLog | undefined>;
  getStats(): Promise<Stats>;
  
  insertEmail(email: InsertEmail): Promise<Email>;
  insertEmails(emails: InsertEmail[]): Promise<number>;
  insertEmailsAndGetIds(emails: InsertEmail[]): Promise<Email[]>;
  getEmailById(id: number): Promise<Email | undefined>;
  getAllEmails(limit?: number): Promise<Email[]>;
  getUnprocessedEmails(): Promise<Email[]>;
  updateEmailClassification(id: number, classification: string, confidence: string): Promise<void>;
  markEmailProcessed(id: number): Promise<void>;
  searchEmailsBm25(query: string, topK: number): Promise<SearchResult[]>;
  searchEventsByKeyword(keyword: string): Promise<Array<{
  id: number;
  title: string;
  startDate: string;
  endDate: string | null;
}>>;

  searchEmails(query: string, topK: number): Promise<SearchResult[]>;
  
  logImport(log: InsertImportLog): Promise<ImportLog>;
  
  createConversation(conv: InsertConversation): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getConversations(): Promise<Conversation[]>;
  
  addMessage(msg: InsertMessage): Promise<Message>;
  getMessages(conversationId: number): Promise<Message[]>;
  
  addCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  getCalendarEvents(): Promise<CalendarEvent[]>;
  getCalendarEventsByEmailId(emailId: number): Promise<CalendarEvent[]>;
  clearCalendarEvents(): Promise<number>;
  
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, value: string): Promise<void>;

  addEmailAttachments(emailId: number, attachments: InsertEmailAttachment[]): Promise<number>;
  getEmailAttachments(emailId: number): Promise<EmailAttachment[]>;
  getEmailAttachmentById(id: number): Promise<EmailAttachment | undefined>;

  saveRagChunks(chunks: InsertRagChunk[]): Promise<number>;
  searchRagChunks(queryEmbedding: number[], topK: number): Promise<Array<{ chunk: RagChunk; similarity: number }>>;
  clearRagChunks(): Promise<number>;
  getRagChunkCount(): Promise<number>;
  getRagChunksByEmailId(emailId: number): Promise<RagChunk[]>;
}

export interface InsertEmailAttachment {
  filename: string;
  relPath: string;
  size: number;
  mime?: string | null;
  originalName?: string | null;
}

export interface EmailAttachment {
  id: number;
  emailId: number;
  filename: string;
  relPath: string;
  size: number;
  mime: string | null;
  originalName: string | null;
  createdAt: string;
}

function tokenize(query: string): string[] {
  return (query || "").trim().split(/\s+/).filter(t => t.length > 0);
}

function scoreText(text: string, tokens: string[]): number {
  if (!text || tokens.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const regex = new RegExp(token.toLowerCase(), 'gi');
    const matches = lower.match(regex);
    if (matches) {
      score += matches.length;
    }
  }
  return score;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getEmailsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(emails);
    return result[0]?.count ?? 0;
  }

  async getLastImport(): Promise<ImportLog | undefined> {
    const [log] = await db
      .select()
      .from(importLogs)
      .orderBy(desc(importLogs.createdAt))
      .limit(1);
    return log || undefined;
  }

  async getStats(): Promise<Stats> {
    const count = await this.getEmailsCount();
    const lastImport = await this.getLastImport();
    
    return {
      mode: "PostgreSQL",
      emailsCount: count,
      lastImport: lastImport?.createdAt?.toISOString() ?? null,
    };
  }
  // server/storage.ts (DatabaseStorage 내부)

private bm25Rank(docs: Array<{ id: number; text: string }>, queryTokens: string[]) {
  const k1 = 1.2;
  const b = 0.75;

  const N = docs.length;
  const df = new Map<string, number>();
  const docTokens = docs.map(d => tokenize(d.text.toLowerCase()));

  // df 계산
  // df 계산
for (const docTok of docTokens) {
  const uniq = Array.from(new Set<string>(docTok));
  for (const t of uniq) {
    df.set(t, (df.get(t) || 0) + 1);
  }
}



  const avgdl = docTokens.reduce((s, t) => s + t.length, 0) / Math.max(1, N);

  const scores = docs.map((doc, i) => {
    const tokens = docTokens[i];
    const dl = tokens.length;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    let score = 0;
    for (const q of queryTokens) {
      const f = tf.get(q.toLowerCase()) || 0;
      if (f === 0) continue;

      const n = df.get(q.toLowerCase()) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const denom = f + k1 * (1 - b + b * (dl / Math.max(1e-6, avgdl)));
      score += idf * (f * (k1 + 1)) / denom;
    }
    return { id: doc.id, score };
  });

  return scores;
}
async searchEventsByKeyword(keyword: string) {
  const q = `%${keyword}%`;

  return await db
  .select({
    id: calendarEvents.id,
    title: calendarEvents.title,
    startDate: calendarEvents.startDate,
    endDate: calendarEvents.endDate,
  })
  .from(calendarEvents)
  .where(
    or(
      ilike(calendarEvents.title, q),
      ilike(calendarEvents.description, q)
    )
  )
  .orderBy(calendarEvents.startDate)
  .limit(5);

}


async searchEmailsBm25(query: string, topK: number): Promise<SearchResult[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  // 규모가 큰 경우를 대비해 상한을 둡니다(필요 시 조정)
  const candidates = await db.select().from(emails).limit(3000);

  const docs = candidates.map(e => ({
    id: e.id,
    text: `${e.subject || ""} ${e.sender || ""} ${e.body || ""}`.toLowerCase()
  }));

  const scored = this.bm25Rank(docs, tokens)
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, topK));

  const idSet = new Set(scored.map(s => s.id));
  const scoreMap = new Map(scored.map(s => [s.id, s.score]));

  const picked = candidates.filter(e => idSet.has(e.id));

  // SearchResult로 변환
  const results: SearchResult[] = picked.map(e => ({
    mailId: String(e.id),
    subject: e.subject || "",
    sender: e.sender || null,
    date: e.date || null,
    body: e.body || "",
    attachments: [],
    score: scoreMap.get(e.id) || 0,
  }));

  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return results;
}


  async insertEmail(email: InsertEmail): Promise<Email> {
    const [inserted] = await db.insert(emails).values(email).returning();
    return inserted;
  }

  async insertEmails(emailsToInsert: InsertEmail[]): Promise<number> {
    if (emailsToInsert.length === 0) return 0;
    
    const batchSize = 100;
    let inserted = 0;
    
    await db.transaction(async (tx) => {
      for (let i = 0; i < emailsToInsert.length; i += batchSize) {
        const batch = emailsToInsert.slice(i, i + batchSize);
        await tx.insert(emails).values(batch);
        inserted += batch.length;
      }
    });
    
    return inserted;
  }

  async searchEmails(query: string, topK: number): Promise<SearchResult[]> {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const searchPattern = `%${query}%`;
    
    const results = await db
      .select()
      .from(emails)
      .where(
        or(
          ilike(emails.subject, searchPattern),
          ilike(emails.body, searchPattern),
          ilike(emails.sender, searchPattern),
          ilike(emails.date, searchPattern)
        )
      )
      .limit(100);

    const scored: SearchResult[] = results.map(email => {
      const textToScore = `${email.subject} ${email.body}`;
      const score = scoreText(textToScore, tokens);
      
      return {
        mailId: String(email.id),
        subject: email.subject || "(제목 없음)",
        score,
        sender: email.sender || null,
        date: email.date || null,
        body: email.body || "",
        attachments: [],
      };
    }).filter(r => r.score > 0);

    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, Math.max(1, topK));
  }

  async logImport(log: InsertImportLog): Promise<ImportLog> {
    const [inserted] = await db.insert(importLogs).values(log).returning();
    return inserted;
  }

  async getEmailById(id: number): Promise<Email | undefined> {
    const [email] = await db.select().from(emails).where(eq(emails.id, id));
    return email || undefined;
  }

  async createConversation(conv: InsertConversation): Promise<Conversation> {
    const [inserted] = await db.insert(conversations).values(conv).returning();
    return inserted;
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv || undefined;
  }

  async getConversations(): Promise<Conversation[]> {
    return await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  }

  async addMessage(msg: InsertMessage): Promise<Message> {
    const [inserted] = await db.insert(messages).values(msg).returning();
    await db.update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, msg.conversationId));
    return inserted;
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async addCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const [inserted] = await db.insert(calendarEvents).values(event).returning();
    return inserted;
  }

  async getCalendarEvents(): Promise<CalendarEvent[]> {
    return await db.select().from(calendarEvents).orderBy(desc(calendarEvents.createdAt));
  }

  async getCalendarEventsByEmailId(emailId: number): Promise<CalendarEvent[]> {
    return await db.select().from(calendarEvents)
      .where(eq(calendarEvents.emailId, emailId))
      .orderBy(desc(calendarEvents.createdAt));
  }

  async clearCalendarEvents(): Promise<number> {
    const result: any = await db.delete(calendarEvents);
    return typeof result?.rowCount === "number" ? result.rowCount : 0;
  }

  async insertEmailsAndGetIds(emailsToInsert: InsertEmail[]): Promise<Email[]> {
    if (emailsToInsert.length === 0) return [];
    
    const batchSize = 100;
    const allInserted: Email[] = [];
    
    await db.transaction(async (tx) => {
      for (let i = 0; i < emailsToInsert.length; i += batchSize) {
        const batch = emailsToInsert.slice(i, i + batchSize);
        const inserted = await tx.insert(emails).values(batch).returning();
        allInserted.push(...inserted);
      }
    });
    
    return allInserted;
  }

  async getAllEmails(limit: number = 1000): Promise<Email[]> {
    return await db.select().from(emails).orderBy(desc(emails.createdAt)).limit(limit);
  }

  async getUnprocessedEmails(): Promise<Email[]> {
    return await db.select().from(emails)
      .where(eq(emails.isProcessed, "false"))
      .orderBy(emails.createdAt);
  }

  async updateEmailClassification(id: number, classification: string, confidence: string): Promise<void> {
    await db.update(emails)
      .set({ classification, classificationConfidence: confidence })
      .where(eq(emails.id, id));
  }

  async markEmailProcessed(id: number): Promise<void> {
    await db.update(emails)
      .set({ isProcessed: "true" })
      .where(eq(emails.id, id));
  }

  async getAppSetting(key: string): Promise<string | null> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return setting?.value ?? null;
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    const existing = await this.getAppSetting(key);
    if (existing !== null) {
      await db.update(appSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value });
    }
  }

  async addEmailAttachments(_emailId: number, _attachments: InsertEmailAttachment[]): Promise<number> {
    return 0;
  }

  async getEmailAttachments(_emailId: number): Promise<EmailAttachment[]> {
    return [];
  }

  async getEmailAttachmentById(_id: number): Promise<EmailAttachment | undefined> {
    return undefined;
  }

  async saveRagChunks(chunks: InsertRagChunk[]): Promise<number> {
    if (chunks.length === 0) return 0;
    
    const batchSize = 50;
    let inserted = 0;
    
    await db.transaction(async (tx) => {
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await tx.insert(ragChunks).values(batch);
        inserted += batch.length;
      }
    });
    
    return inserted;
  }

  async searchRagChunks(queryEmbedding: number[], topK: number): Promise<Array<{ chunk: RagChunk; similarity: number }>> {
    const allChunks = await db.select().from(ragChunks);
    
    const results = allChunks.map(chunk => {
      const embedding = JSON.parse(chunk.embedding) as number[];
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return { chunk, similarity };
    });
    
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  async clearRagChunks(): Promise<number> {
    const countBefore = await this.getRagChunkCount();
    await db.delete(ragChunks);
    return countBefore;
  }

  async getRagChunkCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(ragChunks);
    return result[0]?.count ?? 0;
  }

  async getRagChunksByEmailId(emailId: number): Promise<RagChunk[]> {
    return await db.select().from(ragChunks).where(eq(ragChunks.emailId, emailId));
  }
}

import { LocalSQLiteStorage } from "./local-storage";

const DATA_DIR = process.env.DATA_DIR || "";
const STORAGE_MODE = process.env.STORAGE_MODE || "postgresql";

function createStorage(): IStorage {
  if (STORAGE_MODE === "local" && DATA_DIR) {
    console.log(`Using local SQLite storage at: ${DATA_DIR}`);
    return new LocalSQLiteStorage(DATA_DIR);
  }
  console.log("Using PostgreSQL database storage");
  return new DatabaseStorage();
}

export const storage = createStorage();
