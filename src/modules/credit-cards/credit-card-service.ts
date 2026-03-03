/**
 * Credit-card service — business logic for card and spenditure management.
 *
 * Currency conversion for card limits and spent totals is handled here
 * so the route layer stays conversion-agnostic.
 */

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { CreditCardRepository } from "./credit-card-repository";
import type {
  CreateCreditCardInput,
  UpdateCreditCardInput,
} from "./credit-card-types";
import { NotFoundError, ValidationError } from "../shared/errors";
import { CurrencyConverter, type ConversionOptions } from "../currency/convert";
import { RatesRepository } from "../currency/rates-repository";
import type { Currency } from "../currency/money";
import { roundMoney } from "../currency/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orm = BunSQLiteDatabase<any>;

export class CreditCardService {
  private readonly repo: CreditCardRepository;
  private readonly converter: CurrencyConverter;

  constructor(orm: Orm) {
    this.repo = new CreditCardRepository(orm);
    this.converter = new CurrencyConverter(new RatesRepository(orm));
  }

  listCards(opts: ConversionOptions = {}) {
    const cards = this.repo.findAll();
    return cards.map((card) => {
      const spent = this.getCardSpentConverted(card.id, opts);
      return {
        ...card,
        total_spent: roundMoney(spent),
        available_limit: roundMoney(card.spend_limit - spent),
      };
    });
  }

  getCard(id: string, opts: ConversionOptions = {}) {
    const card = this.repo.findById(id);
    if (!card) {
      throw new NotFoundError("Credit card not found");
    }

    const spenditureList = this.repo.getAllSpenditures(id);

    const totalSpent = this.converter.sumToBase(
      spenditureList
        .filter((s) => !s.is_paid_off)
        .map((s) => ({
          amount: s.total_amount,
          currency: s.currency as Currency,
        })),
      opts,
    );

    return {
      ...card,
      spenditures: spenditureList,
      total_spent: roundMoney(totalSpent),
      available_limit: roundMoney(card.spend_limit - totalSpent),
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
      available_limit: input.spend_limit,
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

    const rawInstallments = Number(body.installments);
    const installments =
      Number.isFinite(rawInstallments) && rawInstallments >= 1
        ? Math.floor(rawInstallments)
        : 1;

    let totalAmount: number;
    let monthlyAmount: number;
    let parsedInstallments: number;

    if (installments <= 1) {
      // 1x purchase — validated by caller with insertCcSpenditure1xSchema
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError("Amount must be a positive number");
      }
      totalAmount = amount;
      monthlyAmount = amount;
      parsedInstallments = 1;
    } else {
      const currency =
        typeof body.currency === "string" ? body.currency : "ARS";
      if (currency === "USD") {
        throw new ValidationError(
          "Installments are only available in ARS payments",
        );
      }

      parsedInstallments = installments;
      const mAmount = Number(body.monthly_amount);
      const tAmount = Number(body.total_amount);

      if (Number.isFinite(mAmount) && mAmount > 0) {
        monthlyAmount = mAmount;
        totalAmount =
          Math.round(monthlyAmount * parsedInstallments * 100) / 100;
      } else if (Number.isFinite(tAmount) && tAmount > 0) {
        totalAmount = tAmount;
        monthlyAmount =
          Math.round((totalAmount / parsedInstallments) * 100) / 100;
      } else {
        throw new ValidationError(
          "Either monthly_amount or total_amount is required for installment payments",
        );
      }
    }

    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const currency =
      typeof body.currency === "string" &&
      (body.currency === "ARS" || body.currency === "USD")
        ? body.currency
        : "ARS";

    const id = crypto.randomUUID();
    this.repo.createSpenditure({
      id,
      creditCardId: cardId,
      description,
      amount: parsedInstallments === 1 ? totalAmount : monthlyAmount,
      currency,
      installments: parsedInstallments,
      monthlyAmount,
      totalAmount,
      remainingInstallments: parsedInstallments,
      isPaidOff: false,
    });

    return this.repo.findSpenditureById(id);
  }

  /** Calculate total unpaid spend on a card in ARS. */
  private getCardSpentConverted(
    cardId: string,
    opts: ConversionOptions,
  ): number {
    const rows = this.repo.getUnpaidSpenditures(cardId);
    return this.converter.sumToBase(
      rows.map((s) => ({
        amount: s.totalAmount,
        currency: s.currency as Currency,
      })),
      opts,
    );
  }
}
