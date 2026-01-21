import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function addAttachmentsColumn() {
  try {
    console.log("Adding attachments column to emails table...");
    
    await db.execute(sql`
      ALTER TABLE emails ADD COLUMN IF NOT EXISTS attachments TEXT
    `);
    
    console.log("✅ Successfully added attachments column");
  } catch (error) {
    console.error("Error adding column:", error);
  }
  process.exit(0);
}

addAttachmentsColumn();
