/**
 * Types for the loan service, decoupled from HTTP.
 */

export interface CreateLoanInput {
  entity_id: string;
  name: string;
  capital: number;
  installments: number;
  cftea: number;
}

export interface LoanCalculation {
  totalOwed: number;
  monthlyPayment: number;
}

export interface LoanRecord {
  id: string;
  entity_id: string;
  name: string;
  capital: number;
  installments: number;
  cftea: number;
  total_owed: number;
  monthly_payment: number;
  remaining_installments: number;
  created_at: string;
}
