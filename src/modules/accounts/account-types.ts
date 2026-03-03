/**
 * Types for the account service, decoupled from HTTP.
 */

export interface CreateAccountInput {
  entity_id: string;
  name: string;
  type: "savings" | "checking" | "interest";
  balance: number;
  currency: "ARS" | "USD";
  daily_extraction_limit?: number | null;
  monthly_maintenance_cost: number;
  is_salary_account: boolean;
  overdraft_limit: number;
  tna_rate: number;
}

export interface UpdateAccountInput {
  name?: string;
  balance?: number;
  daily_extraction_limit?: number | null;
  monthly_maintenance_cost?: number;
  is_salary_account?: boolean;
  overdraft_limit?: number;
  tna_rate?: number;
}

export interface AccountRecord {
  id: string;
  entity_id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  daily_extraction_limit: number | null;
  monthly_maintenance_cost: number | null;
  is_salary_account: boolean;
  overdraft_limit: number | null;
  tna_rate: number | null;
  created_at: string;
}
