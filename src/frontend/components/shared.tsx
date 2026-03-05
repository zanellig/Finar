import React, { useState, useCallback, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faCheckCircle,
  faCircleXmark,
  faBuildingColumns,
  faWallet,
  faChartLine,
  faCircleQuestion,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

interface ToastMessage {
  id: number;
  text: string;
  type: "success" | "error";
}

let toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (text: string, type: "success" | "error" = "success") => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, text, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    },
    [],
  );

  const ToastContainer = () => (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            <FontAwesomeIcon
              icon={toast.type === "success" ? faCheckCircle : faCircleXmark}
            />
          </span>
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );

  return { addToast, ToastContainer };
}

export function formatCurrency(amount: number, currency = "ARS"): string {
  if (currency === "USD") {
    return `US$ ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$ ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

export function entityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    bank: "banco",
    wallet: "billetera",
    asset_manager: "soc. de bolsa",
  };
  return labels[type] || type;
}

export function entityTypeIcon(type: string): IconDefinition {
  const icons: Record<string, IconDefinition> = {
    bank: faBuildingColumns,
    wallet: faWallet,
    asset_manager: faChartLine,
  };
  return icons[type] || faCircleQuestion;
}

export function accountTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    savings: "caja de ahorro",
    checking: "cuenta corriente",
    interest: "remunerada",
  };
  return labels[type] || type;
}

export function accountTypeBadge(type: string): string {
  const badges: Record<string, string> = {
    savings: "badge-primary",
    checking: "badge-warning",
    interest: "badge-success",
  };
  return badges[type] || "badge-primary";
}

export function Spinner() {
  return <div className="spinner" />;
}

export function LoadingPage() {
  return (
    <div className="loading-page">
      <Spinner />
    </div>
  );
}

export function EmptyState({
  icon,
  text,
  action,
}: {
  icon: IconDefinition;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <FontAwesomeIcon icon={icon} size="3x" />
      </div>
      <div className="empty-state-text">{text}</div>
      {action}
    </div>
  );
}
