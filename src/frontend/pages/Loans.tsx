import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  Modal,
  useToast,
  formatCurrency,
  formatPercent,
  LoadingPage,
  EmptyState,
} from "../components/shared";

export function Loans() {
  const [loans, setLoans] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    entity_id: "",
    name: "",
    capital: "",
    installments: "",
    cftea: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [loansData, entitiesData] = await Promise.all([
        api.getLoans(),
        api.getEntities(),
      ]);
      setLoans(loansData);
      setEntities(entitiesData);
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({
      entity_id: entities[0]?.id || "",
      name: "",
      capital: "",
      installments: "",
      cftea: "",
    });
    setShowModal(true);
  }

  // Preview calculation
  function getPreview() {
    const capital = parseFloat(form.capital);
    const installments = parseInt(form.installments);
    const cftea = parseFloat(form.cftea);
    if (!capital || !installments || !cftea) return null;

    const cftDecimal = cftea / 100;
    const totalOwed = capital * Math.pow(1 + cftDecimal, installments / 12);
    const monthlyPayment = totalOwed / installments;
    return {
      totalOwed: Math.round(totalOwed * 100) / 100,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalInterest: Math.round((totalOwed - capital) * 100) / 100,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createLoan({
        entity_id: form.entity_id,
        name: form.name,
        capital: parseFloat(form.capital),
        installments: parseInt(form.installments),
        cftea: parseFloat(form.cftea),
      });
      addToast("Préstamo registrado");
      setShowModal(false);
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este préstamo?")) return;
    try {
      await api.deleteLoan(id);
      addToast("Préstamo eliminado");
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    }
  }

  const preview = getPreview();

  if (loading) return <LoadingPage />;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Préstamos</h1>
          <p className="page-subtitle">
            Registrá y gestioná tus préstamos personales
          </p>
        </div>
        <button
          id="create-loan-btn"
          className="btn btn-primary"
          onClick={openCreate}
          disabled={entities.length === 0}
        >
          + Nuevo Préstamo
        </button>
      </div>

      {entities.length === 0 && (
        <div
          className="card mb-6"
          style={{
            borderColor: "var(--accent-warning)",
            background: "var(--accent-warning-muted)",
          }}
        >
          <p style={{ color: "var(--accent-warning)", fontWeight: 600 }}>
            ⚠️ Primero necesitás crear una entidad para poder registrar
            préstamos.
          </p>
        </div>
      )}

      {loans.length === 0 ? (
        <EmptyState icon="📋" text="No hay préstamos registrados" />
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Entidad</th>
                <th style={{ textAlign: "right" }}>Capital</th>
                <th style={{ textAlign: "right" }}>CFTEA</th>
                <th style={{ textAlign: "right" }}>Cuota</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "center" }}>Cuotas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id}>
                  <td style={{ fontWeight: 600 }}>{loan.name}</td>
                  <td>
                    <span className="badge badge-primary">
                      {loan.entity_name}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatCurrency(loan.capital)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="badge badge-warning">
                      {formatPercent(loan.cftea)}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatCurrency(loan.monthly_payment)}
                  </td>
                  <td
                    style={{ textAlign: "right", color: "var(--text-muted)" }}
                  >
                    {formatCurrency(loan.total_owed)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span
                      className={`badge ${loan.remaining_installments > 0 ? "badge-danger" : "badge-success"}`}
                    >
                      {loan.remaining_installments}/{loan.installments}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(loan.id)}
                      title="Eliminar"
                    >
                      🗑️
                    </button>
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
        title="Nuevo Préstamo"
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
              {submitting ? "Registrando..." : "Registrar"}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Entidad</label>
            <select
              id="loan-entity-select"
              className="form-select"
              value={form.entity_id}
              onChange={(e) => setForm({ ...form, entity_id: e.target.value })}
              required
            >
              <option value="">Seleccioná una entidad</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nombre / Descripción</label>
            <input
              id="loan-name-input"
              className="form-input"
              type="text"
              placeholder="Ej: Préstamo personal"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Capital prestado ($)</label>
              <input
                id="loan-capital-input"
                className="form-input"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="100000"
                value={form.capital}
                onChange={(e) => setForm({ ...form, capital: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cuotas</label>
              <input
                id="loan-installments-input"
                className="form-input"
                type="number"
                min="1"
                max="360"
                placeholder="12"
                value={form.installments}
                onChange={(e) =>
                  setForm({ ...form, installments: e.target.value })
                }
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">CFTEA (%)</label>
            <input
              id="loan-cftea-input"
              className="form-input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="25.5"
              value={form.cftea}
              onChange={(e) => setForm({ ...form, cftea: e.target.value })}
              required
            />
            <span className="form-hint">
              Costo Financiero Total Efectivo Anual (incluye impuestos)
            </span>
          </div>

          {preview && (
            <div
              className="card"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "var(--space-3)",
                }}
              >
                Vista previa del préstamo
              </div>
              <div className="flex justify-between mb-4">
                <span style={{ color: "var(--text-muted)" }}>
                  Cuota mensual:
                </span>
                <span style={{ fontWeight: 700 }}>
                  {formatCurrency(preview.monthlyPayment)}
                </span>
              </div>
              <div className="flex justify-between mb-4">
                <span style={{ color: "var(--text-muted)" }}>
                  Total a pagar:
                </span>
                <span
                  style={{ fontWeight: 700, color: "var(--accent-danger)" }}
                >
                  {formatCurrency(preview.totalOwed)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-muted)" }}>
                  Interés total:
                </span>
                <span
                  style={{ fontWeight: 700, color: "var(--accent-warning)" }}
                >
                  {formatCurrency(preview.totalInterest)}
                </span>
              </div>
            </div>
          )}
        </form>
      </Modal>

      <ToastContainer />
    </div>
  );
}
