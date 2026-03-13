import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
	faCreditCard,
	faHouse,
	faMoneyBill1,
} from "@fortawesome/free-regular-svg-icons";
import {
	faBars,
	faBuildingColumns,
	faCircleDollarToSlot,
	faHandHoldingDollar,
	faPiggyBank,
	faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Accounts } from "./pages/Accounts";
import { CreditCards } from "./pages/CreditCards";
import { Dashboard } from "./pages/Dashboard";
import { Entities } from "./pages/Entities";
import { Loans } from "./pages/Loans";
import { Paychecks } from "./pages/Paychecks";
import { Payments } from "./pages/Payments";
import { TableTest } from "./pages/test/TableTest";

type Route =
	| "dashboard"
	| "entities"
	| "loans"
	| "credit-cards"
	| "accounts"
	| "payments"
	| "paychecks"
	| "test";

const navItems: { route: Route; icon?: IconDefinition; label: string }[] = [
	{ route: "dashboard", icon: faHouse, label: "Dashboard" },
	{ route: "entities", icon: faBuildingColumns, label: "Entidades" },
	{ route: "accounts", icon: faPiggyBank, label: "Cuentas" },
	{ route: "loans", icon: faHandHoldingDollar, label: "Préstamos" },
	{ route: "credit-cards", icon: faCreditCard, label: "Tarjetas" },
	{ route: "payments", icon: faCircleDollarToSlot, label: "Pagos" },
	{ route: "paychecks", icon: faMoneyBill1, label: "Sueldos" },
	{ route: "test", label: "Test" },
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
		"test",
	];
	return valid.includes(hash as Route) ? (hash as Route) : "dashboard";
}

function App() {
	const [currentRoute, setCurrentRoute] = useState<Route>(getRouteFromHash);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const sidebarRef = useRef<HTMLElement>(null);
	const mainContentRef = useRef<HTMLElement>(null);

	useEffect(() => {
		function onHashChange() {
			setCurrentRoute(getRouteFromHash());
			setSidebarOpen(false);
		}
		window.addEventListener("hashchange", onHashChange);

		function onCtrlBPressed(e: KeyboardEvent) {
			if ((e.ctrlKey || e.metaKey) && e.key === "b") {
				e.preventDefault();
				setSidebarOpen((prev) => !prev);
			}
		}
		window.addEventListener("keydown", onCtrlBPressed, { capture: true });
		return () => {
			window.removeEventListener("hashchange", onHashChange);
			window.removeEventListener("keydown", onCtrlBPressed, { capture: true });
		};
	}, []);

	if (sidebarOpen) {
		sidebarRef.current?.focus();
	} else {
		mainContentRef.current?.focus();
	}

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
			case "test":
				return <TableTest />;
			default:
				return <Dashboard />;
		}
	}

	return (
		<div className="app-layout">
			<button
				type="button"
				className="mobile-menu-btn"
				data-open={String(sidebarOpen)}
				onClick={() => setSidebarOpen(!sidebarOpen)}
				aria-label="Toggle menu"
			>
				{sidebarOpen ? (
					<FontAwesomeIcon icon={faXmark} />
				) : (
					<FontAwesomeIcon icon={faBars} />
				)}
			</button>

			<nav
				className={`sidebar ${sidebarOpen ? "open" : ""} focus:border-0`}
				ref={sidebarRef}
				tabIndex={-1}
			>
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
							type="button"
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
							type="button"
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
							type="button"
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

			<main className="main-content" ref={mainContentRef}>
				{renderPage()}
			</main>
		</div>
	);
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<App />);
