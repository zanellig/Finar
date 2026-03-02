import homepage from "./frontend/index.html";
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
