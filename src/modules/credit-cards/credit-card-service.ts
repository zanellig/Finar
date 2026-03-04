/**
 * Credit-card service — business logic for card and spenditure management.
 *
 * Currency conversion for card limits and spent totals is handled here
 * so the route layer stays conversion-agnostic.
 */

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { CreditCardRepository } from "./credit-card-repository";
import type { CardCurrencyTotals } from "./credit-card-repository";
import type {
  CreateCreditCardInput,
  UpdateCreditCardInput,
} from "./credit-card-types";
import { NotFoundError, ValidationError } from "../shared/errors";
import { CurrencyConverter, type ConversionOptions } from "../currency/convert";
import { RatesRepository } from "../currency/rates-repository";
import { roundMoney } from "../currency/money";
import { parseSpenditure } from "./parse-spenditure";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

/** Shape returned for card list items and card detail (base fields). */
interface CardExposure {
  total_spent: number;
  total_spent_ars: number;
  total_spent_usd: number;
  available_limit: number;
  spend_limit_usd_estimate: number | null;
  available_limit_usd_estimate: number | null;
}

export class CreditCardService {
  private readonly repo: CreditCardRepository;
  private readonly converter: CurrencyConverter;

  constructor(orm: Orm) {
    this.repo = new CreditCardRepository(orm);
    this.converter = new CurrencyConverter(new RatesRepository(orm));
  }

  listCards(opts: ConversionOptions = {}) {
    const cards = this.repo.findAll();
    const spendMap = this.repo.getUnpaidSpendTotalsByCurrency();

    // Pre-resolve the sell rate once so per-card calls don't hit DB
    const cachedRate = this.converter.tryGetSellRate(opts);
    const rateOpts: ConversionOptions =
      cachedRate != null ? { ...opts, customRate: cachedRate } : opts;

    return cards.map((card) => {
      const totals = spendMap.get(card.id) ?? { ars: 0, usd: 0 };
      const exposure = this.buildExposure(card.spend_limit, totals, rateOpts);
      return { ...card, ...exposure };
    });
  }

  getCard(id: string, opts: ConversionOptions = {}) {
    const card = this.repo.findById(id);
    if (!card) {
      throw new NotFoundError("Credit card not found");
    }

    const spenditureList = this.repo.getAllSpenditures(id);
    const totals = this.repo.getCardUnpaidTotals(id);
    const exposure = this.buildExposure(card.spend_limit, totals, opts);

    return {
      ...card,
      spenditures: spenditureList,
      ...exposure,
    };
  }

  createCard(input: CreateCreditCardInput) {
    if (!this.repo.entityExists(input.entity_id)) {
      throw new ValidationError("Entity not found");
    }

    const id = crypto.randomUUID();
    this.repo.create({
      id,
      entityId: input.entity_id,
      name: input.name,
      spendLimit: input.spend_limit,
    });

    const card = this.repo.findCardBasic(id);
    return {
      ...card,
      total_spent: 0,
      total_spent_ars: 0,
      total_spent_usd: 0,
      available_limit: input.spend_limit,
      spend_limit_usd_estimate: this.converter.fromBase(input.spend_limit),
      available_limit_usd_estimate: this.converter.fromBase(input.spend_limit),
    };
  }

  updateCard(id: string, input: UpdateCreditCardInput) {
    if (!this.repo.exists(id)) {
      throw new NotFoundError("Credit card not found");
    }

    const values: Record<string, unknown> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.spend_limit !== undefined) values.spendLimit = input.spend_limit;

    this.repo.update(id, values);
    return this.repo.findCardBasic(id);
  }

  deleteCard(id: string) {
    if (!this.repo.exists(id)) {
      throw new NotFoundError("Credit card not found");
    }
    this.repo.remove(id);
  }

  listSpenditures(cardId: string) {
    return this.repo.getAllSpenditures(cardId);
  }

  createSpenditure(cardId: string, body: Record<string, unknown>) {
    if (!this.repo.exists(cardId)) {
      throw new NotFoundError("Credit card not found");
    }

    const parsed = parseSpenditure(body);

    // Enforce limit before insert
    this.enforceLimit(cardId, parsed.totalAmount, parsed.currency);

    const id = crypto.randomUUID();
    this.repo.createSpenditure({
      id,
      creditCardId: cardId,
      description: parsed.description,
      amount:
        parsed.installments === 1 ? parsed.totalAmount : parsed.monthlyAmount,
      currency: parsed.currency,
      installments: parsed.installments,
      monthlyAmount: parsed.monthlyAmount,
      totalAmount: parsed.totalAmount,
      remainingInstallments: parsed.installments,
      isPaidOff: false,
      dueDate: parsed.dueDate,
    });

    return this.repo.findSpenditureById(id);
  }

  // ── Private helpers ─────────────────────────────────────────────

  /**
   * Build the exposure fields for a card from raw currency totals.
   * Converts USD portion to ARS for the unified total.
   */
  private buildExposure(
    spendLimit: number,
    totals: CardCurrencyTotals,
    opts: ConversionOptions = {},
  ): CardExposure {
    const usdInArs =
      totals.usd > 0
        ? this.converter.toBase({ amount: totals.usd, currency: "USD" }, opts)
        : 0;
    const totalSpent = roundMoney(totals.ars + usdInArs);
    const availableLimit = roundMoney(spendLimit - totalSpent);

    return {
      total_spent: totalSpent,
      total_spent_ars: roundMoney(totals.ars),
      total_spent_usd: roundMoney(totals.usd),
      available_limit: availableLimit,
      spend_limit_usd_estimate: this.converter.fromBase(spendLimit, opts),
      available_limit_usd_estimate: this.converter.fromBase(
        availableLimit,
        opts,
      ),
    };
  }

  /**
   * Enforce the ARS unified limit before persisting a spenditure.
   * Converts the new spenditure amount to ARS if needed, then checks
   * if projected exposure would exceed the card's spend_limit.
   */
  private enforceLimit(
    cardId: string,
    additionalAmount: number,
    currency: "ARS" | "USD",
  ): void {
    const card = this.repo.findCardBasic(cardId);
    if (!card) return;

    const totals = this.repo.getCardUnpaidTotals(cardId);

    // Convert current USD to ARS
    const currentUsdInArs =
      totals.usd > 0
        ? this.converter.toBase({ amount: totals.usd, currency: "USD" })
        : 0;
    const currentExposure = totals.ars + currentUsdInArs;

    // Convert additional to ARS
    const additionalArs =
      currency === "USD"
        ? this.converter.toBase({ amount: additionalAmount, currency: "USD" })
        : additionalAmount;

    const projected = roundMoney(currentExposure + additionalArs);

    if (projected > card.spend_limit) {
      throw new ValidationError(
        `Spenditure would exceed card limit. ` +
          `Current exposure: ${roundMoney(currentExposure)} ARS, ` +
          `additional: ${roundMoney(additionalArs)} ARS, ` +
          `limit: ${card.spend_limit} ARS`,
      );
    }
  }
}
