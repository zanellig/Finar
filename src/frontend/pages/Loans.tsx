import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  Modal,
  useToast,
  formatCurrency,
  formatPercent,
  LoadingPage,
  EmptyState,
} from "../components/shared";
import { DataTable } from "../components/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faHandHoldingDollar,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

type LoanRow = {
  id: string;
  name: string;
  entity_name: string;
  capital: number;
  cftea: number;
  monthly_payment: number;
  total_owed: number;
  remaining_installments: number;
  installments: number;
};

export function Loans() {
  const [loans, setLoans] = useState<LoanRow[]>([]);
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
      const [l, e] = await Promise.all([api.getLoans(), api.getEntities()]);
      setLoans(l);
      setEntities(e);
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

  function getPreview() {
    const capital = parseFloat(form.capital);
    const inst = parseInt(form.installments);
    const cftea = parseFloat(form.cftea);
    if (!capital || !inst || !cftea) return null;
    const totalOwed = capital * Math.pow(1 + cftea / 100, inst / 12);
    const monthly = totalOwed / inst;
    return {
      totalOwed: Math.round(totalOwed * 100) / 100,
      monthlyPayment: Math.round(monthly * 100) / 100,
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
  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }: { row: { original: LoanRow } }) => (
          <span style={{ fontWeight: 600, color: "var(--white-90)" }}>
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "entity_name",
        header: "Entidad",
        cell: ({ row }: { row: { original: LoanRow } }) => (
          <span className="badge badge-primary">{row.original.entity_name}</span>
        ),
      },
      {
        accessorKey: "capital",
        header: () => (
          <span className="block text-right" style={{ width: "100%" }}>
            Capital
          </span>
        ),
        cell: ({ row }: { row: { original: LoanRow } }) => (
          <span className="font-mono" style={{ textAlign: "right", display: "block" }}>
            {formatCurrency(row.original.capital)}
          </span>
        ),
      },
      {
        accessorKey: "cftea",
        header: () => (
          <span className="block text-right" style={{ width: "100%" }}>
            CFTEA
          </span>
        ),
        cell: ({ row }: { row: { original: LoanRow } }) => (
          <span
            className="badge badge-warning"
            style={{ display: "inline-flex", justifyContent: "flex-end" }}
          >
            {formatPercent(row.original.cftea)}
          </span>
        ),
      },
      {
        accessorKey: "monthly_payment",
        header: () => (
          <span className="block text-right" style={{ width: "100%" }}>
            Cuota
          </span>
        ),
        cell: ({ row }: { row: { original: LoanRow } }) => (
          <span
            className="font-mono"
            style={{
              textAlign: "right",
              display: "block",
              fontWeight: 600,
              color: "var(--white-90)",
            }}
          >
            {formatCurrency(row.original.monthly_payment)}
          </span>
        ),
      },
      {
        accessorKey: "total_owed",
        header: () => (
          <span className="block text-right" style={{ width: "100%" }}>
            Total
          </span>
        ),
        cell: ({ row }: { row: { original: LoanRow } }) => (
          <span
            className="font-mono"
            style={{
              textAlign: "right",
              display: "block",
              color: "var(--white-30)",
            }}
          >
            {formatCurrency(row.original.total_owed)}
          </span>
        ),
      },
      {
        id: "installments",
        header: () => (
          <span className="block text-center" style={{ width: "100%" }}>
            Cuotas
          </span>
        ),
        cell: ({ row }: { row: { original: LoanRow } }) => {
          const loan = row.original;
          return (
            <span
              className={`badge ${
                loan.remaining_installments > 0 ? "badge-danger" : "badge-success"
              }`}
            >
              {loan.remaining_installments}/{loan.installments}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }: { row: { original: LoanRow } }) => (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleDelete(row.original.id)}
            title="Eliminar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        ),
      },
    ],
    [],
  );

  if (loading) return <LoadingPage />;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Préstamos</h1>
          <p className="page-subtitle">
            registrá y gestioná tus préstamos personales
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openCreate}
          disabled={entities.length === 0}
        >
          <FontAwesomeIcon icon={faPlus} style={{ marginRight: 8 }} /> Nuevo
          Préstamo
        </button>
      </div>

      {entities.length === 0 && (
        <div
          className="card mb-6"
          style={{ borderColor: "var(--yellow)", borderLeftWidth: 3 }}
        >
          <p
            style={{ color: "var(--yellow)", fontSize: "var(--font-size-sm)" }}
          >
            Primero necesitás crear una entidad para registrar préstamos.
          </p>
        </div>
      )}

      {loans.length === 0 ? (
        <EmptyState
          icon={faHandHoldingDollar}
          text="No hay préstamos registrados"
        />
      ) : (
        <div className="card">
          <DataTable<LoanRow> data={loans} columns={columns} />
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
              className="form-input"
              type="text"
              placeholder="Préstamo personal"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Capital ($)</label>
              <input
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
              style={{
                background: "var(--black)",
                border: "1px solid var(--white-06)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-4)",
              }}
            >
              <div
                className="font-mono"
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--white-30)",
                  marginBottom: "var(--space-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                preview
              </div>
              <div className="flex justify-between mb-4">
                <span
                  style={{
                    color: "var(--white-30)",
                    fontSize: "var(--font-size-sm)",
                  }}
                >
                  Cuota mensual
                </span>
                <span
                  className="font-mono"
                  style={{ fontWeight: 700, color: "var(--green)" }}
                >
                  {formatCurrency(preview.monthlyPayment)}
                </span>
              </div>
              <div className="flex justify-between mb-4">
                <span
                  style={{
                    color: "var(--white-30)",
                    fontSize: "var(--font-size-sm)",
                  }}
                >
                  Total a pagar
                </span>
                <span
                  className="font-mono"
                  style={{ fontWeight: 700, color: "var(--red)" }}
                >
                  {formatCurrency(preview.totalOwed)}
                </span>
              </div>
              <div className="flex justify-between">
                <span
                  style={{
                    color: "var(--white-30)",
                    fontSize: "var(--font-size-sm)",
                  }}
                >
                  Interés total
                </span>
                <span
                  className="font-mono"
                  style={{ fontWeight: 700, color: "var(--yellow)" }}
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
