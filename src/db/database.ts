import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { initializeSchema } from "./schema";

const DB_NAME = "finance-tracker.sqlite";
const APP_NAME = "FinTracker";
const isDev = process.env.NODE_ENV !== "production";

function getDataDir(): string {
  if (isDev) return ".";

  const platform = process.platform;
  let dir: string;

  if (platform === "win32") {
    dir = join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      APP_NAME,
    );
  } else if (platform === "darwin") {
    dir = join(homedir(), "Library", "Application Support", APP_NAME);
  } else {
    dir = join(
      process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
      APP_NAME.toLowerCase(),
    );
  }

  mkdirSync(dir, { recursive: true });
  return dir;
}

const DB_PATH = join(getDataDir(), DB_NAME);

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true, strict: true });
    initializeSchema(db);
  }
  return db;
}

export function getDbPath(): string {
  return DB_PATH;
}

export function closeDb(): void {
  if (db) {
    db.close(false);
    db = null;
  }
}
