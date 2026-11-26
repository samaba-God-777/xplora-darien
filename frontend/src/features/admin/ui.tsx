"use client";

import { X } from "lucide-react";

/** Utilidades compartidas del panel. */
export const money = (v: string | number | null | undefined, currency = "USD") =>
  `${currency} ${Number(v ?? 0).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const field = "w-full rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm outline-none focus:border-forest-700";
/** Variante sin ancho completo, para combinar con un ancho fijo (w-28, w-40…). */
export const fieldInline = "rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm outline-none focus:border-forest-700";
export const label = "mb-1 block text-xs font-bold uppercase tracking-wider text-forest-800";
export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-forest-700 disabled:opacity-40";
export const btnGhost = "inline-flex items-center justify-center gap-2 rounded-full border border-forest-900/20 px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-50 disabled:opacity-40";

export const BOOKING_STATUS: Record<string, string> = {
  received: "Solicitud recibida", pending: "Pendiente de confirmación", quoting: "En cotización",
  confirmed: "Confirmada", paid: "Pagada", cancelled: "Cancelada", completed: "Completada",
};
export const NEXT_STATUS: Record<string, string[]> = {
  received: ["pending", "quoting", "cancelled"], pending: ["quoting", "confirmed", "cancelled"],
  quoting: ["pending", "confirmed", "cancelled"], confirmed: ["paid", "cancelled"], paid: ["completed", "cancelled"],
};
export const STAFF_ROLE: Record<string, string> = {
  guide: "Guía", boat_operator: "Botero / lanchero", driver: "Conductor", cook: "Cocina", porter: "Cargador",
  coordinator: "Coordinador", admin: "Administración", other: "Otro",
};
export const PAY_TYPE: Record<string, string> = { per_day: "por día", per_trip: "por viaje", monthly: "mensual" };
export const INV_CATEGORY: Record<string, string> = {
  camping: "Camping", safety: "Seguridad", water: "Acuático", transport: "Transporte", kitchen: "Cocina",
  first_aid: "Primeros auxilios", photo_video: "Foto y video", office: "Oficina", other: "Otro",
};
export const MOVEMENT: Record<string, string> = {
  purchase: "Compra / entrada", checkout: "Salida a viaje", return: "Devolución", repair: "A reparación", loss: "Pérdida / baja", adjustment: "Ajuste",
};
export const EXPENSE_CATEGORY: Record<string, string> = {
  transport: "Transporte", fuel: "Combustible", food: "Alimentación", lodging: "Alojamiento", equipment: "Equipo",
  permits: "Permisos", marketing: "Publicidad", ai_generation: "Generación IA", salaries: "Salarios", maintenance: "Mantenimiento",
  commissions: "Comisiones", other: "Otros",
};
export const PAY_METHOD: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", yappy: "Yappy", other: "Otro" };

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "confirmed" || status === "paid" || status === "completed"
      ? "bg-forest-800 text-white"
      : status === "cancelled"
        ? "bg-red-600 text-white"
        : "bg-gold-100 text-earth-800";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${tone}`}>{BOOKING_STATUS[status] ?? status}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">Panel</p>
        <h1 className="font-display text-4xl text-forest-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-earth-700">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Stat({ label: l, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-forest-900/5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-earth-600">{l}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "bad" ? "text-red-700" : "text-forest-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-earth-600">{hint}</p>}
    </div>
  );
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-sand-50 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl text-forest-900">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-forest-900/5" aria-label="Cerrar"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{(error as Error).message}</p>;
}

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-2xl bg-white p-6 text-center text-sm text-earth-700 ring-1 ring-forest-900/5">{children}</p>
);
