import homepage from "./frontend/index.html";
import landingPage from "./frontend/landing/index.html";
import { getEntitiesRoutes } from "./api/entities";
import { getLoansRoutes } from "./api/loans";
import { getCreditCardsRoutes } from "./api/credit-cards";
import { getAccountsRoutes } from "./api/accounts";
import { getPaymentsRoutes } from "./api/payments";
import { getRatesRoutes, startRatesFetcher } from "./api/rates";
import { getDashboardRoutes } from "./api/dashboard";

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
    // Fallback: serve the SPA for any non-API route
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/" },
      });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`🏦 Finance Tracker running at ${server.url}`);

// Auto-open dashboard in default browser
function openBrowser(url: string) {
  const cmds: Record<string, string[]> = {
    linux: ["xdg-open", url],
    darwin: ["open", url],
    win32: ["cmd", "/c", "start", url],
  };
  const cmd = cmds[process.platform];
  if (cmd) {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  }
}

openBrowser(server.url.href);
