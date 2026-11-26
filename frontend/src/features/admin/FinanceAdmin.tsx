"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useSession } from "./session";
import { EXPENSE_CATEGORY, ErrorText, PAY_METHOD, PageHeader, Stat, btnPrimary, field, fieldInline, label, money } from "./ui";

interface Finance {
  from: string; to: string; income: string; expenses: string; payroll: string; profit: string;
  byCategory: Record<string, string>; byMethod: Record<string, string>;
  expensesList: { id: string; category: string; description: string; amount: string; date: string; reference: string | null; booking: string | null; package: string | null }[];
  paymentsList: { id: string; amount: string; method: string; date: string; reference: string | null; booking: string; package: string }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const PERIODS = {
  month: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; },
  quarter: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1)), iso(n)]; },
  year: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), 0, 1)), iso(n)]; },
} as const;

export function FinanceAdmin() {
  const { api, can } = useSession();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<keyof typeof PERIODS | "custom">("year");
  const [range, setRange] = useState<string[]>(PERIODS.year());
  const q = useQuery({ queryKey: ["finance", range], queryFn: () => api<Finance>(`/admin/finance?from=${range[0]}&to=${range[1]}`) });
  const [exp, setExp] = useState({ category: "fuel", description: "", amount: "", spent_on: iso(new Date()), booking_code: "", reference: "" });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const refresh = () => (qc.invalidateQueries({ queryKey: ["finance"] }), qc.invalidateQueries({ queryKey: ["dashboard"] }));
  const add = useMutation({
    mutationFn: () => api("/admin/expenses", { method: "POST", json: { ...exp, booking_code: exp.booking_code || undefined, reference: exp.reference || undefined } }),
    onSuccess: () => (setExp({ ...exp, description: "", amount: "", booking_code: "", reference: "" }), refresh()),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/admin/expenses/${id}?confirm=${id}`, { method: "DELETE" }), onSuccess: () => (setConfirmDel(null), refresh()) });
  const f = q.data;
  const costs = f ? Number(f.expenses) + Number(f.payroll) : 0;
  const margin = f && Number(f.income) > 0 ? (Number(f.profit) / Number(f.income)) * 100 : null;
  const cats = useMemo(() => Object.entries(f?.byCategory ?? {}).sort((a, b) => Number(b[1]) - Number(a[1])), [f]);
  const maxCat = Math.max(1, ...cats.map(([, v]) => Number(v)));

  return (
    <div className="space-y-6">
      <PageHeader title="Finanzas y ganancias" subtitle="Ingresos = cobros registrados en reservas. Costos = gastos + pagos al personal asignado. Ganancia = ingresos − costos." />
      <div className="flex flex-wrap items-center gap-2">
        {(["month", "quarter", "year"] as const).map((p) => (
          <button key={p} onClick={() => (setPeriod(p), setRange(PERIODS[p]()))} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${period === p ? "bg-forest-800 text-gold-300" : "bg-white text-forest-900 ring-1 ring-forest-900/10"}`}>
            {{ month: "Este mes", quarter: "Trimestre", year: "Este año" }[p]}
          </button>
        ))}
        <input aria-label="Desde" type="date" className={`${fieldInline} w-40`} value={range[0]} onChange={(e) => (setPeriod("custom"), setRange([e.target.value, range[1]]))} />
        <input aria-label="Hasta" type="date" className={`${fieldInline} w-40`} value={range[1]} onChange={(e) => (setPeriod("custom"), setRange([range[0], e.target.value]))} />
      </div>
      <ErrorText error={q.error} />
      {f && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Ingresos" value={money(f.income)} />
            <Stat label="Gastos" value={money(f.expenses)} />
            <Stat label="Personal" value={money(f.payroll)} />
            <Stat label="Ganancia" value={money(f.profit)} tone={Number(f.profit) < 0 ? "bad" : "good"} hint={margin !== null ? `Margen ${margin.toFixed(1)} %` : undefined} />
            <Stat label="Costos totales" value={money(costs)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5">
              <h2 className="font-display text-2xl text-forest-900">Gastos por categoría</h2>
              {cats.length === 0 ? <p className="mt-3 text-sm text-earth-700">Sin gastos en el período.</p> : (
                <ul className="mt-4 space-y-2 text-sm">
                  {cats.map(([k, v]) => (
                    <li key={k}>
                      <div className="flex justify-between"><span>{EXPENSE_CATEGORY[k] ?? k}</span><span className="tabular-nums">{money(v)}</span></div>
                      <div className="mt-1 h-2 rounded-full bg-forest-900/5"><div className="h-2 rounded-full bg-forest-700" style={{ width: `${(Number(v) / maxCat) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              {Object.keys(f.byMethod).length > 0 && (
                <p className="mt-5 text-xs text-earth-700">Cobros por método: {Object.entries(f.byMethod).map(([k, v]) => `${PAY_METHOD[k]} ${money(v)}`).join(" · ")}</p>
              )}
            </section>

            {can("finance.write") && (
              <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5">
                <h2 className="font-display text-2xl text-forest-900">Registrar gasto</h2>
                <form className="mt-4 grid grid-cols-2 gap-3" onSubmit={(e) => (e.preventDefault(), add.mutate())}>
                  <div><label className={label} htmlFor="ec">Categoría</label><select id="ec" className={field} value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })}>{Object.entries(EXPENSE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><label className={label} htmlFor="ea">Monto (USD)</label><input id="ea" required inputMode="decimal" className={field} value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value.replace(",", ".") })} /></div>
                  <div className="col-span-2"><label className={label} htmlFor="ed">Descripción</label><input id="ed" required className={field} value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} /></div>
                  <div><label className={label} htmlFor="edt">Fecha</label><input id="edt" type="date" className={field} value={exp.spent_on} onChange={(e) => setExp({ ...exp, spent_on: e.target.value })} /></div>
                  <div><label className={label} htmlFor="eb">Reserva (opcional)</label><input id="eb" className={field} placeholder="XD-2026-000001" value={exp.booking_code} onChange={(e) => setExp({ ...exp, booking_code: e.target.value })} /></div>
                  <div className="col-span-2"><label className={label} htmlFor="er">Factura / referencia</label><input id="er" className={field} value={exp.reference} onChange={(e) => setExp({ ...exp, reference: e.target.value })} /></div>
                  <div className="col-span-2"><ErrorText error={add.error} /></div>
                  <button className={`${btnPrimary} col-span-2`} disabled={add.isPending}>Guardar gasto</button>
                </form>
              </section>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5">
              <h2 className="font-display text-2xl text-forest-900">Gastos</h2>
              {f.expensesList.length === 0 ? <p className="mt-3 text-sm text-earth-700">Sin gastos registrados en el período.</p> : (
                <ul className="mt-3 divide-y divide-forest-900/5 text-sm">
                  {f.expensesList.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <span className="w-24 shrink-0 tabular-nums text-earth-700">{e.date}</span>
                      <span className="min-w-0 flex-1">{e.description}<span className="block text-xs text-earth-600">{EXPENSE_CATEGORY[e.category]}{e.booking ? ` · ${e.booking}` : ""}{e.reference ? ` · ${e.reference}` : ""}</span></span>
                      <span className="tabular-nums">{money(e.amount)}</span>
                      {can("finance.write") && (confirmDel === e.id ? (
                        <span className="flex gap-1">
                          <button onClick={() => del.mutate(e.id)} className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Eliminar</button>
                          <button onClick={() => setConfirmDel(null)} className="text-xs">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDel(e.id)} className="rounded-full p-1 text-red-700 hover:bg-red-50" aria-label={`Eliminar gasto ${e.description}`}><Trash2 className="size-4" /></button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5">
              <h2 className="font-display text-2xl text-forest-900">Cobros</h2>
              {f.paymentsList.length === 0 ? <p className="mt-3 text-sm text-earth-700">Sin cobros en el período. Se registran desde Reservas.</p> : (
                <ul className="mt-3 divide-y divide-forest-900/5 text-sm">
                  {f.paymentsList.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      <span className="w-24 shrink-0 tabular-nums text-earth-700">{p.date}</span>
                      <span className="min-w-0 flex-1">{p.booking} · {p.package}<span className="block text-xs text-earth-600">{PAY_METHOD[p.method]}{p.reference ? ` · ${p.reference}` : ""}</span></span>
                      <span className={`tabular-nums ${Number(p.amount) < 0 ? "text-red-700" : ""}`}>{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
