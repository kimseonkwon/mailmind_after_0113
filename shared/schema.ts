import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const emails = pgTable("emails", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull().default(""),
  sender: text("sender").notNull().default(""),
  date: text("date").notNull().default(""),
  body: text("body").notNull().default(""),
  importance: text("importance"),
  label: text("label"),
  classification: text("classification"),
  classificationConfidence: text("classification_confidence"),
  isProcessed: text("is_processed").default("false"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailSchema = createInsertSchema(emails).omit({
  id: true,
  createdAt: true,
});

export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type Email = typeof emails.$inferSelect;

export const importLogs = pgTable("import_logs", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  emailsImported: serial("emails_imported").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertImportLogSchema = createInsertSchema(importLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertImportLog = z.infer<typeof insertImportLogSchema>;
export type ImportLog = typeof importLogs.$inferSelect;

export const searchResultSchema = z.object({
  mailId: z.string(),
  subject: z.string(),
  score: z.number(),
  sender: z.string().nullable(),
  date: z.string().nullable(),
  body: z.string(),
  attachments: z.array(z.string()).optional(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

export const statsSchema = z.object({
  mode: z.string(),
  emailsCount: z.number(),
  lastImport: z.string().nullable(),
});

export type Stats = z.infer<typeof statsSchema>;

export const chatRequestSchema = z.object({
  message: z.string().min(1, "검색어를 입력해주세요"),
  topK: z.number().min(1).max(50).default(10),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(searchResultSchema),
  debug: z.object({
    topK: z.number(),
    hitsCount: z.number(),
  }).optional(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const importResultSchema = z.object({
  ok: z.boolean(),
  inserted: z.number(),
  message: z.string().optional(),
});

export type ImportResult = z.infer<typeof importResultSchema>;

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

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("새 대화"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id"),
  title: text("title").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  location: text("location"),
  description: text("description"),
  shipNumber: text("ship_number"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;

export const extractedEventSchema = z.object({
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

export const aiChatRequestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.number().optional(),
});

export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;

export const aiChatResponseSchema = z.object({
  response: z.string(),
  conversationId: z.number(),
});

export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;

export const eventExtractionRequestSchema = z.object({
  emailId: z.number(),
});

export type EventExtractionRequest = z.infer<typeof eventExtractionRequestSchema>;

export const eventExtractionResponseSchema = z.object({
  events: z.array(extractedEventSchema),
  emailId: z.number(),
});

export type EventExtractionResponse = z.infer<typeof eventExtractionResponseSchema>;

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;

export const emailClassificationSchema = z.enum([
  "task", "meeting", "approval", "notice"
]);

export type EmailClassificationType = z.infer<typeof emailClassificationSchema>;

export const importWithProcessingResultSchema = z.object({
  ok: z.boolean(),
  inserted: z.number(),
  classified: z.number(),
  eventsExtracted: z.number(),
  message: z.string().optional(),
});

export type ImportWithProcessingResult = z.infer<typeof importWithProcessingResultSchema>;
