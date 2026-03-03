import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DB_NAME = "finance-tracker.sqlite";
const APP_NAME = "FinTracker";

function getDataDir(nodeEnv = process.env.NODE_ENV): string {
  if (nodeEnv !== "production") return ".";

  if (process.platform === "win32") {
    return join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      APP_NAME,
    );
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  return join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    APP_NAME.toLowerCase(),
  );
}

export function getSqliteDbPath(nodeEnv = process.env.NODE_ENV): string {
  const dataDir = getDataDir(nodeEnv);

  if (dataDir !== ".") {
    mkdirSync(dataDir, { recursive: true });
  }

  return join(dataDir, DB_NAME);
}

export function getSqliteLibsqlUrl(nodeEnv = process.env.NODE_ENV): string {
  const dbPath = getSqliteDbPath(nodeEnv);
  return dbPath.startsWith("file:") ? dbPath : `file:${dbPath}`;
}
