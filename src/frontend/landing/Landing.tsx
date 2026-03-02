import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./landing.css";

interface ExchangeRate {
  id: string;
  pair: string;
  buy_rate: number;
  sell_rate: number;
  source: string;
  fetched_at: string;
}

const features = [
  {
    icon: "◆",
    title: "Entidades",
    desc: "Registrá bancos, billeteras virtuales y sociedades de bolsa en un solo lugar.",
  },
  {
    icon: "▤",
    title: "Cuentas",
    desc: "Caja de ahorro, cuenta corriente y remunerada. Saldo, TNA, descubierto y más.",
  },
  {
    icon: "▸",
    title: "Préstamos con CFTEA",
    desc: "Calculá cuotas mensuales automáticamente a partir del capital, plazo y CFTEA.",
  },
  {
    icon: "▬",
    title: "Tarjetas de crédito",
    desc: "Límite modificable, gastos en cuotas ARS/USD, disponible en tiempo real.",
  },
  {
    icon: "↗",
    title: "Pagos integrados",
    desc: "Pagá préstamos y tarjetas desde cualquier cuenta. Descuento automático de saldo.",
  },
  {
    icon: "≡",
    title: "Cotizaciones en vivo",
    desc: "Dólar blue, oficial, tarjeta, crypto y más. Actualización automática cada 30 min.",
  },
];

function formatARS(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function Landing() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);

  useEffect(() => {
    fetch("/api/rates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRates(data);
      })
      .catch(() => {});
  }, []);

  const displayed = rates.filter((r) =>
    ["blue", "oficial", "tarjeta", "cripto", "mayorista"].includes(r.source),
  );

  return (
    <>
      {/* ---- Nav ---- */}
      <nav className="landing-nav">
        <a href="/landing" className="nav-brand">
          <div className="nav-logo">FT</div>
          <span className="nav-wordmark">FinTracker</span>
        </a>
        <div className="nav-links">
          <a href="#features" className="nav-link">
            Funciones
          </a>
          <a href="#rates" className="nav-link">
            Cotizaciones
          </a>
          <a href="/" className="nav-cta">
            Abrir App →
          </a>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          <span>open source · bun + react + sqlite</span>
        </div>

        <h1 className="hero-headline">
          Tus finanzas
          <br />
          en <span className="highlight">una terminal</span>
        </h1>

        <p className="hero-sub">
          Dashboard minimalista para trackear cuentas, préstamos, tarjetas y
          patrimonio neto. Sin ruido, sin fricción.
        </p>

        <div className="hero-actions">
          <a href="/" className="hero-btn-primary">
            Abrir Dashboard →
          </a>
          <a href="#features" className="hero-btn-secondary">
            Ver funciones
          </a>
        </div>

        {/* Terminal Preview */}
        <div className="terminal">
          <div className="terminal-bar">
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <div className="terminal-title">fintracker — dashboard</div>
          </div>
          <div className="terminal-body">
            <div className="terminal-line">
              <span className="t-label">patrimonio neto</span>
              <span className="t-value t-green">$ 2.450.000,00</span>
            </div>
            <div className="terminal-line">
              <span className="t-label">deuda total</span>
              <span className="t-value t-red">$ 452.500,00</span>
            </div>
            <div className="terminal-line">
              <span className="t-label">obligaciones/mes</span>
              <span className="t-value t-white">$ 52.500,00</span>
            </div>
            <div className="terminal-line">
              <span className="t-label">cuentas</span>
              <span className="t-value t-dim">3 activas · ARS + USD</span>
            </div>
            <div className="terminal-line">
              <span className="t-label">préstamos</span>
              <span className="t-value t-dim">2 activos · CFTEA 50%</span>
            </div>
            <div className="terminal-line">
              <span className="t-label">tarjetas</span>
              <span className="t-value t-dim">
                <span className="t-bar" style={{ width: 60 }} />
                <span style={{ marginLeft: 8 }}>42% utilizado</span>
              </span>
            </div>
            <div className="terminal-line">
              <span className="t-label">usd blue</span>
              <span className="t-value t-green">
                {rates.find((r) => r.source === "blue")
                  ? formatARS(rates.find((r) => r.source === "blue")!.sell_rate)
                  : "$ 1.425"}
              </span>
            </div>
            <div className="terminal-line" style={{ marginTop: 8 }}>
              <span className="terminal-prompt">❯</span>
              <span className="t-dim">_</span>
              <span className="terminal-cursor" />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="features" id="features">
        <div className="section-label">funciones</div>
        <h2 className="section-title">Todo lo que necesitás</h2>
        <p className="section-sub">
          Diseñado para las finanzas personales en Argentina. Pesos, dólares,
          cuotas e impuestos — todo integrado.
        </p>

        <div className="features-grid">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Rates ---- */}
      {displayed.length > 0 && (
        <section className="rates-section" id="rates">
          <div className="section-label">cotizaciones en vivo</div>
          <h2 className="section-title">Dólar hoy</h2>
          <p className="section-sub">
            Datos de dolarapi.com · actualización cada 30 minutos.
          </p>

          <div className="rates-grid">
            {displayed.map((rate) => (
              <div key={rate.id} className="rate-card">
                <div className="rate-source">{rate.source}</div>
                <div className="rate-value">{formatARS(rate.sell_rate)}</div>
                <div className="rate-label">venta</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- CTA ---- */}
      <section className="cta-section">
        <h2 className="cta-title">
          Empezá a trackear
          <br />
          tus finanzas ahora
        </h2>
        <p className="cta-sub">
          Sin registro. Sin cloud. Todo corre en tu máquina con SQLite.
        </p>
        <a href="/" className="hero-btn-primary">
          Abrir Dashboard →
        </a>
      </section>

      {/* ---- Footer ---- */}
      <footer className="landing-footer">
        <div className="footer-left">
          <div className="footer-logo">FT</div>
          <span className="footer-text">FinTracker v1.0.0</span>
        </div>
        <div className="footer-right">
          bun + react + sqlite · {new Date().getFullYear()}
        </div>
      </footer>
    </>
  );
}

const root = createRoot(document.getElementById("landing-root")!);
root.render(<Landing />);
