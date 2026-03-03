/**
 * Types for the dashboard service, decoupled from HTTP.
 */

export interface DashboardData {
  net_worth: number;
  total_debt: number;
  monthly_obligations: number;
  loan_debt: number;
  cc_debt: number;
  monthly_loan_payments: number;
  monthly_cc_payments: number;
  accounts: DashboardAccount[];
  entities: DashboardEntity[];
  loans: DashboardLoan[];
  credit_cards: DashboardCard[];
  recent_payments: DashboardPayment[];
  exchange_rates: DashboardRate[];
}

export interface DashboardAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  tna_rate: number | null;
  entity_name: string;
}

export interface DashboardEntity {
  id: string;
  name: string;
  type: string;
  created_at: string;
  account_count: number;
  loan_count: number;
  card_count: number;
}

export interface DashboardLoan {
  id: string;
  name: string;
  capital: number;
  installments: number;
  cftea: number;
  total_owed: number;
  monthly_payment: number;
  remaining_installments: number;
  entity_name: string;
}

export interface DashboardCard {
  id: string;
  name: string;
  spend_limit: number;
  entity_name: string;
  total_spent: number;
  available_limit: number;
}

export interface DashboardPayment {
  id: string;
  type: string;
  target_id: string;
  amount: number;
  description: string;
  created_at: string;
  account_name: string;
}

export interface DashboardRate {
  id: string;
  pair: string;
  buy_rate: number;
  sell_rate: number;
  source: string;
  fetched_at: string;
}
