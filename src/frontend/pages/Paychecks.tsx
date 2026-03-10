import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  Modal,
  useToast,
  formatCurrency,
  LoadingPage,
  EmptyState,
} from "../components/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faMoneyBillWave,
  faPlay,
  faPen,
  faChevronDown,
  faChevronUp,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

// ── Helpers ──────────────────────────────────────────────────

const frequencyLabel: Record<string, string> = {
  monthly: "mensual",
  biweekly: "quincenal",
  weekly: "semanal",
};

const frequencyBadge: Record<string, string> = {
  monthly: "badge-cyan",
  biweekly: "badge-warning",
  weekly: "badge-purple",
};

const runStatusBadge: Record<string, string> = {
  applied: "badge-success",
  skipped: "badge-warning",
  failed: "badge-danger",
};

const runStatusLabel: Record<string, string> = {
  applied: "aplicado",
  skipped: "omitido",
  failed: "fallido",
};

function formatDatetime(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt.replace(" ", "T"));
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt.replace(" ", "T"));
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

function nowIdempotencyKey(paycheckId: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `paycheck:${paycheckId}:${ts}`;
}

function nowRunAt(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

// ── Default form ──────────────────────────────────────────────

const defaultForm = {
  name: "",
  account_id: "",
  currency: "ARS",
  amount: "",
  frequency: "monthly",
  next_run_at: "",
  description: "",
  is_active: true,
};

// ── Component ──────────────────────────────────────────────────

export function Paychecks() {
  const [paychecks, setPaychecks] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPaycheck, setEditingPaycheck] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  // Run history state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [p, a] = await Promise.all([
        api.getPaychecks(),
        api.getAccounts(),
      ]);
      setPaychecks(p);
      setAccounts(a);
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // ── Modal open helpers ──

  function openCreate() {
    setEditingPaycheck(null);
    const firstAccount = accounts[0];
    setForm({
      ...defaultForm,
      account_id: firstAccount?.id || "",
      currency: firstAccount?.currency || "ARS",
    });
    setShowModal(true);
  }

  function openEdit(p: any) {
    setEditingPaycheck(p);
    setForm({
      name: p.name,
      account_id: p.account_id,
      currency: p.currency,
      amount: p.amount.toString(),
      frequency: p.frequency,
      next_run_at: p.next_run_at?.replace(" ", "T").slice(0, 16) || "",
      description: p.description || "",
      is_active: !!p.is_active,
    });
    setShowModal(true);
  }

  // ── CRUD ──

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    // Format next_run_at to YYYY-MM-DD HH:mm:ss
    const rawDt = form.next_run_at;
    const nextRunAt = rawDt
      ? rawDt.replace("T", " ") + (rawDt.length <= 16 ? ":00" : "")
      : "";

    const payload: any = {
      name: form.name,
      account_id: form.account_id,
      currency: form.currency,
      amount: parseFloat(form.amount) || 0,
      frequency: form.frequency,
      next_run_at: nextRunAt,
      description: form.description,
    };

    if (editingPaycheck) {
      payload.is_active = form.is_active;
      delete payload.account_id;
      delete payload.currency;
    }

    try {
      if (editingPaycheck) {
        await api.updatePaycheck(editingPaycheck.id, payload);
        addToast("Sueldo actualizado");
      } else {
        await api.createPaycheck(payload);
        addToast("Sueldo creado");
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Manual run ──

  async function handleRun(p: any) {
    if (runningId) return;
    setRunningId(p.id);
    try {
      await api.runPaycheck(p.id, {
        idempotency_key: nowIdempotencyKey(p.id),
        run_at: nowRunAt(),
      });
      addToast(`Sueldo "${p.name}" ejecutado`);
      loadData();
      if (expandedId === p.id) {
        loadRuns(p.id);
      }
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setRunningId(null);
    }
  }

  // ── Run history ──

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setRuns([]);
      return;
    }
    setExpandedId(id);
    loadRuns(id);
  }

  async function loadRuns(id: string) {
    setLoadingRuns(true);
    try {
      const r = await api.getPaycheckRuns(id);
      setRuns(r);
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoadingRuns(false);
    }
  }

  // ── Account change auto-fills currency ──

  function handleAccountChange(accountId: string) {
    const acct = accounts.find((a: any) => a.id === accountId);
    setForm({
      ...form,
      account_id: accountId,
      currency: acct?.currency || "ARS",
    });
  }

  // ── Render ──

  if (loading) return <LoadingPage />;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sueldos</h1>
          <p className="page-subtitle">ingresos recurrentes</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openCreate}
          disabled={accounts.length === 0}
        >
          <FontAwesomeIcon icon={faPlus} style={{ marginRight: 8 }} /> Nuevo
          Sueldo
        </button>
      </div>

      {accounts.length === 0 && (
        <div
          className="card mb-6"
          style={{ borderColor: "var(--yellow)", borderLeftWidth: 3 }}
        >
          <p
            style={{ color: "var(--yellow)", fontSize: "var(--font-size-sm)" }}
          >
            Primero creá una cuenta bancaria.
          </p>
        </div>
      )}

      {paychecks.length === 0 ? (
        <EmptyState
          icon={faMoneyBillWave}
          text="No hay sueldos configurados"
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          {paychecks.map((p: any) => (
            <div key={p.id} className="card">
              <div className="list-item" style={{ padding: 0 }}>
                <div className="list-item-info">
                  <div
                    className="list-item-icon"
                    style={{
                      background: p.is_active
                        ? "var(--green-06)"
                        : "var(--white-06)",
                      color: p.is_active
                        ? "var(--green)"
                        : "var(--white-30)",
                    }}
                  >
                    <FontAwesomeIcon icon={faMoneyBillWave} />
                  </div>
                  <div className="list-item-details">
                    <div
                      className="list-item-title"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                      }}
                    >
                      <span
                        className={`paycheck-status-dot ${p.is_active ? "active" : "inactive"}`}
                      />
                      {p.name}
                    </div>
                    <div className="list-item-subtitle">
                      <span
                        className={`badge ${frequencyBadge[p.frequency] || "badge-primary"}`}
                      >
                        {frequencyLabel[p.frequency] || p.frequency}
                      </span>
                      <span className="badge badge-purple">
                        {p.currency}
                      </span>
                      {p.account_name && (
                        <span
                          className="font-mono"
                          style={{
                            fontSize: "10px",
                            color: "var(--white-15)",
                          }}
                        >
                          → {p.account_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div style={{ textAlign: "right" }}>
                    <div className="list-item-amount currency-positive">
                      {formatCurrency(p.amount, p.currency)}
                    </div>
                    <div className="paycheck-next-run">
                      próx. {formatShortDate(p.next_run_at)}
                    </div>
                  </div>
                  <div className="paycheck-actions">
                    {!!p.is_active && (
                      <button
                        className="btn-run"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRun(p);
                        }}
                        disabled={runningId === p.id}
                        title="Ejecutar ahora"
                      >
                        <FontAwesomeIcon icon={faPlay} />
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(p);
                      }}
                      title="Editar"
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleExpand(p.id)}
                      title="Historial de ejecuciones"
                    >
                      <FontAwesomeIcon
                        icon={
                          expandedId === p.id ? faChevronUp : faChevronDown
                        }
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Run history panel ── */}
              {expandedId === p.id && (
                <div className="paycheck-run-panel">
                  <div
                    className="font-mono"
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--white-30)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "var(--space-3)",
                    }}
                  >
                    historial de ejecuciones
                  </div>

                  {loadingRuns ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        padding: "var(--space-4)",
                      }}
                    >
                      <div className="spinner" />
                    </div>
                  ) : runs.length === 0 ? (
                    <p
                      style={{
                        fontSize: "var(--font-size-xs)",
                        color: "var(--white-30)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      sin ejecuciones aún
                    </p>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>fecha</th>
                          <th>monto</th>
                          <th>saldo antes</th>
                          <th>saldo después</th>
                          <th>estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((run: any) => (
                          <tr key={run.id}>
                            <td
                              className="font-mono"
                              style={{
                                fontSize: "var(--font-size-xs)",
                              }}
                            >
                              {formatDatetime(run.run_at)}
                            </td>
                            <td className="font-mono currency-positive">
                              {formatCurrency(run.amount, run.currency)}
                            </td>
                            <td className="font-mono">
                              {formatCurrency(
                                run.account_balance_before,
                                run.currency,
                              )}
                            </td>
                            <td className="font-mono">
                              {formatCurrency(
                                run.account_balance_after,
                                run.currency,
                              )}
                            </td>
                            <td>
                              <span
                                className={`badge ${runStatusBadge[run.status] || "badge-primary"}`}
                              >
                                {runStatusLabel[run.status] || run.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingPaycheck ? "Editar Sueldo" : "Nuevo Sueldo"}
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
              {submitting ? "..." : editingPaycheck ? "Guardar" : "Crear"}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input
              className="form-input"
              type="text"
              placeholder="Sueldo mensual"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          {!editingPaycheck && (
            <div className="form-group">
              <label className="form-label">Cuenta destino</label>
              <select
                className="form-select"
                value={form.account_id}
                onChange={(e) => handleAccountChange(e.target.value)}
                required
              >
                <option value="">Seleccioná...</option>
                {accounts.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Monto</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="150000"
                value={form.amount}
                onChange={(e) =>
                  setForm({ ...form, amount: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <input
                className="form-input"
                type="text"
                value={form.currency}
                readOnly
                style={{ opacity: 0.5 }}
              />
              <span className="form-hint">
                se hereda de la cuenta
              </span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Frecuencia</label>
              <select
                className="form-select"
                value={form.frequency}
                onChange={(e) =>
                  setForm({ ...form, frequency: e.target.value })
                }
              >
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Próxima ejecución</label>
              <input
                className="form-input"
                type="datetime-local"
                value={form.next_run_at}
                onChange={(e) =>
                  setForm({ ...form, next_run_at: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input
              className="form-input"
              type="text"
              placeholder="Opcional"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>

          {editingPaycheck && (
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              <span>Activo</span>
            </label>
          )}
        </form>
      </Modal>
      <ToastContainer />
    </div>
  );
}
