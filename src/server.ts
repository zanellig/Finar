import homepage from "./frontend/index.html";
import landingPage from "./frontend/landing/index.html";
import { getEntitiesRoutes } from "./api/entities";
import { getLoansRoutes } from "./api/loans";
import { getCreditCardsRoutes } from "./api/credit-cards";
import { getAccountsRoutes } from "./api/accounts";
import { getPaymentsRoutes } from "./api/payments";
import {
  getRatesRoutes,
  startRatesFetcher,
  stopRatesFetcher,
} from "./api/rates";
import { getDashboardRoutes } from "./api/dashboard";
import { getDbPath, closeDb } from "./db/database";
import { registerShutdownHooks } from "./lifecycle";

// --compile implies --production, which replaces NODE_ENV at bundle time
const isDev = process.env.NODE_ENV !== "production";

// Start periodic rate fetching
startRatesFetcher();

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": homepage,
    "/landing": landingPage,
    ...getEntitiesRoutes(),
    ...getLoansRoutes(),
    ...getCreditCardsRoutes(),
    ...getAccountsRoutes(),
    ...getPaymentsRoutes(),
    ...getRatesRoutes(),
    ...getDashboardRoutes(),
  },
  fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/" },
      });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  },
  development: isDev ? { hmr: true, console: true } : false,
});

console.log(`🏦 Finance Tracker running at ${server.url}`);
console.log(`📂 Database: ${getDbPath()}`);

// Graceful shutdown: stop intervals → close DB → stop server
registerShutdownHooks(server, [stopRatesFetcher, closeDb]);

// Auto-open dashboard in default browser (production only)
if (!isDev) {
  const cmds: Record<string, string[]> = {
    linux: ["xdg-open", server.url.href],
    darwin: ["open", server.url.href],
    win32: ["cmd", "/c", "start", "", server.url.href],
  };
  const cmd = cmds[process.platform];
  if (cmd) {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  }
}
