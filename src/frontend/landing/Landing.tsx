import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./landing.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuildingColumns,
  faPiggyBank,
  faHandHoldingDollar,
  faCircleDollarToSlot,
  faChartLine,
  faArrowRight,
  faArrowDown,
  faDownload,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { faCreditCard } from "@fortawesome/free-regular-svg-icons";
import {
  faGithub,
  faWindows,
  faLinux,
  faApple,
} from "@fortawesome/free-brands-svg-icons";

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
    icon: faBuildingColumns,
    title: "Entidades",
    desc: "Registrá bancos, billeteras virtuales y sociedades de bolsa en un solo lugar.",
  },
  {
    icon: faPiggyBank,
    title: "Cuentas",
    desc: "Caja de ahorro, cuenta corriente y remunerada. Saldo, TNA, descubierto y más.",
  },
  {
    icon: faHandHoldingDollar,
    title: "Préstamos con CFTEA",
    desc: "Calculá cuotas mensuales automáticamente a partir del capital, plazo y CFTEA.",
  },
  {
    icon: faCreditCard,
    title: "Tarjetas de crédito",
    desc: "Límite modificable, gastos en cuotas ARS/USD, disponible en tiempo real.",
  },
  {
    icon: faCircleDollarToSlot,
    title: "Pagos integrados",
    desc: "Pagá préstamos y tarjetas desde cualquier cuenta. Descuento automático de saldo.",
  },
  {
    icon: faChartLine,
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
          <div className="nav-logo">FA</div>
          <span className="nav-wordmark">FinAR</span>
        </a>
        <div className="nav-links">
          <a href="#features" className="nav-link">
            Funciones
          </a>
          <a href="#rates" className="nav-link">
            Cotizaciones
          </a>
          <a
            href="https://github.com/cogniarg/finar"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-secondary"
          >
            <FontAwesomeIcon icon={faGithub} style={{ marginRight: 8 }} />{" "}
            GitHub
          </a>
          <a href="/" className="nav-cta">
            Descargar{" "}
            <FontAwesomeIcon icon={faDownload} style={{ marginLeft: 4 }} />
          </a>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          <span>
            <FontAwesomeIcon icon={faGithub} style={{ marginRight: 4 }} /> Ya
            somos open source!
          </span>
        </div>

        <h1 className="hero-headline">
          Tus finanzas
          <br />
          en <span className="highlight">un solo lugar</span>
        </h1>

        <p className="hero-sub">
          Llevá el control de tus cuentas, préstamos y tarjetas <br />
          sin tener que saltar de una app a otra.
        </p>

        <div className="hero-actions">
          <a href="/" className="hero-btn-primary">
            Descargá la app{" "}
            <FontAwesomeIcon icon={faDownload} style={{ marginLeft: 8 }} />
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
            <div className="terminal-title">finar — dashboard</div>
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
              <div className="feature-icon">
                <FontAwesomeIcon icon={f.icon as any} size="2x" />
              </div>
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
          Tomá el control de tus finanzas ahora
          <br />
        </h2>
        <p className="cta-sub">
          Sin registro. Sin cloud. Libre, gratuito y personal.
        </p>
        <a href="/" className="hero-btn-primary">
          Descargá la app{" "}
          <FontAwesomeIcon icon={faDownload} style={{ marginLeft: 8 }} />
        </a>
      </section>

      {/* ---- Disclaimer & Status ---- */}
      <section className="notice-section">
        <div className="notice-card">
          <div className="notice-icon">
            <FontAwesomeIcon icon={faCircleExclamation} />
          </div>
          <div className="notice-content">
            <div className="notice-title">Etapa Alpha</div>
            <div className="notice-text">
              FinAR se encuentra actualmente en fase de pruebas (Alpha). Es
              posible que encuentres errores o comportamientos inesperados
              durante su uso.
            </div>
          </div>
        </div>

        <div className="notice-card">
          <div className="notice-icon group">
            <FontAwesomeIcon icon={faWindows} />
            <FontAwesomeIcon icon={faApple} />
            <FontAwesomeIcon icon={faLinux} />
          </div>
          <div className="notice-content">
            <div className="notice-title">Disponibilidad de Plataformas</div>
            <div className="notice-text">
              Disponible únicamente para <strong>Windows, Linux y MacOS</strong>
              . Las versiones para dispositivos móviles (Android/iOS) no están
              planificadas.
            </div>
          </div>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="landing-footer">
        <div className="footer-left">
          <div className="footer-logo">FA</div>
          <span className="footer-text">FinAR v1.0.0</span>
        </div>
        <div className="footer-right">
          Cogniar &copy; {new Date().getFullYear()}
        </div>
      </footer>
    </>
  );
}

const root = createRoot(document.getElementById("landing-root")!);
root.render(<Landing />);
