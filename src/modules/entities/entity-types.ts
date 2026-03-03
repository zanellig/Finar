/**
 * Types for the entity service, decoupled from HTTP.
 */

export interface CreateEntityInput {
  name: string;
  type: "bank" | "wallet" | "asset_manager";
}

export interface UpdateEntityInput {
  name?: string;
  type?: "bank" | "wallet" | "asset_manager";
}

export interface EntityRecord {
  id: string;
  name: string;
  type: string;
  created_at: string;
}
