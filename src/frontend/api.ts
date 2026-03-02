const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.error || `Request failed with status ${response.status}`,
    );
  }
  return data as T;
}

export const api = {
  // Dashboard
  getDashboard: () => request<any>("/dashboard"),

  // Entities
  getEntities: () => request<any[]>("/entities"),
  createEntity: (data: any) =>
    request<any>("/entities", { method: "POST", body: JSON.stringify(data) }),
  updateEntity: (id: string, data: any) =>
    request<any>(`/entities/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteEntity: (id: string) =>
    request<any>(`/entities/${id}`, { method: "DELETE" }),

  // Accounts
  getAccounts: () => request<any[]>("/accounts"),
  createAccount: (data: any) =>
    request<any>("/accounts", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: string, data: any) =>
    request<any>(`/accounts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteAccount: (id: string) =>
    request<any>(`/accounts/${id}`, { method: "DELETE" }),

  // Loans
  getLoans: () => request<any[]>("/loans"),
  createLoan: (data: any) =>
    request<any>("/loans", { method: "POST", body: JSON.stringify(data) }),
  deleteLoan: (id: string) =>
    request<any>(`/loans/${id}`, { method: "DELETE" }),

  // Credit Cards
  getCreditCards: () => request<any[]>("/credit-cards"),
  getCreditCard: (id: string) => request<any>(`/credit-cards/${id}`),
  createCreditCard: (data: any) =>
    request<any>("/credit-cards", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCreditCard: (id: string, data: any) =>
    request<any>(`/credit-cards/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteCreditCard: (id: string) =>
    request<any>(`/credit-cards/${id}`, { method: "DELETE" }),
  addSpenditure: (cardId: string, data: any) =>
    request<any>(`/credit-cards/${cardId}/spenditures`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Payments
  getPayments: () => request<any[]>("/payments"),
  createPayment: (data: any) =>
    request<any>("/payments", { method: "POST", body: JSON.stringify(data) }),

  // Rates
  getRates: () => request<any[]>("/rates"),
  refreshRates: () => request<any[]>("/rates/refresh", { method: "POST" }),
};
