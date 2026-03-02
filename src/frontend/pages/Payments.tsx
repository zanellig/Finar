import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  Modal,
  useToast,
  formatCurrency,
  LoadingPage,
  EmptyState,
} from "../components/shared";

export function Payments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    type: "loan",
    target_id: "",
    account_id: "",
    amount: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [p, a, l, c] = await Promise.all([
        api.getPayments(),
        api.getAccounts(),
        api.getLoans(),
        api.getCreditCards(),
      ]);
      setPayments(p);
      setAccounts(a);
      setLoans(l);
      setCards(c);
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({
      type: "loan",
      target_id: loans[0]?.id || "",
      account_id: accounts[0]?.id || "",
      amount: "",
      description: "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createPayment({
        type: form.type,
        target_id: form.target_id,
        account_id: form.account_id,
        amount: parseFloat(form.amount),
        description: form.description,
      });
      addToast("Pago registrado");
      setShowModal(false);
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const targets = form.type === "loan" ? loans : cards;
  const selectedAccount = accounts.find((a: any) => a.id === form.account_id);

  if (loading) return <LoadingPage />;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pagos</h1>
          <p className="page-subtitle">
            Registrá pagos de préstamos y tarjetas
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openCreate}
          disabled={
            accounts.length === 0 || (loans.length === 0 && cards.length === 0)
          }
        >
          + Registrar Pago
        </button>
      </div>

      {(accounts.length === 0 ||
        (loans.length === 0 && cards.length === 0)) && (
        <div
          className="card mb-6"
          style={{
            borderColor: "var(--accent-warning)",
            background: "var(--accent-warning-muted)",
          }}
        >
          <p style={{ color: "var(--accent-warning)", fontWeight: 600 }}>
            ⚠️ Necesitás al menos una cuenta y un préstamo o tarjeta para
            registrar pagos.
          </p>
        </div>
      )}

      {payments.length === 0 ? (
        <EmptyState icon="💸" text="No hay pagos registrados" />
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Destino</th>
                <th>Descripción</th>
                <th>Cuenta origen</th>
                <th style={{ textAlign: "right" }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id}>
                  <td>{new Date(p.created_at).toLocaleDateString("es-AR")}</td>
                  <td>
                    <span
                      className={`badge ${p.type === "loan" ? "badge-danger" : "badge-purple"}`}
                    >
                      {p.type === "loan" ? "Préstamo" : "Tarjeta"}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.target_name}</td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {p.description || "—"}
                  </td>
                  <td>{p.account_name}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {formatCurrency(p.amount, p.account_currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Registrar Pago"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setShowModal(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Registrando..." : "Registrar Pago"}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Tipo de pago</label>
            <select
              className="form-select"
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value, target_id: "" })
              }
            >
              <option value="loan">Préstamo</option>
              <option value="cc">Tarjeta de Crédito</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">
              {form.type === "loan" ? "Préstamo" : "Tarjeta"}
            </label>
            <select
              className="form-select"
              value={form.target_id}
              onChange={(e) => setForm({ ...form, target_id: e.target.value })}
              required
            >
              <option value="">Seleccioná...</option>
              {targets.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.entity_name || ""}
                  {form.type === "loan"
                    ? ` (${t.remaining_installments} cuotas restantes)`
                    : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Cuenta origen</label>
            <select
              className="form-select"
              value={form.account_id}
              onChange={(e) => setForm({ ...form, account_id: e.target.value })}
              required
            >
              <option value="">Seleccioná...</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.entity_name} (
                  {formatCurrency(a.balance, a.currency)})
                </option>
              ))}
            </select>
            {selectedAccount && (
              <span className="form-hint">
                Saldo disponible:{" "}
                {formatCurrency(
                  selectedAccount.balance,
                  selectedAccount.currency,
                )}
                {selectedAccount.type === "checking" &&
                  selectedAccount.overdraft_limit > 0 &&
                  ` (descubierto: ${formatCurrency(selectedAccount.overdraft_limit)})`}
              </span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Monto ($)</label>
            <input
              className="form-input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="25000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Descripción (opcional)</label>
            <input
              className="form-input"
              type="text"
              placeholder="Ej: Cuota 3/12"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
        </form>
      </Modal>
      <ToastContainer />
    </div>
  );
}
