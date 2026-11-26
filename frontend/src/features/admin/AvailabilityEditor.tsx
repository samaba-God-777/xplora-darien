"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Ban } from "lucide-react";
import { useSession } from "./session";
import { ErrorText, btnGhost, btnPrimary, fieldInline } from "./ui";

export interface Availability { date: string; capacity: number; blocked: boolean; note: string | null; taken: number }
export interface Departure { id: string; departureDate: string; returnDate: string; seatsAvailable: number; meetingPoint: string | null }

const WEEK = [["1", "L"], ["2", "M"], ["3", "X"], ["4", "J"], ["5", "V"], ["6", "S"], ["7", "D"]] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };

/** Cupo por fecha (rango + días de la semana) y salidas programadas de un paquete. */
export function AvailabilityEditor({ packageId, days, availability, departures }: { packageId: string; days: number; availability: Availability[]; departures: Departure[] }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const today = iso(new Date());
  const [r, setR] = useState({ from: today, to: addDays(today, 60), capacity: "10", weekdays: [] as string[], blocked: false });
  const [dep, setDep] = useState({ date: addDays(today, 14), capacity: "10", meeting: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-packages"] });
  const range = useMutation({
    mutationFn: () => api<{ days: number }>(`/admin/packages/${packageId}/availability/range`, {
      method: "PUT", json: { from: r.from, to: r.to, capacity: Number(r.capacity) || 0, weekdays: r.weekdays.map(Number), is_blocked: r.blocked },
    }),
    onSuccess: refresh,
  });
  const addDep = useMutation({
    mutationFn: () => api(`/admin/packages/${packageId}/departures`, {
      method: "POST", json: { departure_date: dep.date, return_date: addDays(dep.date, Math.max(days - 1, 0)), capacity: Number(dep.capacity), meeting_point: dep.meeting || undefined },
    }),
    onSuccess: refresh,
  });
  const cancelDep = useMutation({ mutationFn: (id: string) => api(`/admin/packages/${packageId}/departures/${id}`, { method: "PATCH", json: { status: "cancelled" } }), onSuccess: refresh });

  // Próximas 8 semanas como tira de días
  const strip = Array.from({ length: 56 }, (_, i) => addDays(today, i));
  const byDate = new Map(availability.map((a) => [a.date, a]));

  return (
    <section className="space-y-4 rounded-2xl bg-sand-100 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-forest-800">Disponibilidad (necesaria para confirmar reservas)</h3>
      <div className="grid grid-cols-[repeat(28,minmax(0,1fr))] gap-[3px]" aria-label="Próximas 8 semanas">
        {strip.map((d) => {
          const a = byDate.get(d);
          const free = a && !a.blocked ? a.capacity - a.taken : 0;
          const tone = !a ? "bg-forest-900/10" : a.blocked ? "bg-red-600" : free <= 0 ? "bg-gold-500" : "bg-forest-700";
          return <span key={d} title={`${d}: ${!a ? "sin disponibilidad" : a.blocked ? "bloqueado" : `${a.taken}/${a.capacity} ocupados`}`} className={`h-4 rounded-[3px] ${tone}`} />;
        })}
      </div>
      <p className="flex flex-wrap gap-3 text-[11px] text-earth-700">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-forest-700" /> con cupo</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-gold-500" /> lleno</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-red-600" /> bloqueado</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-forest-900/10" /> sin abrir</span>
        <span>· {availability.filter((a) => !a.blocked).length} días abiertos en 6 meses</span>
      </p>

      <form className="flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => (e.preventDefault(), range.mutate())}>
        <label className="text-xs">Desde<input type="date" className={`${fieldInline} mt-1 block w-40`} value={r.from} onChange={(e) => setR({ ...r, from: e.target.value })} /></label>
        <label className="text-xs">Hasta<input type="date" className={`${fieldInline} mt-1 block w-40`} value={r.to} onChange={(e) => setR({ ...r, to: e.target.value })} /></label>
        <label className="text-xs">Cupo / día<input inputMode="numeric" className={`${fieldInline} mt-1 block w-20`} value={r.capacity} onChange={(e) => setR({ ...r, capacity: e.target.value })} /></label>
        <fieldset className="text-xs">
          <legend>Días (vacío = todos)</legend>
          <div className="mt-1 flex gap-1">
            {WEEK.map(([v, l]) => (
              <button type="button" key={v} aria-pressed={r.weekdays.includes(v)} onClick={() => setR({ ...r, weekdays: r.weekdays.includes(v) ? r.weekdays.filter((x) => x !== v) : [...r.weekdays, v] })}
                className={`size-8 rounded-lg text-xs font-bold ${r.weekdays.includes(v) ? "bg-forest-800 text-gold-300" : "bg-white text-forest-900 ring-1 ring-forest-900/15"}`}>{l}</button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold"><input type="checkbox" className="accent-red-600" checked={r.blocked} onChange={(e) => setR({ ...r, blocked: e.target.checked })} /> Bloquear</label>
        <button className={r.blocked ? `${btnGhost} text-red-700` : btnPrimary} disabled={range.isPending}>
          {r.blocked ? <Ban className="size-4" /> : <CalendarPlus className="size-4" />} {r.blocked ? "Bloquear fechas" : "Abrir cupo"}
        </button>
      </form>
      {range.data && <p className="text-xs text-forest-800">{range.data.days} días actualizados.</p>}
      <ErrorText error={range.error} />

      <div>
        <h4 className="mt-2 text-xs font-bold uppercase tracking-wider text-forest-800">Salidas programadas (grupo con fecha fija)</h4>
        {departures.length === 0 ? <p className="mt-1 text-xs text-earth-700">Sin salidas programadas.</p> : (
          <ul className="mt-2 space-y-1 text-sm">
            {departures.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <span className="flex-1">{d.departureDate}{d.returnDate !== d.departureDate ? ` → ${d.returnDate}` : ""} · {d.seatsAvailable} plazas libres{d.meetingPoint ? ` · ${d.meetingPoint}` : ""}</span>
                <button onClick={() => cancelDep.mutate(d.id)} className="text-xs font-semibold text-red-700 hover:underline">Cancelar salida</button>
              </li>
            ))}
          </ul>
        )}
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), addDep.mutate())}>
          <label className="text-xs">Fecha<input type="date" className={`${fieldInline} mt-1 block w-40`} value={dep.date} onChange={(e) => setDep({ ...dep, date: e.target.value })} /></label>
          <label className="text-xs">Plazas<input inputMode="numeric" className={`${fieldInline} mt-1 block w-20`} value={dep.capacity} onChange={(e) => setDep({ ...dep, capacity: e.target.value })} /></label>
          <label className="text-xs">Punto de encuentro<input className={`${fieldInline} mt-1 block w-56`} value={dep.meeting} onChange={(e) => setDep({ ...dep, meeting: e.target.value })} /></label>
          <button className={btnGhost} disabled={addDep.isPending}>Programar salida</button>
        </form>
        <ErrorText error={addDep.error || cancelDep.error} />
      </div>
    </section>
  );
}
