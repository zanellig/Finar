/**
 * Types for the credit-card service, decoupled from HTTP.
 */

export interface CreateCreditCardInput {
  entity_id: string;
  name: string;
  spend_limit: number;
}

export interface UpdateCreditCardInput {
  name?: string;
  spend_limit?: number;
}

export interface CreateSpenditure1xInput {
  description: string;
  currency: "ARS" | "USD";
  installments: 1;
  amount: number;
}

export interface CreateSpenditureInstallmentInput {
  description: string;
  currency: "ARS";
  installments: number;
  monthly_amount?: number;
  total_amount?: number;
}

export interface CardWithLimits {
  id: string;
  entity_id: string;
  name: string;
  spend_limit: number;
  created_at: string;
  entity_name: string;
  entity_type: string;
  total_spent: number;
  available_limit: number;
}
