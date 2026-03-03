import { getDb, getOrm } from "../db/database";
import { exchangeRates } from "../db/schema";

const DOLAR_API_URL = "https://dolarapi.com/v1/dolares";

interface DolarApiResponse {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

async function fetchDollarRates(): Promise<void> {
  try {
    const response = await fetch(DOLAR_API_URL);
    if (!response.ok) {
      console.error(`Failed to fetch dollar rates: ${response.status}`);
      return;
    }

    const data: DolarApiResponse[] = await response.json();
    const db = getDb();

    // Use raw prepared statement for bulk upsert (faster than ORM for this)
    const insertRate = db.query(
      `INSERT OR REPLACE INTO exchange_rates (id, pair, buy_rate, sell_rate, source, fetched_at)
       VALUES ($id, $pair, $buyRate, $sellRate, $source, datetime('now'))`,
    );

    for (const rate of data) {
      insertRate.run({
        id: `usd_ars_${rate.casa}`,
        pair: "USD/ARS",
        buyRate: rate.compra,
        sellRate: rate.venta,
        source: rate.casa,
      });
    }

    console.log(`[Rates] Updated ${data.length} exchange rates`);
  } catch (err) {
    console.error("[Rates] Failed to fetch dollar rates:", err);
  }
}

let rateInterval: ReturnType<typeof setInterval> | null = null;

export function startRatesFetcher(): void {
  fetchDollarRates();
  rateInterval = setInterval(fetchDollarRates, 30 * 60 * 1000);
}

export function stopRatesFetcher(): void {
  if (rateInterval) {
    clearInterval(rateInterval);
    rateInterval = null;
  }
}

export function getRatesRoutes() {
  return {
    "/api/rates": {
      GET: () => {
        const db = getOrm();
        const rates = db
          .select({
            id: exchangeRates.id,
            pair: exchangeRates.pair,
            buy_rate: exchangeRates.buyRate,
            sell_rate: exchangeRates.sellRate,
            source: exchangeRates.source,
            fetched_at: exchangeRates.fetchedAt,
          })
          .from(exchangeRates)
          .orderBy(exchangeRates.source)
          .all();
        return Response.json(rates);
      },
    },
    "/api/rates/refresh": {
      POST: async () => {
        await fetchDollarRates();
        const db = getOrm();
        const rates = db
          .select({
            id: exchangeRates.id,
            pair: exchangeRates.pair,
            buy_rate: exchangeRates.buyRate,
            sell_rate: exchangeRates.sellRate,
            source: exchangeRates.source,
            fetched_at: exchangeRates.fetchedAt,
          })
          .from(exchangeRates)
          .orderBy(exchangeRates.source)
          .all();
        return Response.json(rates);
      },
    },
  };
}
