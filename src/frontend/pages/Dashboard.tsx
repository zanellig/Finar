import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  formatCurrency,
  formatPercent,
  accountTypeLabel,
  LoadingPage,
  EmptyState,
  DataTable,
} from "../components/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faTriangleExclamation,
  faArrowRight,
  faDollarSign,
  faArrowDown,
  faBars,
  faBuildingColumns,
  faHandHoldingDollar,
  faPiggyBank,
  faCreditCard,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";

type RecentPaymentRow = {
  id: string;
  created_at: string;
  type: "loan" | "cc";
  description: string | null;
  account_name: string;
  amount: number;
};

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
  recent_payments: RecentPaymentRow[];
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
      setData(await api.getDashboard());
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingPage />;
  if (!data)
    return (
      <EmptyState
        icon={faTriangleExclamation}
        text="Could not load dashboard data"
      />
    );

  const blueRate = data.exchange_rates.find((r: any) => r.source === "blue");
  const hasData = data.entities.length > 0;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            resumen de finanzas personales
            {blueRate && (
              <span style={{ marginLeft: 16 }}>
                <span className="badge badge-primary">
                  USD Blue · {formatCurrency(blueRate.sell_rate)}
                </span>
              </span>
            )}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData}>
          <FontAwesomeIcon icon={faArrowsRotate} style={{ marginRight: 8 }} />{" "}
          Refresh
        </button>
      </div>

      {!hasData ? (
        <EmptyState
          icon={faArrowRight}
          text="Bienvenido. Empezá creando una entidad (banco, billetera, o sociedad de bolsa) para comenzar a trackear tus finanzas."
        />
      ) : (
        <>
          {/* ---- Stat Cards ---- */}
          <div className="stats-grid">
            <div className="card stat-card positive animate-in stagger-1">
              <div className="card-header">
                <div>
                  <div className="card-title">Patrimonio neto</div>
                  <div
                    className={`card-value ${data.net_worth >= 0 ? "currency-positive" : "currency-negative"}`}
                  >
                    {formatCurrency(data.net_worth)}
                  </div>
                </div>
                <div
                  className="card-icon"
                  style={{
                    background: "var(--green-06)",
                    color: "var(--green)",
                  }}
                >
                  <FontAwesomeIcon icon={faDollarSign} />
                </div>
              </div>
              {blueRate && data.net_worth > 0 && (
                <div
                  className="font-mono"
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--white-30)",
                  }}
                >
                  ≈ {formatCurrency(data.net_worth / blueRate.sell_rate, "USD")}
                </div>
              )}
            </div>

            <div className="card stat-card negative animate-in stagger-2">
              <div className="card-header">
                <div>
                  <div className="card-title">Deuda total</div>
                  <div className="card-value currency-negative">
                    {formatCurrency(data.total_debt)}
                  </div>
                </div>
                <div
                  className="card-icon"
                  style={{ background: "var(--red-15)", color: "var(--red)" }}
                >
                  <FontAwesomeIcon icon={faArrowDown} />
                </div>
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--white-30)",
                }}
              >
                préstamos {formatCurrency(data.loan_debt)} · tarjetas{" "}
                {formatCurrency(data.cc_debt)}
              </div>
            </div>

            <div className="card stat-card neutral animate-in stagger-3">
              <div className="card-header">
                <div>
                  <div className="card-title">Obligaciones mensuales</div>
                  <div className="card-value" style={{ color: "var(--white)" }}>
                    {formatCurrency(data.monthly_obligations)}
                  </div>
                </div>
                <div
                  className="card-icon"
                  style={{
                    background: "var(--white-06)",
                    color: "var(--white-50)",
                  }}
                >
                  <FontAwesomeIcon icon={faBars} />
                </div>
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--white-30)",
                }}
              >
                préstamos {formatCurrency(data.monthly_loan_payments)} ·
                tarjetas {formatCurrency(data.monthly_cc_payments)}
              </div>
            </div>

            <div className="card stat-card info animate-in stagger-4">
              <div className="card-header">
                <div>
                  <div className="card-title">Entidades</div>
                  <div className="card-value" style={{ color: "var(--blue)" }}>
                    {data.entities.length}
                  </div>
                </div>
                <div
                  className="card-icon"
                  style={{ background: "var(--blue-15)", color: "var(--blue)" }}
                >
                  <FontAwesomeIcon icon={faBuildingColumns} />
                </div>
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--white-30)",
                }}
              >
                {data.accounts.length} cuentas · {data.loans.length} préstamos ·{" "}
                {data.credit_cards.length} tarjetas
              </div>
            </div>
          </div>

          {/* ---- Content Grid ---- */}
          <div className="content-grid">
            {/* Accounts */}
            <div className="card">
              <div className="card-header">
                <h3
                  style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}
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
                    color: "var(--white-30)",
                    fontSize: "var(--font-size-xs)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  No hay cuentas registradas
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  {data.accounts.slice(0, 6).map((account: any) => (
                    <div key={account.id} className="list-item">
                      <div className="list-item-info">
                        <div
                          className="list-item-icon"
                          style={{
                            background: "var(--green-06)",
                            color: "var(--green)",
                          }}
                        >
                          {account.type === "savings" ? (
                            <FontAwesomeIcon icon={faPiggyBank} />
                          ) : account.type === "checking" ? (
                            <FontAwesomeIcon icon={faCreditCard} />
                          ) : (
                            <FontAwesomeIcon icon={faWallet} />
                          )}
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
                  style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}
                >
                  Composición de deuda
                </h3>
              </div>
              {data.total_debt === 0 ? (
                <div
                  style={{
                    color: "var(--white-30)",
                    fontSize: "var(--font-size-xs)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  Sin deudas registradas
                </div>
              ) : (
                <div className="donut-chart">
                  <svg className="donut-svg" viewBox="0 0 42 42">
                    <circle
                      cx="21"
                      cy="21"
                      r="15.91549430918954"
                      fill="transparent"
                      stroke="var(--white-06)"
                      strokeWidth="3"
                    />
                    {data.total_debt > 0 && (
                      <>
                        <circle
                          cx="21"
                          cy="21"
                          r="15.91549430918954"
                          fill="transparent"
                          stroke="var(--red)"
                          strokeWidth="3"
                          strokeDasharray={`${(data.loan_debt / data.total_debt) * 100} ${100 - (data.loan_debt / data.total_debt) * 100}`}
                          strokeDashoffset="0"
                        />
                        <circle
                          cx="21"
                          cy="21"
                          r="15.91549430918954"
                          fill="transparent"
                          stroke="var(--yellow)"
                          strokeWidth="3"
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
                        style={{ background: "var(--red)" }}
                      />
                      <span>Préstamos · {formatCurrency(data.loan_debt)}</span>
                    </div>
                    <div className="donut-legend-item">
                      <div
                        className="donut-legend-dot"
                        style={{ background: "var(--yellow)" }}
                      />
                      <span>Tarjetas · {formatCurrency(data.cc_debt)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Active Loans */}
            <div className="card">
              <div className="card-header">
                <h3
                  style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}
                >
                  Préstamos activos
                </h3>
                <span className="badge badge-danger">{data.loans.length}</span>
              </div>
              {data.loans.length === 0 ? (
                <div
                  style={{
                    color: "var(--white-30)",
                    fontSize: "var(--font-size-xs)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  Sin préstamos activos
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  {data.loans.slice(0, 5).map((loan: any) => (
                    <div key={loan.id} className="list-item">
                      <div className="list-item-info">
                        <div
                          className="list-item-icon"
                          style={{
                            background: "var(--red-15)",
                            color: "var(--red)",
                          }}
                        >
                          <FontAwesomeIcon icon={faHandHoldingDollar} />
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
                          {formatCurrency(loan.monthly_payment)}/m
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
                  style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}
                >
                  Tarjetas de crédito
                </h3>
                <span className="badge badge-purple">
                  {data.credit_cards.length}
                </span>
              </div>
              {data.credit_cards.length === 0 ? (
                <div
                  style={{
                    color: "var(--white-30)",
                    fontSize: "var(--font-size-xs)",
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
                    gap: "var(--space-4)",
                  }}
                >
                  {data.credit_cards.slice(0, 5).map((card: any) => {
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
                        style={{ padding: "var(--space-2) 0" }}
                      >
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "var(--font-size-sm)",
                              }}
                            >
                              {card.name}
                            </div>
                            <div
                              style={{
                                fontSize: "var(--font-size-xs)",
                                color: "var(--white-30)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {card.entity_name}
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className="font-mono"
                              style={{
                                fontWeight: 600,
                                fontSize: "var(--font-size-sm)",
                                color:
                                  card.available_limit > 0
                                    ? "var(--green)"
                                    : "var(--red)",
                              }}
                            >
                              {formatCurrency(card.available_limit)}
                            </div>
                            <div
                              className="font-mono"
                              style={{
                                fontSize: "10px",
                                color: "var(--white-30)",
                              }}
                            >
                              / {formatCurrency(card.spend_limit)}
                              {card.spend_limit_usd_estimate != null && (
                                <span style={{ marginLeft: 4 }}>
                                  ≈{" "}
                                  {formatCurrency(
                                    card.spend_limit_usd_estimate,
                                    "USD",
                                  )}
                                </span>
                              )}
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
                        {card.total_spent > 0 && (
                          <div
                            className="font-mono"
                            style={{
                              fontSize: "10px",
                              color: "var(--white-30)",
                              marginTop: 4,
                            }}
                          >
                            consumido {formatCurrency(card.total_spent_ars)}
                            {card.total_spent_usd > 0 && (
                              <span>
                                {" "}
                                + {formatCurrency(card.total_spent_usd, "USD")}
                              </span>
                            )}
                          </div>
                        )}
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
                  style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}
                >
                  Pagos recientes
                </h3>
                <span className="badge badge-primary">
                  {data.recent_payments.length}
                </span>
              </div>
              {data.recent_payments.length === 0 ? (
                <div
                  style={{
                    color: "var(--white-30)",
                    fontSize: "var(--font-size-xs)",
                    padding: "var(--space-4) 0",
                  }}
                >
                  No hay pagos registrados
                </div>
              ) : (
                <DataTable<RecentPaymentRow>
                  data={data.recent_payments}
                  columns={[
                    {
                      accessorKey: "created_at",
                      header: "Fecha",
                      cell: ({ row }) => (
                        <span className="font-mono">
                          {new Date(
                            (row.original as RecentPaymentRow).created_at,
                          ).toLocaleDateString("es-AR")}
                        </span>
                      ),
                    },
                    {
                      accessorKey: "type",
                      header: "Tipo",
                      cell: ({ row }) => {
                        const p = row.original as RecentPaymentRow;
                        const isLoan = p.type === "loan";
                        return (
                          <span
                            className={`badge ${
                              isLoan ? "badge-danger" : "badge-purple"
                            }`}
                          >
                            {isLoan ? "préstamo" : "tarjeta"}
                          </span>
                        );
                      },
                    },
                    {
                      accessorKey: "description",
                      header: "Descripción",
                      cell: ({ row }) => (
                        <span>
                          {(row.original as RecentPaymentRow).description ||
                            "—"}
                        </span>
                      ),
                    },
                    {
                      accessorKey: "account_name",
                      header: "Cuenta",
                      cell: ({ row }) => (
                        <span>
                          {(row.original as RecentPaymentRow).account_name}
                        </span>
                      ),
                    },
                    {
                      accessorKey: "amount",
                      header: () => (
                        <span
                          className="block text-right"
                          style={{ width: "100%" }}
                        >
                          Monto
                        </span>
                      ),
                      cell: ({ row }) => (
                        <span
                          className="font-mono"
                          style={{
                            textAlign: "right",
                            display: "block",
                            fontWeight: 600,
                          }}
                        >
                          {formatCurrency(
                            (row.original as RecentPaymentRow).amount,
                          )}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </div>

            {/* Exchange Rates */}
            {data.exchange_rates.length > 0 && (
              <div className="card full-width">
                <div className="card-header">
                  <h3
                    style={{ fontSize: "var(--font-size-md)", fontWeight: 700 }}
                  >
                    Cotizaciones USD / ARS
                  </h3>
                  <span
                    className="badge badge-primary"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
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
                                ? "var(--green)"
                                : rate.source === "oficial"
                                  ? "var(--white-30)"
                                  : rate.source === "tarjeta"
                                    ? "var(--yellow)"
                                    : "var(--white-15)",
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
