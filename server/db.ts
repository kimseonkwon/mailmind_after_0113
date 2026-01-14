import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const isLocalMode = process.env.STORAGE_MODE === "local";

let pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

if (!isLocalMode) {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database? Or set STORAGE_MODE=local for local SQLite storage.",
    );
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  _db = drizzle(pool, { schema });
  console.log("Using PostgreSQL database storage");
} else {
  console.log("Using local SQLite storage at:", process.env.DATA_DIR || "./data");
}

// Getter that throws if db is not initialized (for PostgreSQL mode only)
export function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    throw new Error("Database not initialized. Are you running in local SQLite mode without proper storage?");
  }
  return _db;
}

// Export for backward compatibility - use getDb() for type-safe access
export const db = _db as ReturnType<typeof drizzle>;
export { pool };
