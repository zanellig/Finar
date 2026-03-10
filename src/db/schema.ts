import {
  sqliteTable,
  text,
  real,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ---- Entities ----

export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["bank", "wallet", "asset_manager"] }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ---- Accounts ----

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["savings", "checking", "interest"] }).notNull(),
  balance: real("balance").notNull().default(0),
  currency: text("currency", { enum: ["ARS", "USD"] })
    .notNull()
    .default("ARS"),
  dailyExtractionLimit: real("daily_extraction_limit"),
  monthlyMaintenanceCost: real("monthly_maintenance_cost").default(0),
  isSalaryAccount: integer("is_salary_account", { mode: "boolean" })
    .notNull()
    .default(false),
  overdraftLimit: real("overdraft_limit").default(0),
  tnaRate: real("tna_rate").default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ---- Loans ----

export const loans = sqliteTable("loans", {
  id: text("id").primaryKey(),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  capital: real("capital").notNull(),
  installments: integer("installments").notNull(),
  cftea: real("cftea").notNull(),
  totalOwed: real("total_owed").notNull(),
  monthlyPayment: real("monthly_payment").notNull(),
  remainingInstallments: integer("remaining_installments").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ---- Credit Cards ----

export const creditCards = sqliteTable("credit_cards", {
  id: text("id").primaryKey(),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  spendLimit: real("spend_limit").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ---- CC Spenditures ----

export const ccSpenditures = sqliteTable(
  "cc_spenditures",
  {
    id: text("id").primaryKey(),
    creditCardId: text("credit_card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency", { enum: ["ARS", "USD"] })
      .notNull()
      .default("ARS"),
    installments: integer("installments").notNull().default(1),
    monthlyAmount: real("monthly_amount").notNull().default(0),
    totalAmount: real("total_amount").notNull().default(0),
    remainingInstallments: integer("remaining_installments")
      .notNull()
      .default(1),
    isPaidOff: integer("is_paid_off", { mode: "boolean" })
      .notNull()
      .default(false),
    dueDate: text("due_date").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_cc_spenditures_card_unpaid").on(
      table.creditCardId,
      table.isPaidOff,
    ),
  ],
);

// ---- Payments ----

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["cc", "loan"] }).notNull(),
  targetId: text("target_id").notNull(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ---- Exchange Rates ----

export const exchangeRates = sqliteTable("exchange_rates", {
  id: text("id").primaryKey(),
  pair: text("pair").notNull(),
  buyRate: real("buy_rate").notNull(),
  sellRate: real("sell_rate").notNull(),
  source: text("source").notNull().default("blue"),
  fetchedAt: text("fetched_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ---- Paychecks ----

export const paychecks = sqliteTable(
  "paychecks",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    currency: text("currency", { enum: ["ARS", "USD"] }).notNull(),
    amount: real("amount").notNull(),
    frequency: text("frequency", {
      enum: ["monthly", "biweekly", "weekly"],
    }).notNull(),
    nextRunAt: text("next_run_at").notNull(),
    lastRunAt: text("last_run_at"),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    description: text("description").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_paychecks_account").on(table.accountId),
    index("idx_paychecks_active_next_run").on(table.isActive, table.nextRunAt),
  ],
);

// ---- Paycheck Runs ----

export const paycheckRuns = sqliteTable(
  "paycheck_runs",
  {
    id: text("id").primaryKey(),
    paycheckId: text("paycheck_id")
      .notNull()
      .references(() => paychecks.id, { onDelete: "cascade" }),
    runAt: text("run_at").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency", { enum: ["ARS", "USD"] }).notNull(),
    accountBalanceBefore: real("account_balance_before").notNull(),
    accountBalanceAfter: real("account_balance_after").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: ["applied", "skipped", "failed"],
    }).notNull(),
    failureReason: text("failure_reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_paycheck_runs_paycheck_run_at").on(
      table.paycheckId,
      table.runAt,
    ),
    uniqueIndex("idx_paycheck_runs_idempotency_key").on(table.idempotencyKey),
  ],
);

