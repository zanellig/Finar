import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  formatCurrency,
  formatPercent,
  entityTypeIcon,
  accountTypeLabel,
  LoadingPage,
  EmptyState,
} from "../components/shared";

interface DashboardData {
  net_worth: number;
  total_debt: number;
  monthly_obligations: number;
  loan_debt: number;
  cc_debt: number;
  monthly_loan_payments: number;
  monthly_cc_payments: number;
  accounts: any[];
  entities: any[];
  loans: any[];
  credit_cards: any[];
  recent_payments: any[];
  exchange_rates: any[];
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const result = await api.getDashboard();
      setData(result);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingPage />;
  if (!data)
    return <EmptyState icon="📊" text="Could not load dashboard data" />;

  const blueRate = data.exchange_rates.find((r: any) => r.source === "blue");
  const hasData = data.entities.length > 0;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Resumen de tus finanzas personales
            {blueRate && (
              <span style={{ marginLeft: "16px" }}>
                <span className="badge badge-cyan">
                  💵 Dólar Blue: {formatCurrency(blueRate.sell_rate)} venta
                </span>
              </span>
            )}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData}>
          ↻ Actualizar
        </button>
      </div>

      {!hasData ? (
        <EmptyState
          icon="🚀"
          text="¡Bienvenido! Empieza creando una entidad (banco, billetera o sociedad de bolsa) para comenzar."
        />
      ) : (
        <>
          {/* Stat Cards */}
          <div className="stats-grid">
            <div className="card stat-card positive animate-in stagger-1">
              <div className="card-header">
                <div>
                  <div className="card-title">Patrimonio Neto</div>
                  <div
                    className={`card-value ${data.net_worth >= 0 ? "currency-positive" : "currency-negative"}`}
                  >
                    {formatCurrency(data.net_worth)}
                  </div>
                </div>
                <div
                  className="card-icon"
                  style={{ background: "var(--accent-success-muted)" }}
                >
                  💰
                </div>
              </div>
              {blueRate && data.net_worth > 0 && (
                <div
                  style={{
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-muted)",
                  }}
                >
                  ≈ {formatCurrency(data.net_worth / blueRate.sell_rate, "USD")}
                </div>
              )}
            </div>

            <div className="card stat-card negative animate-in stagger-2">
              <div className="card-header">
                <div>
                  <div className="card-title">Deuda Total</div>
                  <div className="card-value currency-negative">
                    {formatCurrency(data.total_debt)}
                  </div>
                </div>
                <div
                  className="card-icon"
                  style={{ background: "var(--accent-danger-muted)" }}
                >
                  📉
                </div>
              </div>
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-muted)",
                }}
              >
                Préstamos: {formatCurrency(data.loan_debt)} · Tarjetas:{" "}
                {formatCurrency(data.cc_debt)}
              </div>
            </div>

            <div className="card stat-card neutral animate-in stagger-3">
              <div className="card-header">
                <div>
                  <div className="card-title">Obligaciones Mensuales</div>
                  <div className="card-value">
                    {formatCurrency(data.monthly_obligations)}
                  </div>
                </div>
                <div
                  className="card-icon"
                  style={{ background: "var(--accent-primary-muted)" }}
                >
                  📅
                </div>
              </div>
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-muted)",
                }}
              >
                Préstamos: {formatCurrency(data.monthly_loan_payments)} ·
                Tarjetas: {formatCurrency(data.monthly_cc_payments)}
              </div>
            </div>

            <div className="card stat-card info animate-in stagger-4">
              <div className="card-header">
                <div>
                  <div className="card-title">Entidades</div>
                  <div className="card-value">{data.entities.length}</div>
                </div>
                <div
                  className="card-icon"
                  style={{ background: "var(--accent-cyan-muted)" }}
                >
                  🏦
                </div>
              </div>
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-muted)",
                }}
              >
                {data.accounts.length} cuentas · {data.loans.length} préstamos ·{" "}
                {data.credit_cards.length} tarjetas
              </div>
            </div>
          </div>

          {/* Content Grid */}
          <div className="content-grid">
            {/* Accounts */}
            <div className="card">
              <div className="card-header">
                <h3
                  style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}
                >
                  Cuentas
                </h3>
                <span className="badge badge-primary">
                  {data.accounts.length}
                </span>
              </div>
              {data.accounts.length === 0 ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--font-size-sm)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  No hay cuentas registradas
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-1)",
                  }}
                >
                  {data.accounts.slice(0, 6).map((account: any) => (
                    <div key={account.id} className="list-item">
                      <div className="list-item-info">
                        <div
                          className="list-item-icon"
                          style={{ background: "var(--accent-primary-muted)" }}
                        >
                          {account.type === "savings"
                            ? "🏧"
                            : account.type === "checking"
                              ? "📋"
                              : "📈"}
                        </div>
                        <div className="list-item-details">
                          <div className="list-item-title">{account.name}</div>
                          <div className="list-item-subtitle">
                            {accountTypeLabel(account.type)} ·{" "}
                            {account.entity_name}
                          </div>
                        </div>
                      </div>
                      <div className="list-item-value">
                        <div
                          className={`list-item-amount ${account.balance >= 0 ? "currency-positive" : "currency-negative"}`}
                        >
                          {formatCurrency(account.balance, account.currency)}
                        </div>
                        {account.type === "interest" &&
                          account.tna_rate > 0 && (
                            <div className="tna-tag mt-2">
                              TNA {formatPercent(account.tna_rate)}
                            </div>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Debt Breakdown */}
            <div className="card">
              <div className="card-header">
                <h3
                  style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}
                >
                  Composición de Deuda
                </h3>
              </div>
              {data.total_debt === 0 ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--font-size-sm)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  No tenés deudas registradas 🎉
                </div>
              ) : (
                <div className="donut-chart">
                  <svg className="donut-svg" viewBox="0 0 42 42">
                    <circle
                      cx="21"
                      cy="21"
                      r="15.91549430918954"
                      fill="transparent"
                      stroke="var(--bg-input)"
                      strokeWidth="4"
                    />
                    {data.total_debt > 0 && (
                      <>
                        <circle
                          cx="21"
                          cy="21"
                          r="15.91549430918954"
                          fill="transparent"
                          stroke="var(--accent-danger)"
                          strokeWidth="4"
                          strokeDasharray={`${(data.loan_debt / data.total_debt) * 100} ${100 - (data.loan_debt / data.total_debt) * 100}`}
                          strokeDashoffset="0"
                        />
                        <circle
                          cx="21"
                          cy="21"
                          r="15.91549430918954"
                          fill="transparent"
                          stroke="var(--accent-warning)"
                          strokeWidth="4"
                          strokeDasharray={`${(data.cc_debt / data.total_debt) * 100} ${100 - (data.cc_debt / data.total_debt) * 100}`}
                          strokeDashoffset={`${-(data.loan_debt / data.total_debt) * 100}`}
                        />
                      </>
                    )}
                  </svg>
                  <div className="donut-legend">
                    <div className="donut-legend-item">
                      <div
                        className="donut-legend-dot"
                        style={{ background: "var(--accent-danger)" }}
                      />
                      <span>Préstamos: {formatCurrency(data.loan_debt)}</span>
                    </div>
                    <div className="donut-legend-item">
                      <div
                        className="donut-legend-dot"
                        style={{ background: "var(--accent-warning)" }}
                      />
                      <span>Tarjetas: {formatCurrency(data.cc_debt)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Active Loans */}
            <div className="card">
              <div className="card-header">
                <h3
                  style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}
                >
                  Préstamos Activos
                </h3>
                <span className="badge badge-danger">{data.loans.length}</span>
              </div>
              {data.loans.length === 0 ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--font-size-sm)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  Sin préstamos activos
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-1)",
                  }}
                >
                  {data.loans.slice(0, 5).map((loan: any) => (
                    <div key={loan.id} className="list-item">
                      <div className="list-item-info">
                        <div
                          className="list-item-icon"
                          style={{ background: "var(--accent-danger-muted)" }}
                        >
                          💳
                        </div>
                        <div className="list-item-details">
                          <div className="list-item-title">{loan.name}</div>
                          <div className="list-item-subtitle">
                            {loan.entity_name} · {loan.remaining_installments}/
                            {loan.installments} cuotas
                          </div>
                        </div>
                      </div>
                      <div className="list-item-value">
                        <div className="list-item-amount currency-negative">
                          {formatCurrency(loan.monthly_payment)}/mes
                        </div>
                        <div className="list-item-label">
                          CFTEA {formatPercent(loan.cftea)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Credit Cards */}
            <div className="card">
              <div className="card-header">
                <h3
                  style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}
                >
                  Tarjetas de Crédito
                </h3>
                <span className="badge badge-purple">
                  {data.credit_cards.length}
                </span>
              </div>
              {data.credit_cards.length === 0 ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--font-size-sm)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  Sin tarjetas
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}
                >
                  {data.credit_cards.slice(0, 5).map((card: any) => {
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
                        style={{ padding: "var(--space-3) 0" }}
                      >
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <div style={{ fontWeight: 600 }}>{card.name}</div>
                            <div
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {card.entity_name}
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "var(--font-size-sm)",
                              }}
                            >
                              Disponible: {formatCurrency(card.available_limit)}
                            </div>
                            <div
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "var(--text-muted)",
                              }}
                            >
                              de {formatCurrency(card.spend_limit)}
                            </div>
                          </div>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min(usage, 100)}%`,
                              background: barColor,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Payments */}
            <div className="card full-width">
              <div className="card-header">
                <h3
                  style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}
                >
                  Pagos Recientes
                </h3>
                <span className="badge badge-primary">
                  {data.recent_payments.length}
                </span>
              </div>
              {data.recent_payments.length === 0 ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "var(--font-size-sm)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  No hay pagos registrados
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Descripción</th>
                      <th>Cuenta</th>
                      <th style={{ textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_payments.map((payment: any) => (
                      <tr key={payment.id}>
                        <td>
                          {new Date(payment.created_at).toLocaleDateString(
                            "es-AR",
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${payment.type === "loan" ? "badge-danger" : "badge-purple"}`}
                          >
                            {payment.type === "loan" ? "Préstamo" : "Tarjeta"}
                          </span>
                        </td>
                        <td>{payment.description || "—"}</td>
                        <td>{payment.account_name}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {formatCurrency(payment.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Exchange Rates */}
            {data.exchange_rates.length > 0 && (
              <div className="card full-width">
                <div className="card-header">
                  <h3
                    style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}
                  >
                    Cotizaciones USD/ARS
                  </h3>
                  <span className="badge badge-cyan">
                    {data.exchange_rates[0]?.fetched_at
                      ? new Date(
                          data.exchange_rates[0].fetched_at,
                        ).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
                <div className="chart-container chart-bar-container">
                  {data.exchange_rates.map((rate: any) => {
                    const maxRate = Math.max(
                      ...data.exchange_rates.map((r: any) => r.sell_rate),
                    );
                    const height =
                      maxRate > 0 ? (rate.sell_rate / maxRate) * 85 : 0;
                    return (
                      <div key={rate.id} className="chart-bar-wrapper">
                        <div className="chart-bar-value">
                          {formatCurrency(rate.sell_rate)}
                        </div>
                        <div
                          className="chart-bar"
                          style={{
                            height: `${height}%`,
                            background:
                              rate.source === "blue"
                                ? "var(--accent-cyan)"
                                : rate.source === "oficial"
                                  ? "var(--accent-primary)"
                                  : rate.source === "tarjeta"
                                    ? "var(--accent-purple)"
                                    : "var(--accent-warning)",
                          }}
                        />
                        <div className="chart-bar-label">{rate.source}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
