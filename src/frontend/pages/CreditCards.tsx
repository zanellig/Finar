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
  faCreditCard,
  faXmark,
  faPen,
  faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";

/** Compute days remaining until a YYYY-MM-DD due date. */
function daysUntilDue(dueDate: string): number {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
}

/** Urgency badge for due date. */
function DueBadge({ dueDate }: { dueDate: string }) {
  const days = daysUntilDue(dueDate);
  const cls =
    days < 0 ? "badge-danger" : days <= 7 ? "badge-warning" : "badge-success";
  const label =
    days < 0 ? `${Math.abs(days)}d vencido` : days === 0 ? "hoy" : `${days}d`;
  return <span className={`badge ${cls}`}>{label}</span>;
}

/** Today in YYYY-MM-DD for default due_date. */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function CreditCards() {
  const [cards, setCards] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [cardDetail, setCardDetail] = useState<any>(null);
  const [editingSpenditure, setEditingSpenditure] = useState<any>(null);
  const [cardForm, setCardForm] = useState({
    entity_id: "",
    name: "",
    spend_limit: "",
  });
  const [spendForm, setSpendForm] = useState({
    description: "",
    currency: "ARS",
    installments: "1",
    amount: "",
    monthly_amount: "",
    total_amount: "",
    due_date: todayISO(),
    input_mode: "amount" as "amount" | "monthly" | "total",
  });
  const [editForm, setEditForm] = useState({
    description: "",
    due_date: "",
    amount: "",
    currency: "ARS",
    installments: "1",
  });
  const [submitting, setSubmitting] = useState(false);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [c, e] = await Promise.all([
        api.getCreditCards(),
        api.getEntities(),
      ]);
      setCards(c);
      setEntities(e);
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setCardForm({
      entity_id: entities[0]?.id || "",
      name: "",
      spend_limit: "",
    });
    setShowCardModal(true);
  }

  function openSpend(card: any) {
    setSelectedCard(card);
    setSpendForm({
      description: "",
      currency: "ARS",
      installments: "1",
      amount: "",
      monthly_amount: "",
      total_amount: "",
      due_date: todayISO(),
      input_mode: "amount",
    });
    setShowSpendModal(true);
  }

  async function openDetail(card: any) {
    try {
      setCardDetail(await api.getCreditCard(card.id));
      setShowDetailModal(true);
    } catch (err: any) {
      addToast(err.message, "error");
    }
  }

  function openEdit(spend: any) {
    setEditingSpenditure(spend);
    setEditForm({
      description: spend.description,
      due_date: spend.due_date || todayISO(),
      amount: String(spend.total_amount),
      currency: spend.currency,
      installments: String(spend.installments),
    });
    setShowEditModal(true);
  }

  async function handleCreateCard(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createCreditCard({
        entity_id: cardForm.entity_id,
        name: cardForm.name,
        spend_limit: parseFloat(cardForm.spend_limit),
      });
      addToast("Tarjeta creada");
      setShowCardModal(false);
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateLimit(card: any) {
    const newLimit = prompt(
      "Nuevo límite de gasto:",
      card.spend_limit.toString(),
    );
    if (newLimit === null) return;
    const parsed = parseFloat(newLimit);
    if (isNaN(parsed) || parsed < 0) {
      addToast("Límite inválido", "error");
      return;
    }
    try {
      await api.updateCreditCard(card.id, { spend_limit: parsed });
      addToast("Límite actualizado");
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    }
  }

  async function handleAddSpend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCard) return;
    setSubmitting(true);
    const inst = parseInt(spendForm.installments);
    const payload: any = {
      description: spendForm.description,
      currency: spendForm.currency,
      installments: inst,
      due_date: spendForm.due_date,
    };
    if (inst === 1) {
      payload.amount = parseFloat(spendForm.amount);
    } else if (spendForm.input_mode === "monthly") {
      payload.monthly_amount = parseFloat(spendForm.monthly_amount);
    } else {
      payload.total_amount = parseFloat(spendForm.total_amount);
    }
    try {
      await api.addSpenditure(selectedCard.id, payload);
      addToast("Gasto registrado");
      setShowSpendModal(false);
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSpend(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSpenditure || !cardDetail) return;
    setSubmitting(true);
    const payload: any = {
      description: editForm.description,
      due_date: editForm.due_date,
    };
    // Only include financial fields if they changed
    const isPartiallyPaid =
      editingSpenditure.remaining_installments < editingSpenditure.installments;
    if (!isPartiallyPaid) {
      const newAmount = parseFloat(editForm.amount);
      if (
        newAmount !== editingSpenditure.total_amount ||
        editForm.currency !== editingSpenditure.currency
      ) {
        const inst = parseInt(editForm.installments);
        if (inst > 1) {
          payload.total_amount = newAmount;
        } else {
          payload.amount = newAmount;
        }
        payload.currency = editForm.currency;
        payload.installments = inst;
      }
    }
    try {
      await api.updateSpenditure(cardDetail.id, editingSpenditure.id, payload);
      addToast("Gasto actualizado");
      setShowEditModal(false);
      // Refresh detail
      setCardDetail(await api.getCreditCard(cardDetail.id));
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteSpend(spend: any) {
    if (!cardDetail) return;
    if (!confirm("¿Eliminar este gasto?")) return;
    try {
      await api.deleteSpenditure(cardDetail.id, spend.id);
      addToast("Gasto eliminado");
      setCardDetail(await api.getCreditCard(cardDetail.id));
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    }
  }

  async function handleDeleteCard(id: string) {
    if (!confirm("¿Eliminar esta tarjeta?")) return;
    try {
      await api.deleteCreditCard(id);
      addToast("Tarjeta eliminada");
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    }
  }

  const isInstallment = parseInt(spendForm.installments) > 1;
  if (loading) return <LoadingPage />;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tarjetas de Crédito</h1>
          <p className="page-subtitle">
            gestioná tus tarjetas y registrá gastos
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openCreate}
          disabled={entities.length === 0}
        >
          <FontAwesomeIcon icon={faPlus} style={{ marginRight: 8 }} /> Nueva
          Tarjeta
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

      {cards.length === 0 ? (
        <EmptyState icon={faCreditCard} text="No hay tarjetas registradas" />
      ) : (
        <div
          className="stats-grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          }}
        >
          {cards.map((card, i) => {
            const usage =
              card.spend_limit > 0
                ? (card.total_spent / card.spend_limit) * 100
                : 0;
            const barColor =
              usage > 80
                ? "var(--red)"
                : usage > 50
                  ? "var(--yellow)"
                  : "var(--green)";
            return (
              <div
                key={card.id}
                className={`card animate-in stagger-${(i % 4) + 1}`}
              >
                <div className="card-header">
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "var(--font-size-md)",
                      }}
                    >
                      {card.name}
                    </div>
                    <span
                      className="badge badge-primary"
                      style={{ marginTop: 4 }}
                    >
                      {card.entity_name}
                    </span>
                  </div>
                  <div
                    className="list-item-icon"
                    style={{
                      background: "var(--white-06)",
                      color: "var(--white-50)",
                    }}
                  >
                    <FontAwesomeIcon icon={faCreditCard} />
                  </div>
                </div>
                <div style={{ marginTop: "var(--space-4)" }}>
                  <div className="flex justify-between items-center mb-4">
                    <span
                      className="font-mono"
                      style={{
                        fontSize: "var(--font-size-base)",
                        color: "var(--white-30)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      disponible
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: "var(--font-size-lg)",
                        fontWeight: 700,
                        color:
                          card.available_limit > 0
                            ? "var(--green)"
                            : "var(--red)",
                      }}
                    >
                      {formatCurrency(card.available_limit)}
                    </span>
                  </div>
                  {card.available_limit_usd_estimate != null && (
                    <div
                      className="font-mono"
                      style={{
                        fontSize: "var(--font-size-sm)",
                        color: "var(--white-30)",
                        textAlign: "right",
                        marginTop: -8,
                        marginBottom: 8,
                      }}
                    >
                      ≈{" "}
                      {formatCurrency(card.available_limit_usd_estimate, "USD")}
                    </div>
                  )}
                  <div className="progress-bar mb-4">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(usage, 100)}%`,
                        background: barColor,
                      }}
                    />
                  </div>
                  <div
                    className="flex flex-col font-mono"
                    style={{
                      fontSize: "10px",
                      color: "var(--white-30)",
                    }}
                  >
                    <span className="flex justify-between">
                      <span>Consumido {formatCurrency(card.total_spent)}</span>
                      {card.total_spent_usd > 0 && (
                        <span style={{ marginLeft: 4 }}>
                          ({formatCurrency(card.total_spent_ars)} +{" "}
                          {formatCurrency(card.total_spent_usd, "USD")})
                        </span>
                      )}
                    </span>
                    <span className="flex justify-between">
                      <span>Límite {formatCurrency(card.spend_limit)}</span>

                      {card.spend_limit_usd_estimate != null && (
                        <div
                          className="font-mono"
                          style={{
                            fontSize: "10px",
                            color: "var(--white-30)",
                            textAlign: "right",
                          }}
                        >
                          ≈{" "}
                          {formatCurrency(card.spend_limit_usd_estimate, "USD")}
                        </div>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openSpend(card)}
                  >
                    <FontAwesomeIcon icon={faPlus} style={{ marginRight: 8 }} />{" "}
                    Gasto
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openDetail(card)}
                  >
                    Detalle
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleUpdateLimit(card)}
                  >
                    Límite
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDeleteCard(card.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Card Modal */}
      <Modal
        isOpen={showCardModal}
        onClose={() => setShowCardModal(false)}
        title="Nueva Tarjeta"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCardModal(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateCard}
              disabled={submitting}
            >
              {submitting ? "Creando..." : "Crear"}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateCard}>
          <div className="form-group">
            <label className="form-label">Entidad</label>
            <select
              className="form-select"
              value={cardForm.entity_id}
              onChange={(e) =>
                setCardForm({ ...cardForm, entity_id: e.target.value })
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
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input
              className="form-input"
              type="text"
              placeholder="Visa Gold"
              value={cardForm.name}
              onChange={(e) =>
                setCardForm({ ...cardForm, name: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Límite ($)</label>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="500000"
              value={cardForm.spend_limit}
              onChange={(e) =>
                setCardForm({ ...cardForm, spend_limit: e.target.value })
              }
              required
            />
          </div>
        </form>
      </Modal>

      {/* Add Spend Modal */}
      <Modal
        isOpen={showSpendModal}
        onClose={() => setShowSpendModal(false)}
        title={`Gasto — ${selectedCard?.name || ""}`}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setShowSpendModal(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAddSpend}
              disabled={submitting}
            >
              {submitting ? "..." : "Registrar"}
            </button>
          </>
        }
      >
        <form onSubmit={handleAddSpend}>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input
              className="form-input"
              type="text"
              placeholder="Compra en Mercado Libre"
              value={spendForm.description}
              onChange={(e) =>
                setSpendForm({ ...spendForm, description: e.target.value })
              }
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Moneda</label>
              <select
                className="form-select"
                value={spendForm.currency}
                onChange={(e) =>
                  setSpendForm({
                    ...spendForm,
                    currency: e.target.value,
                    installments:
                      e.target.value === "USD" ? "1" : spendForm.installments,
                  })
                }
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Cuotas</label>
              <select
                className="form-select"
                value={spendForm.installments}
                onChange={(e) =>
                  setSpendForm({ ...spendForm, installments: e.target.value })
                }
                disabled={spendForm.currency === "USD"}
              >
                <option value="1">1 pago</option>
                <option value="3">3</option>
                <option value="6">6</option>
                <option value="9">9</option>
                <option value="12">12</option>
                <option value="18">18</option>
                <option value="24">24</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Vencimiento</label>
            <input
              className="form-input"
              type="date"
              value={spendForm.due_date}
              onChange={(e) =>
                setSpendForm({ ...spendForm, due_date: e.target.value })
              }
              required
            />
          </div>

          {!isInstallment ? (
            <div className="form-group">
              <label className="form-label">Monto</label>
              <input
                className="form-input"
                type="number"
                min="0.01"
                step="0.01"
                placeholder={spendForm.currency === "USD" ? "99.99" : "15000"}
                value={spendForm.amount}
                onChange={(e) =>
                  setSpendForm({ ...spendForm, amount: e.target.value })
                }
                required
              />
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Modo de ingreso</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`btn btn-sm ${spendForm.input_mode === "monthly" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() =>
                      setSpendForm({ ...spendForm, input_mode: "monthly" })
                    }
                  >
                    Cuota
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${spendForm.input_mode === "total" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() =>
                      setSpendForm({ ...spendForm, input_mode: "total" })
                    }
                  >
                    Total
                  </button>
                </div>
              </div>
              {spendForm.input_mode === "monthly" ? (
                <div className="form-group">
                  <label className="form-label">Monto por cuota ($)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="5000"
                    value={spendForm.monthly_amount}
                    onChange={(e) =>
                      setSpendForm({
                        ...spendForm,
                        monthly_amount: e.target.value,
                      })
                    }
                    required
                  />
                  {spendForm.monthly_amount && (
                    <span className="form-hint">
                      Total:{" "}
                      {formatCurrency(
                        parseFloat(spendForm.monthly_amount) *
                          parseInt(spendForm.installments),
                      )}
                    </span>
                  )}
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Monto total ($)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="60000"
                    value={spendForm.total_amount}
                    onChange={(e) =>
                      setSpendForm({
                        ...spendForm,
                        total_amount: e.target.value,
                      })
                    }
                    required
                  />
                  {spendForm.total_amount && (
                    <span className="form-hint">
                      Cuota:{" "}
                      {formatCurrency(
                        parseFloat(spendForm.total_amount) /
                          parseInt(spendForm.installments),
                      )}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={`${cardDetail?.name || ""}`}
      >
        {cardDetail && (
          <>
            <div className="flex justify-between mb-4">
              <span
                style={{
                  color: "var(--white-30)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                Límite
              </span>
              <div className="text-right">
                <span className="font-mono" style={{ fontWeight: 700 }}>
                  {formatCurrency(cardDetail.spend_limit)}
                </span>
                {cardDetail.spend_limit_usd_estimate != null && (
                  <div
                    className="font-mono"
                    style={{ fontSize: "10px", color: "var(--white-30)" }}
                  >
                    ≈{" "}
                    {formatCurrency(cardDetail.spend_limit_usd_estimate, "USD")}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between mb-4">
              <span
                style={{
                  color: "var(--white-30)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                Consumido
              </span>
              <div className="text-right">
                <span
                  className="font-mono"
                  style={{ fontWeight: 700, color: "var(--red)" }}
                >
                  {formatCurrency(cardDetail.total_spent)}
                </span>
                {cardDetail.total_spent_usd > 0 && (
                  <div
                    className="font-mono"
                    style={{ fontSize: "10px", color: "var(--white-30)" }}
                  >
                    {formatCurrency(cardDetail.total_spent_ars)} +{" "}
                    {formatCurrency(cardDetail.total_spent_usd, "USD")}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between mb-6">
              <span
                style={{
                  color: "var(--white-30)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                Disponible
              </span>
              <div className="text-right">
                <span
                  className="font-mono"
                  style={{ fontWeight: 700, color: "var(--green)" }}
                >
                  {formatCurrency(cardDetail.available_limit)}
                </span>
                {cardDetail.available_limit_usd_estimate != null && (
                  <div
                    className="font-mono"
                    style={{ fontSize: "10px", color: "var(--white-30)" }}
                  >
                    ≈{" "}
                    {formatCurrency(
                      cardDetail.available_limit_usd_estimate,
                      "USD",
                    )}
                  </div>
                )}
              </div>
            </div>
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
              gastos
            </div>
            {!cardDetail.spenditures || cardDetail.spenditures.length === 0 ? (
              <div
                style={{
                  color: "var(--white-15)",
                  fontSize: "var(--font-size-xs)",
                }}
              >
                sin gastos
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {cardDetail.spenditures.map((s: any) => {
                  const isPartiallyPaid =
                    s.remaining_installments < s.installments;
                  return (
                    <div
                      key={s.id}
                      className="list-item"
                      style={{
                        padding: "var(--space-2)",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "var(--font-size-sm)",
                          }}
                        >
                          {s.description}
                        </div>
                        <div
                          className="font-mono"
                          style={{
                            fontSize: "10px",
                            color: "var(--white-30)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                            marginTop: 2,
                          }}
                        >
                          <span>
                            {s.installments > 1
                              ? `${s.remaining_installments}/${s.installments}`
                              : "1x"}
                            {s.currency === "USD" && " · USD"}
                          </span>
                          {s.due_date && <DueBadge dueDate={s.due_date} />}
                          {s.is_paid_off && (
                            <span className="badge badge-success">pagado</span>
                          )}
                          {isPartiallyPaid && !s.is_paid_off && (
                            <span className="badge badge-warning">parcial</span>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <div className="text-right font-mono">
                          {s.installments > 1 ? (
                            <>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: "var(--font-size-sm)",
                                }}
                              >
                                {formatCurrency(s.monthly_amount, s.currency)}/m
                              </div>
                              <div
                                style={{
                                  fontSize: "10px",
                                  color: "var(--white-30)",
                                }}
                              >
                                total{" "}
                                {formatCurrency(s.total_amount, s.currency)}
                              </div>
                            </>
                          ) : (
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "var(--font-size-sm)",
                              }}
                            >
                              {formatCurrency(s.total_amount, s.currency)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => openEdit(s)}
                            title="Editar"
                            style={{ fontSize: "var(--font-size-xs)" }}
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDeleteSpend(s)}
                            title="Eliminar"
                            style={{ fontSize: "var(--font-size-xs)" }}
                          >
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Edit Spend Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar gasto"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setShowEditModal(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleEditSpend}
              disabled={submitting}
            >
              {submitting ? "..." : "Guardar"}
            </button>
          </>
        }
      >
        {editingSpenditure && (
          <form onSubmit={handleEditSpend}>
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <input
                className="form-input"
                type="text"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Vencimiento</label>
              <input
                className="form-input"
                type="date"
                value={editForm.due_date}
                onChange={(e) =>
                  setEditForm({ ...editForm, due_date: e.target.value })
                }
                required
              />
            </div>
            {(() => {
              const isPartiallyPaid =
                editingSpenditure.remaining_installments <
                editingSpenditure.installments;
              return isPartiallyPaid ? (
                <div
                  style={{
                    padding: "var(--space-3)",
                    border: "1px solid var(--yellow-15)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--yellow)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Los campos financieros no se pueden modificar en gastos con
                  cuotas liquidadas.
                </div>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Moneda</label>
                      <select
                        className="form-select"
                        value={editForm.currency}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            currency: e.target.value,
                          })
                        }
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monto total</label>
                      <input
                        className="form-input"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={editForm.amount}
                        onChange={(e) =>
                          setEditForm({ ...editForm, amount: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>
                </>
              );
            })()}
          </form>
        )}
      </Modal>

      <ToastContainer />
    </div>
  );
}
