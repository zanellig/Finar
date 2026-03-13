import React, { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import {
  Modal,
  useToast,
  formatCurrency,
  LoadingPage,
  EmptyState,
} from "../components/shared";
import { DataTable } from "../components/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faCircleDollarToSlot,
  faHandHoldingDollar,
  faCircleCheck,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { faCreditCard } from "@fortawesome/free-regular-svg-icons";

type PaymentRow = {
  id: string;
  created_at: string;
  type: "loan" | "cc";
  target_name: string;
  description: string | null;
  account_name: string;
  amount: number;
  account_currency?: string;
};

/**
 * Compute the "per-period" cost for a credit card — i.e. the sum of all
 * unpaid spenditures' monthly_amount within a single currency.
 *
 * Returns an array of { currency, perPeriod, maxPeriods } tuples so the
 * UI can handle multi-currency cards correctly.
 */
interface CurrencyPeriodInfo {
  currency: string;
  perPeriod: number;
  maxPeriods: number;
}

function computeCardPeriods(spenditures: any[]): CurrencyPeriodInfo[] {
  const unpaid = spenditures.filter((s: any) => !s.is_paid_off);
  if (unpaid.length === 0) return [];

  // Group by currency
  const byCurrency = new Map<string, any[]>();
  for (const s of unpaid) {
    const cur = s.currency ?? "ARS";
    if (!byCurrency.has(cur)) byCurrency.set(cur, []);
    byCurrency.get(cur)!.push(s);
  }

  const result: CurrencyPeriodInfo[] = [];
  for (const [currency, items] of byCurrency) {
    const perPeriod = items.reduce(
      (sum: number, s: any) => sum + (s.monthly_amount ?? 0),
      0,
    );
    // The max periods we can pay = the smallest remaining_installments in
    // this currency group, since per-period cost decreases as individual
    // spenditures finish (we keep it simple → cap at smallest remaining).
    const maxPeriods = Math.min(
      ...items.map((s: any) => s.remaining_installments ?? 0),
    );
    if (perPeriod > 0 && maxPeriods > 0) {
      result.push({ currency, perPeriod, maxPeriods });
    }
  }
  return result;
}

export function Payments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Card detail cache: cardId → detail (with spenditures)
  const [cardDetails, setCardDetails] = useState<Record<string, any>>({});
  const [loadingCardDetail, setLoadingCardDetail] = useState(false);

  const [form, setForm] = useState({
    type: "loan",
    target_id: "",
    account_id: "",
    installments_to_pay: 1,
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

  /** Fetch card detail (with spenditures) and cache it. */
  async function ensureCardDetail(cardId: string) {
    if (cardDetails[cardId]) return;
    setLoadingCardDetail(true);
    try {
      const detail = await api.getCreditCard(cardId);
      setCardDetails((prev) => ({ ...prev, [cardId]: detail }));
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoadingCardDetail(false);
    }
  }

  function openCreate() {
    setForm({
      type: "loan",
      target_id: loans[0]?.id || "",
      account_id: accounts[0]?.id || "",
      installments_to_pay: 1,
      description: "",
    });
    setShowModal(true);
  }

  // Whenever the target changes for a CC, fetch detail
  useEffect(() => {
    if (form.type === "cc" && form.target_id) {
      ensureCardDetail(form.target_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, form.target_id]);

  // ── Derived state ─────────────────────────────────────────────────

  const targets = form.type === "loan" ? loans : cards;
  const selectedAccount = accounts.find((a: any) => a.id === form.account_id);

  // For loan: amount = monthly_payment
  const selectedLoan =
    form.type === "loan"
      ? loans.find((l: any) => l.id === form.target_id)
      : null;

  // For CC: period info from spenditures
  const cardDetail = form.type === "cc" ? cardDetails[form.target_id] : null;

  const periodInfos: CurrencyPeriodInfo[] = useMemo(() => {
    if (form.type !== "cc" || !cardDetail?.spenditures) return [];
    return computeCardPeriods(cardDetail.spenditures);
  }, [form.type, cardDetail]);

  // The relevant currency period = the one matching the selected account
  const accountCurrency = selectedAccount?.currency ?? "ARS";

  const matchedPeriod = useMemo(() => {
    if (form.type !== "cc") return null;
    return periodInfos.find((p) => p.currency === accountCurrency) ?? null;
  }, [form.type, periodInfos, accountCurrency]);

  // Determine the max installments the user can pick
  const maxInstallments = useMemo(() => {
    if (form.type === "loan") return 1; // loans are always 1 installment
    return matchedPeriod?.maxPeriods ?? 0;
  }, [form.type, matchedPeriod]);

  // Compute the total payment amount
  const computedAmount = useMemo(() => {
    if (form.type === "loan") {
      return selectedLoan?.monthly_payment ?? 0;
    }
    if (!matchedPeriod) return 0;
    return (
      Math.round(matchedPeriod.perPeriod * form.installments_to_pay * 100) / 100
    );
  }, [form.type, selectedLoan, matchedPeriod, form.installments_to_pay]);

  // Clamp installments_to_pay when maxInstallments decreases
  useEffect(() => {
    if (maxInstallments > 0 && form.installments_to_pay > maxInstallments) {
      setForm((prev) => ({ ...prev, installments_to_pay: maxInstallments }));
    }
  }, [maxInstallments, form.installments_to_pay]);

  // Determine the currency of the payment
  const paymentCurrency = accountCurrency;

  // Funds check
  const fundsStatus = useMemo<"sufficient" | "insufficient" | "unknown">(() => {
    if (!selectedAccount || computedAmount <= 0) return "unknown";
    const minBalance =
      selectedAccount.type === "checking"
        ? -(selectedAccount.overdraft_limit ?? 0)
        : 0;
    const remaining = selectedAccount.balance - computedAmount;
    return remaining >= minBalance ? "sufficient" : "insufficient";
  }, [selectedAccount, computedAmount]);

  // Can submit?
  const canSubmit =
    form.target_id &&
    form.account_id &&
    computedAmount > 0 &&
    fundsStatus === "sufficient" &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.createPayment({
        type: form.type,
        target_id: form.target_id,
        account_id: form.account_id,
        amount: computedAmount,
        description: form.description,
      });
      addToast("Pago registrado");
      setShowModal(false);
      // Invalidate card detail cache so next open re-fetches
      if (form.type === "cc") {
        setCardDetails((prev) => {
          const copy = { ...prev };
          delete copy[form.target_id];
          return copy;
        });
      }
      loadData();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        accessorKey: "created_at",
        header: "Fecha",
        cell: ({ row }: { row: { original: PaymentRow } }) => (
          <span className="font-mono">
            {new Date(row.original.created_at).toLocaleDateString("es-AR")}
          </span>
        ),
      },
      {
        accessorKey: "type",
        header: "Tipo",
        cell: ({ row }: { row: { original: PaymentRow } }) => {
          const p = row.original;
          const isLoan = p.type === "loan";
          return (
            <span
              className={`badge ${isLoan ? "badge-danger" : "badge-purple"}`}
            >
              <FontAwesomeIcon
                icon={isLoan ? faHandHoldingDollar : faCreditCard}
                style={{ marginRight: 4 }}
              />
              {isLoan ? "préstamo" : "tarjeta"}
            </span>
          );
        },
      },
      {
        accessorKey: "target_name",
        header: "Destino",
        cell: ({ row }: { row: { original: PaymentRow } }) => (
          <span style={{ fontWeight: 600, color: "var(--white-90)" }}>
            {row.original.target_name}
          </span>
        ),
      },
      {
        accessorKey: "description",
        header: "Descripción",
        cell: ({ row }: { row: { original: PaymentRow } }) => (
          <span style={{ color: "var(--white-30)" }}>
            {row.original.description || "—"}
          </span>
        ),
      },
      {
        accessorKey: "account_name",
        header: "Cuenta",
        cell: ({ row }: { row: { original: PaymentRow } }) => (
          <span>{row.original.account_name}</span>
        ),
      },
      {
        accessorKey: "amount",
        header: () => (
          <span className="block text-right" style={{ width: "100%" }}>
            Monto
          </span>
        ),
        cell: ({ row }: { row: { original: PaymentRow } }) => (
          <span
            className="font-mono"
            style={{
              textAlign: "right",
              display: "block",
              fontWeight: 700,
              color: "var(--white-90)",
            }}
          >
            {formatCurrency(row.original.amount, row.original.account_currency)}
          </span>
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
          <h1 className="page-title">Pagos</h1>
          <p className="page-subtitle">
            registrá pagos de préstamos y tarjetas
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openCreate}
          disabled={
            accounts.length === 0 || (loans.length === 0 && cards.length === 0)
          }
        >
          <FontAwesomeIcon icon={faPlus} style={{ marginRight: 8 }} /> Registrar
          Pago
        </button>
      </div>

      {(accounts.length === 0 ||
        (loans.length === 0 && cards.length === 0)) && (
        <div
          className="card mb-6"
          style={{ borderColor: "var(--yellow)", borderLeftWidth: 3 }}
        >
          <p
            style={{ color: "var(--yellow)", fontSize: "var(--font-size-sm)" }}
          >
            Necesitás al menos una cuenta y un préstamo o tarjeta.
          </p>
        </div>
      )}

      {payments.length === 0 ? (
        <EmptyState
          icon={faCircleDollarToSlot}
          text="No hay pagos registrados"
        />
      ) : (
        <div className="card">
          <DataTable<PaymentRow> data={payments} columns={columns} />
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
              disabled={!canSubmit}
            >
              {submitting ? "..." : "Registrar"}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          {/* ── Tipo ── */}
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select
              className="form-select"
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value,
                  target_id: "",
                  installments_to_pay: 1,
                })
              }
            >
              <option value="loan">Préstamo</option>
              <option value="cc">Tarjeta de Crédito</option>
            </select>
          </div>

          {/* ── Target ── */}
          <div className="form-group">
            <label className="form-label">
              {form.type === "loan" ? "Préstamo" : "Tarjeta"}
            </label>
            <select
              className="form-select"
              value={form.target_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  target_id: e.target.value,
                  installments_to_pay: 1,
                })
              }
              required
            >
              <option value="">Seleccioná...</option>
              {targets.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.entity_name || ""}
                  {form.type === "loan"
                    ? ` (${t.remaining_installments} cuotas)`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          {/* ── Account ── */}
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
                saldo:{" "}
                {formatCurrency(
                  selectedAccount.balance,
                  selectedAccount.currency,
                )}
                {selectedAccount.type === "checking" &&
                  selectedAccount.overdraft_limit > 0 &&
                  ` · desc: ${formatCurrency(selectedAccount.overdraft_limit)}`}
              </span>
            )}
          </div>

          {/* ── Installments selector (CC only, when detail loaded) ── */}
          {form.type === "cc" && form.target_id && (
            <div className="form-group">
              <label className="form-label">Cuotas a pagar</label>
              {loadingCardDetail ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  <div className="spinner" />
                  <span className="form-hint">Cargando gastos...</span>
                </div>
              ) : maxInstallments > 0 ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-4)",
                    }}
                  >
                    <input
                      type="range"
                      min={1}
                      max={maxInstallments}
                      step={1}
                      value={form.installments_to_pay}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          installments_to_pay: parseInt(e.target.value),
                        })
                      }
                      style={{
                        flex: 1,
                        accentColor: "var(--green)",
                        cursor: "pointer",
                      }}
                    />
                    <span
                      className="font-mono"
                      style={{
                        color: "var(--green)",
                        fontWeight: 700,
                        fontSize: "var(--font-size-lg)",
                        minWidth: 60,
                        textAlign: "center",
                      }}
                    >
                      {form.installments_to_pay}/{maxInstallments}
                    </span>
                  </div>
                  {matchedPeriod && (
                    <span className="form-hint">
                      costo por período:{" "}
                      {formatCurrency(
                        matchedPeriod.perPeriod,
                        matchedPeriod.currency,
                      )}
                      /mes
                    </span>
                  )}
                </>
              ) : (
                <span className="form-hint" style={{ color: "var(--yellow)" }}>
                  {periodInfos.length > 0
                    ? `No hay cuotas pendientes en ${accountCurrency} para esta tarjeta.`
                    : "No hay cuotas pendientes en esta tarjeta."}
                </span>
              )}
            </div>
          )}

          {/* ── Loan info (informational) ── */}
          {form.type === "loan" && selectedLoan && (
            <div className="form-group">
              <label className="form-label">Cuota</label>
              <span className="form-hint">
                cuota mensual fija · {selectedLoan.remaining_installments}/
                {selectedLoan.installments} restantes
              </span>
            </div>
          )}

          {/* ── Computed Amount Display ── */}
          {form.target_id && computedAmount > 0 && (
            <div
              style={{
                background: "var(--black)",
                border: `1px solid ${
                  fundsStatus === "insufficient"
                    ? "rgba(255, 59, 59, 0.35)"
                    : fundsStatus === "sufficient"
                      ? "var(--green-15)"
                      : "var(--white-06)"
                }`,
                borderRadius: "var(--radius-md)",
                padding: "var(--space-4)",
                transition: "border-color 200ms ease",
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
                monto a pagar
              </div>
              <div
                className="flex justify-between items-center"
                style={{ marginBottom: "var(--space-3)" }}
              >
                <span
                  className="font-mono"
                  style={{
                    fontSize: "var(--font-size-2xl)",
                    fontWeight: 700,
                    color:
                      fundsStatus === "insufficient"
                        ? "var(--red)"
                        : "var(--green)",
                    letterSpacing: "-0.03em",
                    transition: "color 200ms ease",
                  }}
                >
                  {formatCurrency(computedAmount, paymentCurrency)}
                </span>

                {/* Funds indicator badge */}
                {fundsStatus !== "unknown" && (
                  <span
                    className={`badge ${
                      fundsStatus === "sufficient"
                        ? "badge-success"
                        : "badge-danger"
                    }`}
                    style={{
                      animation: "fadeIn 0.2s ease",
                    }}
                  >
                    {fundsStatus === "sufficient" ? (
                      <>
                        <FontAwesomeIcon
                          icon={faCircleCheck}
                          style={{ marginRight: 4 }}
                        />{" "}
                        fondos OK
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon
                          icon={faCircleExclamation}
                          style={{ marginRight: 4 }}
                        />{" "}
                        fondos insuf.
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Balance after payment preview */}
              {selectedAccount && fundsStatus !== "unknown" && (
                <div
                  className="flex justify-between"
                  style={{ fontSize: "var(--font-size-xs)" }}
                >
                  <span style={{ color: "var(--white-30)" }}>
                    saldo posterior
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontWeight: 600,
                      color:
                        fundsStatus === "insufficient"
                          ? "var(--red)"
                          : "var(--white-70)",
                    }}
                  >
                    {formatCurrency(
                      Math.round(
                        (selectedAccount.balance - computedAmount) * 100,
                      ) / 100,
                      selectedAccount.currency,
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Description ── */}
          <div className="form-group">
            <label className="form-label">Descripción (opcional)</label>
            <input
              className="form-input"
              type="text"
              placeholder="Cuota 3/12"
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
