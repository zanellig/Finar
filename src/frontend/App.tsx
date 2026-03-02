import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { Dashboard } from "./pages/Dashboard";
import { Entities } from "./pages/Entities";
import { Loans } from "./pages/Loans";
import { CreditCards } from "./pages/CreditCards";
import { Accounts } from "./pages/Accounts";
import { Payments } from "./pages/Payments";

type Route =
  | "dashboard"
  | "entities"
  | "loans"
  | "credit-cards"
  | "accounts"
  | "payments";

const navItems: { route: Route; icon: string; label: string }[] = [
  { route: "dashboard", icon: "📊", label: "Dashboard" },
  { route: "entities", icon: "🏦", label: "Entidades" },
  { route: "accounts", icon: "🏧", label: "Cuentas" },
  { route: "loans", icon: "📋", label: "Préstamos" },
  { route: "credit-cards", icon: "💳", label: "Tarjetas" },
  { route: "payments", icon: "💸", label: "Pagos" },
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
      default:
        return <Dashboard />;
    }
  }

  return (
    <div className="app-layout">
      {/* Mobile menu button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      {/* Sidebar */}
      <nav className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">💰</div>
            <span className="sidebar-logo-text">FinTracker</span>
          </div>
        </div>
        <div className="sidebar-nav">
          <div className="sidebar-section-label">General</div>
          {navItems.slice(0, 1).map((item) => (
            <button
              key={item.route}
              className={`nav-item ${currentRoute === item.route ? "active" : ""}`}
              onClick={() => navigate(item.route)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}

          <div className="sidebar-section-label">Gestión</div>
          {navItems.slice(1, 3).map((item) => (
            <button
              key={item.route}
              className={`nav-item ${currentRoute === item.route ? "active" : ""}`}
              onClick={() => navigate(item.route)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}

          <div className="sidebar-section-label">Finanzas</div>
          {navItems.slice(3).map((item) => (
            <button
              key={item.route}
              className={`nav-item ${currentRoute === item.route ? "active" : ""}`}
              onClick={() => navigate(item.route)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">{renderPage()}</main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
