import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type {
  Email,
  InsertEmail,
  ImportLog,
  InsertImportLog,
  SearchResult,
  Stats,
  User,
  InsertUser,
  Conversation,
  InsertConversation,
  Message,
  InsertMessage,
  CalendarEvent,
  InsertCalendarEvent,
  SearchFilters,
} from "@shared/schema";
import type { IStorage, InsertEmailAttachment, EmailAttachment } from "./storage";
import type { InsertRagChunk, RagChunk } from "@shared/schema";
import { cosineSimilarity } from "./ollama";

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

export class LocalSQLiteStorage implements IStorage {
  private db: Database.Database;
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'emails.db');
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL DEFAULT '',
        sender TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        importance TEXT,
        label TEXT,
        classification TEXT,
        classification_confidence TEXT,
        is_processed TEXT DEFAULT 'false',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS import_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        emails_imported INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '새 대화',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id INTEGER,
        title TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        location TEXT,
        description TEXT,
        ship_number TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS email_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        rel_path TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        mime TEXT,
        original_name TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS rag_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        embedding TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  getDataDir(): string {
    return this.dataDir;
  }
  async searchEmailsBm25(
  query: string,
  topK: number
): Promise<SearchResult[]> {
  // SQLite 모드에서는 기존 키워드 검색 재사용
  const results = await this.searchEmails(query, topK);

  // BM25 점수 흉내 (기존 score 유지)
  return results
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK);
}

  async getUser(id: string): Promise<User | undefined> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    return row;
  }
  async searchEventsByKeyword(keyword: string) {
  // SQLite 모드에서는 events 검색을 지원하지 않음
  return [];
}

  async getUserByUsername(username: string): Promise<User | undefined> {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
    return row;
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)').run(id, user.username, user.password);
    return { id, username: user.username, password: user.password };
  }

  async getEmailsCount(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM emails').get() as { count: number };
    return row.count;
  }

  async getLastImport(): Promise<ImportLog | undefined> {
    const row = this.db.prepare('SELECT * FROM import_logs ORDER BY created_at DESC LIMIT 1').get() as { id: number; filename: string; emails_imported: number; created_at: string } | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      filename: row.filename,
      emailsImported: row.emails_imported,
      createdAt: new Date(row.created_at),
    };
  }

  async getStats(): Promise<Stats> {
    const count = await this.getEmailsCount();
    const lastImport = await this.getLastImport();
    return {
      mode: `Local SQLite (${this.dataDir})`,
      emailsCount: count,
      lastImport: lastImport?.createdAt?.toISOString() ?? null,
    };
  }

  async insertEmail(email: InsertEmail): Promise<Email> {
    const result = this.db.prepare(`
      INSERT INTO emails (subject, sender, date, body, importance, label, classification, classification_confidence, is_processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      email.subject || '',
      email.sender || '',
      email.date || '',
      email.body || '',
      email.importance || null,
      email.label || null,
      email.classification || null,
      email.classificationConfidence || null,
      email.isProcessed || 'false'
    );
    
    return {
      id: result.lastInsertRowid as number,
      subject: email.subject || '',
      sender: email.sender || '',
      date: email.date || '',
      body: email.body || '',
      importance: email.importance || null,
      label: email.label || null,
      classification: email.classification || null,
      classificationConfidence: email.classificationConfidence || null,
      isProcessed: email.isProcessed || 'false',
      createdAt: new Date(),
    };
  }
  

  async insertEmails(emailsToInsert: InsertEmail[]): Promise<number> {
    if (emailsToInsert.length === 0) return 0;
    
    const insert = this.db.prepare(`
      INSERT INTO emails (subject, sender, date, body, importance, label, classification, classification_confidence, is_processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((emails: InsertEmail[]) => {
      for (const email of emails) {
        insert.run(
          email.subject || '',
          email.sender || '',
          email.date || '',
          email.body || '',
          email.importance || null,
          email.label || null,
          email.classification || null,
          email.classificationConfidence || null,
          email.isProcessed || 'false'
        );
      }
      return emails.length;
    });

    return insertMany(emailsToInsert);
  }

  async insertEmailsAndGetIds(emailsToInsert: InsertEmail[]): Promise<Email[]> {
    if (emailsToInsert.length === 0) return [];
    
    const results: Email[] = [];
    
    const insert = this.db.prepare(`
      INSERT INTO emails (subject, sender, date, body, importance, label, classification, classification_confidence, is_processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const email of emailsToInsert) {
      const result = insert.run(
        email.subject || '',
        email.sender || '',
        email.date || '',
        email.body || '',
        email.importance || null,
        email.label || null,
        email.classification || null,
        email.classificationConfidence || null,
        email.isProcessed || 'false'
      );
      
      results.push({
        id: result.lastInsertRowid as number,
        subject: email.subject || '',
        sender: email.sender || '',
        date: email.date || '',
        body: email.body || '',
        importance: email.importance || null,
        label: email.label || null,
        classification: email.classification || null,
        classificationConfidence: email.classificationConfidence || null,
        isProcessed: email.isProcessed || 'false',
        createdAt: new Date(),
      });
    }
    
    return results;
  }

  async getEmailById(id: number): Promise<Email | undefined> {
    const row = this.db.prepare('SELECT * FROM emails WHERE id = ?').get(id) as { id: number; subject: string; sender: string; date: string; body: string; importance: string | null; label: string | null; classification: string | null; classification_confidence: string | null; is_processed: string | null; created_at: string } | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      subject: row.subject,
      sender: row.sender,
      date: row.date,
      body: row.body,
      importance: row.importance,
      label: row.label,
      classification: row.classification,
      classificationConfidence: row.classification_confidence,
      isProcessed: row.is_processed,
      createdAt: new Date(row.created_at),
    };
  }

  async getAllEmails(limit: number = 1000): Promise<Email[]> {
    const rows = this.db.prepare('SELECT * FROM emails ORDER BY created_at DESC LIMIT ?').all(limit) as Array<{ id: number; subject: string; sender: string; date: string; body: string; importance: string | null; label: string | null; classification: string | null; classification_confidence: string | null; is_processed: string | null; created_at: string }>;
    return rows.map(row => ({
      id: row.id,
      subject: row.subject,
      sender: row.sender,
      date: row.date,
      body: row.body,
      importance: row.importance,
      label: row.label,
      classification: row.classification,
      classificationConfidence: row.classification_confidence,
      isProcessed: row.is_processed,
      createdAt: new Date(row.created_at),
    }));
  }

  async getUnprocessedEmails(): Promise<Email[]> {
    const rows = this.db.prepare("SELECT * FROM emails WHERE is_processed = 'false' ORDER BY created_at").all() as Array<{ id: number; subject: string; sender: string; date: string; body: string; importance: string | null; label: string | null; classification: string | null; classification_confidence: string | null; is_processed: string | null; created_at: string }>;
    return rows.map(row => ({
      id: row.id,
      subject: row.subject,
      sender: row.sender,
      date: row.date,
      body: row.body,
      importance: row.importance,
      label: row.label,
      classification: row.classification,
      classificationConfidence: row.classification_confidence,
      isProcessed: row.is_processed,
      createdAt: new Date(row.created_at),
    }));
  }

  async updateEmailClassification(id: number, classification: string, confidence: string): Promise<void> {
    this.db.prepare('UPDATE emails SET classification = ?, classification_confidence = ? WHERE id = ?').run(classification, confidence, id);
  }

  async markEmailProcessed(id: number): Promise<void> {
    this.db.prepare("UPDATE emails SET is_processed = 'true' WHERE id = ?").run(id);
  }

  async searchEmails(query: string, topK: number, filters?: SearchFilters): Promise<SearchResult[]> {
    const combinedText = `${query} ${(filters?.sender || "")} ${(filters?.subject || "")} ${(filters?.body || "")} ${(filters?.startDate || "")} ${(filters?.endDate || "")}`;
    const tokens = tokenize(combinedText);
    if (tokens.length === 0) return [];

    const normalizedOperator = (filters?.operator || "and").toLowerCase() === "or" ? "OR" : "AND";
    const clauses: string[] = [];
    const params: string[] = [];

    const addClause = (field: string, value?: string) => {
      if (!value || value.trim().length === 0) return;
      clauses.push(`${field} LIKE ?`);
      params.push(`%${value.trim()}%`);
    };

    if (query.trim()) {
      clauses.push(`(subject LIKE ? OR body LIKE ? OR sender LIKE ? OR date LIKE ?)`);
      params.push(`%${query.trim()}%`, `%${query.trim()}%`, `%${query.trim()}%`, `%${query.trim()}%`);
    }

    addClause("sender", filters?.sender);
    addClause("subject", filters?.subject);
    addClause("body", filters?.body);
    if (filters?.startDate && filters.startDate.trim()) {
      clauses.push(`date >= ?`);
      params.push(filters.startDate.trim());
    }
    if (filters?.endDate && filters.endDate.trim()) {
      clauses.push(`date <= ?`);
      params.push(filters.endDate.trim());
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(` ${normalizedOperator} `)}` : "";

    const rows = this.db.prepare(
      `SELECT * FROM emails ${whereSql} LIMIT 200`
    ).all(...params) as Array<{ id: number; subject: string; sender: string; date: string; body: string }>;

    const scored: SearchResult[] = rows.map(email => {
      const textToScore = `${email.subject} ${email.body} ${email.sender} ${email.date}`;
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
    const result = this.db.prepare('INSERT INTO import_logs (filename, emails_imported) VALUES (?, ?)').run(log.filename, log.emailsImported);
    return {
      id: result.lastInsertRowid as number,
      filename: log.filename,
      emailsImported: log.emailsImported ?? 0,
      createdAt: new Date(),
    };
  }

  async createConversation(conv: InsertConversation): Promise<Conversation> {
    const result = this.db.prepare('INSERT INTO conversations (title) VALUES (?)').run(conv.title || '새 대화');
    return {
      id: result.lastInsertRowid as number,
      title: conv.title || '새 대화',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as { id: number; title: string; created_at: string; updated_at: string } | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async getConversations(): Promise<Conversation[]> {
    const rows = this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as Array<{ id: number; title: string; created_at: string; updated_at: string }>;
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  async addMessage(msg: InsertMessage): Promise<Message> {
    const result = this.db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(msg.conversationId, msg.role, msg.content);
    this.db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(msg.conversationId);
    return {
      id: result.lastInsertRowid as number,
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      createdAt: new Date(),
    };
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    const rows = this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at').all(conversationId) as Array<{ id: number; conversation_id: number; role: string; content: string; created_at: string }>;
    return rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at),
    }));
  }

  async addCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const result = this.db.prepare(`
      INSERT INTO calendar_events (email_id, title, start_date, end_date, location, description, ship_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(event.emailId || null, event.title, event.startDate, event.endDate || null, event.location || null, event.description || null, event.shipNumber || null);
    
    return {
      id: result.lastInsertRowid as number,
      emailId: event.emailId || null,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate || null,
      location: event.location || null,
      description: event.description || null,
      shipNumber: event.shipNumber || null,
      createdAt: new Date(),
    };
  }

  async getCalendarEvents(): Promise<CalendarEvent[]> {
    const rows = this.db.prepare('SELECT * FROM calendar_events ORDER BY created_at DESC').all() as Array<{ id: number; email_id: number | null; title: string; start_date: string; end_date: string | null; location: string | null; description: string | null; ship_number: string | null; created_at: string }>;
    return rows.map(row => ({
      id: row.id,
      emailId: row.email_id,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      location: row.location,
      description: row.description,
      shipNumber: row.ship_number,
      createdAt: new Date(row.created_at),
    }));
  }

  async getCalendarEventsByEmailId(emailId: number): Promise<CalendarEvent[]> {
    const rows = this.db.prepare('SELECT * FROM calendar_events WHERE email_id = ? ORDER BY created_at DESC').all(emailId) as Array<{ id: number; email_id: number | null; title: string; start_date: string; end_date: string | null; location: string | null; description: string | null; ship_number: string | null; created_at: string }>;
    return rows.map(row => ({
      id: row.id,
      emailId: row.email_id,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      location: row.location,
      description: row.description,
      shipNumber: row.ship_number,
      createdAt: new Date(row.created_at),
    }));
  }

  async clearCalendarEvents(): Promise<number> {
    const countBefore = (this.db.prepare('SELECT COUNT(*) as count FROM calendar_events').get() as { count: number }).count;
    this.db.prepare('DELETE FROM calendar_events').run();
    return countBefore;
  }

  async getAppSetting(key: string): Promise<string | null> {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    const existing = await this.getAppSetting(key);
    if (existing !== null) {
      this.db.prepare("UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = ?").run(value, key);
    } else {
      this.db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
    }
  }

  async addEmailAttachments(emailId: number, attachments: InsertEmailAttachment[]): Promise<number> {
    if (attachments.length === 0) return 0;
    
    const insert = this.db.prepare(`
      INSERT INTO email_attachments (email_id, filename, rel_path, size, mime, original_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const att of attachments) {
      insert.run(emailId, att.filename, att.relPath, att.size, att.mime || null, att.originalName || null);
    }

    return attachments.length;
  }

  async getEmailAttachments(emailId: number): Promise<EmailAttachment[]> {
    const rows = this.db.prepare('SELECT * FROM email_attachments WHERE email_id = ? ORDER BY id').all(emailId) as Array<{ id: number; email_id: number; filename: string; rel_path: string; size: number; mime: string | null; original_name: string | null; created_at: string }>;
    return rows.map(row => ({
      id: row.id,
      emailId: row.email_id,
      filename: row.filename,
      relPath: row.rel_path,
      size: row.size,
      mime: row.mime,
      originalName: row.original_name,
      createdAt: row.created_at,
    }));
  }

  async getEmailAttachmentById(id: number): Promise<EmailAttachment | undefined> {
    const row = this.db.prepare('SELECT * FROM email_attachments WHERE id = ?').get(id) as { id: number; email_id: number; filename: string; rel_path: string; size: number; mime: string | null; original_name: string | null; created_at: string } | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      emailId: row.email_id,
      filename: row.filename,
      relPath: row.rel_path,
      size: row.size,
      mime: row.mime,
      originalName: row.original_name,
      createdAt: row.created_at,
    };
  }

  async saveRagChunks(chunks: InsertRagChunk[]): Promise<number> {
    if (chunks.length === 0) return 0;
    
    const insert = this.db.prepare(`
      INSERT INTO rag_chunks (email_id, chunk_index, content, embedding)
      VALUES (?, ?, ?, ?)
    `);

    for (const chunk of chunks) {
      insert.run(chunk.emailId, chunk.chunkIndex, chunk.content, chunk.embedding);
    }

    return chunks.length;
  }

  async searchRagChunks(queryEmbedding: number[], topK: number): Promise<Array<{ chunk: RagChunk; similarity: number }>> {
    const rows = this.db.prepare('SELECT * FROM rag_chunks').all() as Array<{ id: number; email_id: number; chunk_index: number; content: string; embedding: string; created_at: string }>;
    
    const results = rows.map(row => {
      const embedding = JSON.parse(row.embedding) as number[];
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      const chunk: RagChunk = {
        id: row.id,
        emailId: row.email_id,
        chunkIndex: row.chunk_index,
        content: row.content,
        embedding: row.embedding,
        createdAt: new Date(row.created_at),
      };
      return { chunk, similarity };
    });
    
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  async clearRagChunks(): Promise<number> {
    const countBefore = await this.getRagChunkCount();
    this.db.prepare('DELETE FROM rag_chunks').run();
    return countBefore;
  }

  async getRagChunkCount(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM rag_chunks').get() as { count: number };
    return row.count;
  }

  async getRagChunksByEmailId(emailId: number): Promise<RagChunk[]> {
    const rows = this.db.prepare('SELECT * FROM rag_chunks WHERE email_id = ?').all(emailId) as Array<{ id: number; email_id: number; chunk_index: number; content: string; embedding: string; created_at: string }>;
    return rows.map(row => ({
      id: row.id,
      emailId: row.email_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      embedding: row.embedding,
      createdAt: new Date(row.created_at),
    }));
  }
}
