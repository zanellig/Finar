import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { Dashboard } from "./pages/Dashboard";
import { Entities } from "./pages/Entities";
import { Loans } from "./pages/Loans";
import { CreditCards } from "./pages/CreditCards";
import { Accounts } from "./pages/Accounts";
import { Payments } from "./pages/Payments";
import { Paychecks } from "./pages/Paychecks";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuildingColumns,
  faPiggyBank,
  faHandHoldingDollar,
  faCircleDollarToSlot,
  faBars,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  faCreditCard,
  faHouse,
  faMoneyBill1,
} from "@fortawesome/free-regular-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type Route =
  | "dashboard"
  | "entities"
  | "loans"
  | "credit-cards"
  | "accounts"
  | "payments"
  | "paychecks";

const navItems: { route: Route; icon: IconDefinition; label: string }[] = [
  { route: "dashboard", icon: faHouse, label: "Dashboard" },
  { route: "entities", icon: faBuildingColumns, label: "Entidades" },
  { route: "accounts", icon: faPiggyBank, label: "Cuentas" },
  { route: "loans", icon: faHandHoldingDollar, label: "Préstamos" },
  { route: "credit-cards", icon: faCreditCard, label: "Tarjetas" },
  { route: "payments", icon: faCircleDollarToSlot, label: "Pagos" },
  { route: "paychecks", icon: faMoneyBill1, label: "Sueldos" },
];

function getRouteFromHash(): Route {
  const hash = window.location.hash.replace("#", "").replace("/", "");
  const valid: Route[] = [
    "dashboard",
    "entities",
    "loans",
    "credit-cards",
    "accounts",
    "payments",
    "paychecks",
  ];
  return valid.includes(hash as Route) ? (hash as Route) : "dashboard";
}

function App() {
  const [currentRoute, setCurrentRoute] = useState<Route>(getRouteFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    function onHashChange() {
      setCurrentRoute(getRouteFromHash());
      setSidebarOpen(false);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(route: Route) {
    window.location.hash = route;
  }

  function renderPage() {
    switch (currentRoute) {
      case "dashboard":
        return <Dashboard />;
      case "entities":
        return <Entities />;
      case "loans":
        return <Loans />;
      case "credit-cards":
        return <CreditCards />;
      case "accounts":
        return <Accounts />;
      case "payments":
        return <Payments />;
      case "paychecks":
        return <Paychecks />;
      default:
        return <Dashboard />;
    }
  }

  return (
    <div className="app-layout">
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? (
          <FontAwesomeIcon icon={faXmark} />
        ) : (
          <FontAwesomeIcon icon={faBars} />
        )}
      </button>

      <nav className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">FT</div>
            <span className="sidebar-logo-text">FinTracker</span>
          </div>
        </div>
        <div className="sidebar-nav">
          <div className="sidebar-section-label">overview</div>
          {navItems.slice(0, 1).map((item) => (
            <button
              key={item.route}
              className={`nav-item ${currentRoute === item.route ? "active" : ""}`}
              onClick={() => navigate(item.route)}
            >
              <span className="nav-icon">
                <FontAwesomeIcon icon={item.icon} />
              </span>
              {item.label}
            </button>
          ))}

          <div className="sidebar-section-label">gestión</div>
          {navItems.slice(1, 3).map((item) => (
            <button
              key={item.route}
              className={`nav-item ${currentRoute === item.route ? "active" : ""}`}
              onClick={() => navigate(item.route)}
            >
              <span className="nav-icon">
                <FontAwesomeIcon icon={item.icon} />
              </span>
              {item.label}
            </button>
          ))}

          <div className="sidebar-section-label">finanzas</div>
          {navItems.slice(3).map((item) => (
            <button
              key={item.route}
              className={`nav-item ${currentRoute === item.route ? "active" : ""}`}
              onClick={() => navigate(item.route)}
            >
              <span className="nav-icon">
                <FontAwesomeIcon icon={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
        </div>

        <div
          style={{
            padding: "var(--space-4) var(--space-5)",
            borderTop: "1px solid var(--white-06)",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--white-15)",
            letterSpacing: "0.05em",
          }}
        >
          v0.0.1
        </div>
      </nav>

      <main className="main-content">{renderPage()}</main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
