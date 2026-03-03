import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  Modal,
  useToast,
  formatCurrency,
  formatPercent,
  accountTypeLabel,
  accountTypeBadge,
  LoadingPage,
  EmptyState,
} from "../components/shared";

const defaultForm = {
  entity_id: "",
  name: "",
  type: "savings",
  balance: "0",
  currency: "ARS",
  daily_extraction_limit: "",
  monthly_maintenance_cost: "",
  is_salary_account: false,
  overdraft_limit: "",
  tna_rate: "",
};

const typeLetters: Record<string, string> = {
  savings: "S",
  checking: "C",
  interest: "R",
};

export function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [a, e] = await Promise.all([api.getAccounts(), api.getEntities()]);
      setAccounts(a);
      setEntities(e);
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingAccount(null);
    setForm({ ...defaultForm, entity_id: entities[0]?.id || "" });
    setShowModal(true);
  }

  function openEdit(a: any) {
    setEditingAccount(a);
    setForm({
      entity_id: a.entity_id,
      name: a.name,
      type: a.type,
      balance: a.balance.toString(),
      currency: a.currency,
      daily_extraction_limit: a.daily_extraction_limit?.toString() || "",
      monthly_maintenance_cost: a.monthly_maintenance_cost?.toString() || "",
      is_salary_account: !!a.is_salary_account,
      overdraft_limit: a.overdraft_limit?.toString() || "",
      tna_rate: a.tna_rate?.toString() || "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const payload: any = {
      entity_id: form.entity_id,
      name: form.name,
      type: form.type,
      balance: parseFloat(form.balance) || 0,
      currency: form.currency,
      daily_extraction_limit: form.daily_extraction_limit
        ? parseFloat(form.daily_extraction_limit)
        : null,
      monthly_maintenance_cost: form.monthly_maintenance_cost
        ? parseFloat(form.monthly_maintenance_cost)
        : 0,
      is_salary_account: form.is_salary_account,
      overdraft_limit: form.overdraft_limit
        ? parseFloat(form.overdraft_limit)
        : 0,
      tna_rate: form.tna_rate ? parseFloat(form.tna_rate) : 0,
    };
    try {
      if (editingAccount) {
        await api.updateAccount(editingAccount.id, payload);
        addToast("Cuenta actualizada");
      } else {
        await api.createAccount(payload);
        addToast("Cuenta creada");
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta cuenta?")) return;
    try {
      await api.deleteAccount(id);
      addToast("Cuenta eliminada");
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    }
  }

  if (loading) return <LoadingPage />;

  const grouped = accounts.reduce((g: any, a: any) => {
    const k = a.entity_name || "Sin entidad";
    if (!g[k]) g[k] = [];
    g[k].push(a);
    return g;
  }, {});

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas</h1>
          <p className="page-subtitle">cuentas bancarias y de inversión</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openCreate}
          disabled={entities.length === 0}
        >
          + Nueva Cuenta
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
            Primero creá una entidad.
          </p>
        </div>
      )}

      {accounts.length === 0 ? (
        <EmptyState icon="▤" text="No hay cuentas registradas" />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          {Object.keys(grouped).map((entityName) => (
            <div key={entityName} className="card">
              <div
                className="font-mono"
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--white-30)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "var(--space-4)",
                }}
              >
                {entityName}
              </div>
              {grouped[entityName].map((acct: any) => (
                <div key={acct.id} className="list-item">
                  <div className="list-item-info">
                    <div
                      className="list-item-icon"
                      style={{
                        background: "var(--green-06)",
                        color: "var(--green)",
                      }}
                    >
                      {typeLetters[acct.type] || "?"}
                    </div>
                    <div className="list-item-details">
                      <div className="list-item-title">
                        {acct.name}
                        {acct.type === "interest" && acct.tna_rate > 0 && (
                          <span className="tna-tag" style={{ marginLeft: 8 }}>
                            TNA {formatPercent(acct.tna_rate)}
                          </span>
                        )}
                      </div>
                      <div className="list-item-subtitle">
                        <span
                          className={`badge ${accountTypeBadge(acct.type)}`}
                        >
                          {accountTypeLabel(acct.type)}
                        </span>
                        {!!acct.is_salary_account && (
                          <span className="badge badge-success">sueldo</span>
                        )}
                        {acct.type === "checking" &&
                          acct.overdraft_limit > 0 && (
                            <span
                              className="font-mono"
                              style={{
                                fontSize: "10px",
                                color: "var(--white-15)",
                              }}
                            >
                              desc. {formatCurrency(acct.overdraft_limit)}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`list-item-amount ${acct.balance >= 0 ? "currency-positive" : "currency-negative"}`}
                    >
                      {formatCurrency(acct.balance, acct.currency)}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEdit(acct)}
                    >
                      edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(acct.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingAccount ? "Editar Cuenta" : "Nueva Cuenta"}
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
              {submitting ? "..." : editingAccount ? "Guardar" : "Crear"}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          {!editingAccount && (
            <div className="form-group">
              <label className="form-label">Entidad</label>
              <select
                className="form-select"
                value={form.entity_id}
                onChange={(e) =>
                  setForm({ ...form, entity_id: e.target.value })
                }
                required
              >
                <option value="">Seleccioná...</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input
                className="form-input"
                type="text"
                placeholder="CA en pesos"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select
                className="form-select"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                disabled={!!editingAccount}
              >
                <option value="savings">Caja de Ahorro</option>
                <option value="checking">Cuenta Corriente</option>
                <option value="interest">Cuenta Remunerada</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Saldo</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <select
                className="form-select"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                disabled={!!editingAccount}
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          {(form.type === "savings" || form.type === "interest") && (
            <div className="form-group">
              <label className="form-label">Ext. diaria ($)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Opcional"
                value={form.daily_extraction_limit}
                onChange={(e) =>
                  setForm({ ...form, daily_extraction_limit: e.target.value })
                }
              />
            </div>
          )}
          {form.type === "checking" && (
            <>
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={form.is_salary_account}
                  onChange={(e) =>
                    setForm({ ...form, is_salary_account: e.target.checked })
                  }
                />
                <span>Cuenta sueldo</span>
              </label>
              {!form.is_salary_account && (
                <div className="form-group">
                  <label className="form-label">Mantenimiento $/m</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monthly_maintenance_cost}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        monthly_maintenance_cost: e.target.value,
                      })
                    }
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Descubierto ($)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.overdraft_limit}
                  onChange={(e) =>
                    setForm({ ...form, overdraft_limit: e.target.value })
                  }
                />
              </div>
            </>
          )}
          {form.type === "interest" && (
            <div className="form-group">
              <label className="form-label">TNA (%)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="37.5"
                value={form.tna_rate}
                onChange={(e) => setForm({ ...form, tna_rate: e.target.value })}
              />
              <span className="form-hint">
                tasa nominal anual de referencia
              </span>
            </div>
          )}
        </form>
      </Modal>
      <ToastContainer />
    </div>
  );
}
