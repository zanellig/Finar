import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  Modal,
  useToast,
  formatCurrency,
  LoadingPage,
  EmptyState,
} from "../components/shared";

export function CreditCards() {
  const [cards, setCards] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [cardDetail, setCardDetail] = useState<any>(null);
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
    input_mode: "amount" as "amount" | "monthly" | "total",
  });
  const [submitting, setSubmitting] = useState(false);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [cardsData, entitiesData] = await Promise.all([
        api.getCreditCards(),
        api.getEntities(),
      ]);
      setCards(cardsData);
      setEntities(entitiesData);
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
      input_mode: "amount",
    });
    setShowSpendModal(true);
  }

  async function openDetail(card: any) {
    try {
      const detail = await api.getCreditCard(card.id);
      setCardDetail(detail);
      setShowDetailModal(true);
    } catch (err: any) {
      addToast(err.message, "error");
    }
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
      addToast("Tarjeta de crédito creada");
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

    const installments = parseInt(spendForm.installments);
    const payload: any = {
      description: spendForm.description,
      currency: spendForm.currency,
      installments,
    };

    if (installments === 1) {
      payload.amount = parseFloat(spendForm.amount);
    } else {
      if (spendForm.input_mode === "monthly") {
        payload.monthly_amount = parseFloat(spendForm.monthly_amount);
      } else {
        payload.total_amount = parseFloat(spendForm.total_amount);
      }
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

  async function handleDeleteCard(id: string) {
    if (!confirm("¿Eliminar esta tarjeta de crédito?")) return;
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
            Gestioná tus tarjetas y registrá gastos
          </p>
        </div>
        <button
          id="create-card-btn"
          className="btn btn-primary"
          onClick={openCreate}
          disabled={entities.length === 0}
        >
          + Nueva Tarjeta
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
            tarjetas.
          </p>
        </div>
      )}

      {cards.length === 0 ? (
        <EmptyState icon="💳" text="No hay tarjetas registradas" />
      ) : (
        <div
          className="stats-grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          }}
        >
          {cards.map((card, i) => {
            const usage =
              card.spend_limit > 0
                ? (card.total_spent / card.spend_limit) * 100
                : 0;
            const barColor =
              usage > 80
                ? "var(--accent-danger)"
                : usage > 50
                  ? "var(--accent-warning)"
                  : "var(--accent-success)";

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
                        fontSize: "var(--font-size-lg)",
                      }}
                    >
                      {card.name}
                    </div>
                    <span className="badge badge-purple">
                      {card.entity_name}
                    </span>
                  </div>
                  <div
                    className="list-item-icon"
                    style={{ background: "var(--accent-purple-muted)" }}
                  >
                    💳
                  </div>
                </div>

                <div style={{ marginTop: "var(--space-4)" }}>
                  <div className="flex justify-between items-center mb-4">
                    <span
                      style={{
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-muted)",
                      }}
                    >
                      Disponible
                    </span>
                    <span
                      style={{
                        fontSize: "var(--font-size-2xl)",
                        fontWeight: 800,
                        color:
                          card.available_limit > 0
                            ? "var(--accent-success)"
                            : "var(--accent-danger)",
                      }}
                    >
                      {formatCurrency(card.available_limit)}
                    </span>
                  </div>
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
                    className="flex justify-between"
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>Consumido: {formatCurrency(card.total_spent)}</span>
                    <span>Límite: {formatCurrency(card.spend_limit)}</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openSpend(card)}
                  >
                    + Gasto
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
                    Editar Límite
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDeleteCard(card.id)}
                  >
                    🗑️
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
        title="Nueva Tarjeta de Crédito"
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
              <option value="">Seleccioná una entidad</option>
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
              placeholder="Ej: Visa Gold"
              value={cardForm.name}
              onChange={(e) =>
                setCardForm({ ...cardForm, name: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Límite de gasto ($)</label>
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
        title={`Nuevo gasto — ${selectedCard?.name || ""}`}
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
              {submitting ? "Registrando..." : "Registrar"}
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
              placeholder="Ej: Compra en Mercado Libre"
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
                onChange={(e) => {
                  const currency = e.target.value;
                  setSpendForm({
                    ...spendForm,
                    currency,
                    installments:
                      currency === "USD" ? "1" : spendForm.installments,
                  });
                }}
              >
                <option value="ARS">🇦🇷 ARS (Pesos)</option>
                <option value="USD">🇺🇸 USD (Dólares)</option>
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
                <option value="1">1 (pago único)</option>
                <option value="3">3 cuotas</option>
                <option value="6">6 cuotas</option>
                <option value="9">9 cuotas</option>
                <option value="12">12 cuotas</option>
                <option value="18">18 cuotas</option>
                <option value="24">24 cuotas</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
          </div>

          {spendForm.installments === "custom" && (
            <div className="form-group">
              <label className="form-label">Número de cuotas</label>
              <input
                className="form-input"
                type="number"
                min="2"
                max="120"
                placeholder="Ej: 15"
                onChange={(e) =>
                  setSpendForm({ ...spendForm, installments: e.target.value })
                }
              />
            </div>
          )}

          {spendForm.currency === "USD" && (
            <div
              className="form-hint"
              style={{ color: "var(--accent-warning)" }}
            >
              ℹ️ Cuotas solo disponibles en pesos argentinos
            </div>
          )}

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
                <label className="form-label">Ingresar por:</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`btn btn-sm ${spendForm.input_mode === "monthly" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() =>
                      setSpendForm({ ...spendForm, input_mode: "monthly" })
                    }
                  >
                    Cuota mensual
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${spendForm.input_mode === "total" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() =>
                      setSpendForm({ ...spendForm, input_mode: "total" })
                    }
                  >
                    Monto total
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
        title={`Detalle — ${cardDetail?.name || ""}`}
      >
        {cardDetail && (
          <>
            <div className="flex justify-between mb-4">
              <span style={{ color: "var(--text-muted)" }}>Límite:</span>
              <span style={{ fontWeight: 700 }}>
                {formatCurrency(cardDetail.spend_limit)}
              </span>
            </div>
            <div className="flex justify-between mb-4">
              <span style={{ color: "var(--text-muted)" }}>Consumido:</span>
              <span style={{ fontWeight: 700, color: "var(--accent-danger)" }}>
                {formatCurrency(cardDetail.total_spent)}
              </span>
            </div>
            <div className="flex justify-between mb-6">
              <span style={{ color: "var(--text-muted)" }}>Disponible:</span>
              <span style={{ fontWeight: 700, color: "var(--accent-success)" }}>
                {formatCurrency(cardDetail.available_limit)}
              </span>
            </div>

            <h4 style={{ fontWeight: 700, marginBottom: "var(--space-3)" }}>
              Gastos
            </h4>
            {!cardDetail.spenditures || cardDetail.spenditures.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                Sin gastos registrados
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {cardDetail.spenditures.map((s: any) => (
                  <div
                    key={s.id}
                    className="list-item"
                    style={{ padding: "var(--space-3)" }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "var(--font-size-sm)",
                        }}
                      >
                        {s.description}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--font-size-xs)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {s.installments > 1
                          ? `${s.remaining_installments}/${s.installments} cuotas`
                          : "Pago único"}
                        {s.currency === "USD" && " · USD"}
                        {" · "}
                        {new Date(s.created_at).toLocaleDateString("es-AR")}
                      </div>
                    </div>
                    <div className="text-right">
                      {s.installments > 1 ? (
                        <>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "var(--font-size-sm)",
                            }}
                          >
                            {formatCurrency(s.monthly_amount, s.currency)}/mes
                          </div>
                          <div
                            style={{
                              fontSize: "var(--font-size-xs)",
                              color: "var(--text-muted)",
                            }}
                          >
                            Total: {formatCurrency(s.total_amount, s.currency)}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontWeight: 600 }}>
                          {formatCurrency(s.total_amount, s.currency)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      <ToastContainer />
    </div>
  );
}
