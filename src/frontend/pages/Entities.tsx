import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  Modal,
  useToast,
  formatCurrency,
  entityTypeLabel,
  entityTypeIcon,
  LoadingPage,
  EmptyState,
} from "../components/shared";

export function Entities() {
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEntity, setEditingEntity] = useState<any>(null);
  const [form, setForm] = useState({ name: "", type: "bank" });
  const [submitting, setSubmitting] = useState(false);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadEntities();
  }, []);

  async function loadEntities() {
    try {
      const data = await api.getEntities();
      setEntities(data);
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingEntity(null);
    setForm({ name: "", type: "bank" });
    setShowModal(true);
  }

  function openEdit(entity: any) {
    setEditingEntity(entity);
    setForm({ name: entity.name, type: entity.type });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingEntity) {
        await api.updateEntity(editingEntity.id, form);
        addToast("Entidad actualizada");
      } else {
        await api.createEntity(form);
        addToast("Entidad creada");
      }
      setShowModal(false);
      loadEntities();
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        "¿Eliminar esta entidad? Se borrarán todas las cuentas, préstamos y tarjetas asociadas.",
      )
    )
      return;
    try {
      await api.deleteEntity(id);
      addToast("Entidad eliminada");
      loadEntities();
    } catch (err: any) {
      addToast(err.message, "error");
    }
  }

  if (loading) return <LoadingPage />;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Entidades</h1>
          <p className="page-subtitle">
            Bancos, billeteras virtuales y sociedades de bolsa
          </p>
        </div>
        <button
          id="create-entity-btn"
          className="btn btn-primary"
          onClick={openCreate}
        >
          + Nueva Entidad
        </button>
      </div>

      {entities.length === 0 ? (
        <EmptyState
          icon="🏦"
          text="No hay entidades registradas. Creá tu primer banco o billetera."
          action={
            <button className="btn btn-primary" onClick={openCreate}>
              + Crear Entidad
            </button>
          }
        />
      ) : (
        <div
          className="stats-grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          }}
        >
          {entities.map((entity, i) => (
            <div
              key={entity.id}
              className={`card animate-in stagger-${(i % 4) + 1}`}
            >
              <div className="card-header">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                  }}
                >
                  <div
                    className="list-item-icon"
                    style={{
                      background:
                        entity.type === "bank"
                          ? "var(--accent-primary-muted)"
                          : entity.type === "wallet"
                            ? "var(--accent-cyan-muted)"
                            : "var(--accent-purple-muted)",
                    }}
                  >
                    {entityTypeIcon(entity.type)}
                  </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "var(--font-size-lg)",
                      }}
                    >
                      {entity.name}
                    </div>
                    <span
                      className={`badge ${entity.type === "bank" ? "badge-primary" : entity.type === "wallet" ? "badge-cyan" : "badge-purple"}`}
                    >
                      {entityTypeLabel(entity.type)}
                    </span>
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-4)",
                }}
              >
                Creada:{" "}
                {new Date(entity.created_at).toLocaleDateString("es-AR")}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => openEdit(entity)}
                >
                  Editar
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(entity.id)}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingEntity ? "Editar Entidad" : "Nueva Entidad"}
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
              disabled={submitting}
            >
              {submitting
                ? "Guardando..."
                : editingEntity
                  ? "Guardar"
                  : "Crear"}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input
              id="entity-name-input"
              className="form-input"
              type="text"
              placeholder="Ej: Banco Galicia"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select
              id="entity-type-select"
              className="form-select"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="bank">🏦 Banco</option>
              <option value="wallet">📱 Billetera Virtual</option>
              <option value="asset_manager">📈 Sociedad de Bolsa</option>
            </select>
          </div>
        </form>
      </Modal>

      <ToastContainer />
    </div>
  );
}
