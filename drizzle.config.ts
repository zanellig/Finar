import { defineConfig } from "drizzle-kit";
import { getSqliteLibsqlUrl } from "./src/db/sqlite-path";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    // Drizzle Kit sqlite migrations use @libsql/client in this setup.
    url: getSqliteLibsqlUrl(),
  },
});
