/**
 * Types for the payment service, decoupled from HTTP.
 */

export interface MakePaymentInput {
  type: "cc" | "loan";
  targetId: string;
  accountId: string;
  amount: number;
  description: string;
}

export interface PaymentRecord {
  id: string;
  type: "cc" | "loan";
  target_id: string;
  account_id: string;
  amount: number;
  description: string;
  created_at: string;
  account_name: string;
  account_currency: string | null;
}

export interface EnrichedPayment extends PaymentRecord {
  target_name: string;
}
