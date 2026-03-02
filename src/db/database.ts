import { Database } from "bun:sqlite";
import { initializeSchema } from "./schema";

const DB_PATH = "./finance-tracker.sqlite";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true, strict: true });
    initializeSchema(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close(false);
    db = null;
  }
}
