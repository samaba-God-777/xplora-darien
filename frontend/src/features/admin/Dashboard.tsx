"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarDays, Table2 } from "lucide-react";
import { useSession } from "./session";
import { Empty, PageHeader, Stat, StatusBadge, money } from "./ui";

interface Month { month: string; income: string; costs: string; profit: string }
interface DashboardData {
  bookingsByStatus: Record<string, number>;
  newRequests7d: number;
  pendingReview: number;
  upcoming: { id: string; code: string; travelDate: string; status: string; package: string; people: number; customer: string; staff: number }[];
  travelers30d: number;
  packagesPublished: number;
  activeStaff: number;
  lowStock: { id: string; name: string; quantity: number; minStock: number }[];
  mediaPublished: number;
  galleryViews30d: number;
  finance?: {
    thisMonth: { income: string; expenses: string; payroll: string; profit: string };
    lastMonth: { income: string; profit: string };
    yearToDate: { income: string; expenses: string; profit: string };
    receivable: string;
    staffUnpaid: string;
    monthly: Month[];
    topPackages: { name: string; income: string; bookings: number }[];
  };
}

// Paleta validada (scripts/validate_palette.js): ingresos verde, costos ámbar.
const INCOME = "#1f7a46";
const COSTS = "#d6a032";
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(2, 4)}`;

export function Dashboard() {
  const { api, session } = useSession();
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/admin/dashboard"), refetchInterval: 60_000 });
  const f = data?.finance;
  const delta = f ? Number(f.thisMonth.profit) - Number(f.lastMonth.profit) : 0;

  return (
    <div className="space-y-8">
      <PageHeader title="Panel de control" subtitle={`Hola, ${session?.user.email}. Resumen del negocio en tiempo real.`} />
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{(error as Error).message}</p>}
      {isLoading && <div className="h-40 animate-pulse rounded-3xl bg-forest-900/10" />}
      {data && (
        <>
          {f && (
            <section aria-label="Ganancias" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Ingresos del mes" value={money(f.thisMonth.income)} hint={`Mes anterior: ${money(f.lastMonth.income)}`} />
              <Stat
                label="Ganancia del mes"
                value={money(f.thisMonth.profit)}
                tone={Number(f.thisMonth.profit) < 0 ? "bad" : "good"}
                hint={`${delta >= 0 ? "▲" : "▼"} ${money(Math.abs(delta))} vs. mes anterior`}
              />
              <Stat label="Por cobrar" value={money(f.receivable)} hint="Reservas confirmadas aún sin pagar" />
              <Stat label="Pagos pendientes al personal" value={money(f.staffUnpaid)} />
            </section>
          )}
          <section aria-label="Operación" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Solicitudes por revisar" value={data.pendingReview} hint={`${data.newRequests7d} nuevas en 7 días`} />
            <Stat label="Viajeros próximos 30 días" value={data.travelers30d} />
            <Stat label="Paquetes publicados" value={data.packagesPublished} />
            <Stat label="Personal activo" value={data.activeStaff} />
            <Stat label="Fotos y videos publicados" value={data.mediaPublished} />
            <Stat label="Vistas de galería (30 d)" value={data.galleryViews30d} />
          </section>

          {f && <EarningsChart months={f.monthly} ytd={f.yearToDate} />}

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-2xl text-forest-900"><CalendarDays className="size-5" /> Próximos viajes</h2>
                <Link href="/admin/reservas" className="inline-flex items-center gap-1 text-sm font-semibold text-forest-800">Reservas <ArrowRight className="size-4" /></Link>
              </div>
              {data.upcoming.length === 0 ? (
                <p className="mt-4 text-sm text-earth-700">No hay viajes en los próximos 30 días.</p>
              ) : (
                <ul className="mt-4 divide-y divide-forest-900/5">
                  {data.upcoming.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                      <span className="w-24 tabular-nums text-earth-700">{u.travelDate}</span>
                      <span className="min-w-0 flex-1"><strong className="text-forest-900">{u.package}</strong> · {u.customer} · {u.people} pers.</span>
                      {u.staff === 0 && u.status !== "cancelled" && <span className="text-xs font-semibold text-red-700">Sin personal asignado</span>}
                      <StatusBadge status={u.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="space-y-6">
              <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5">
                <h2 className="flex items-center gap-2 font-display text-2xl text-forest-900"><AlertTriangle className="size-5 text-earth-700" /> Inventario bajo</h2>
                {data.lowStock.length === 0 ? (
                  <p className="mt-3 text-sm text-earth-700">Ningún artículo por debajo del mínimo.</p>
                ) : (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {data.lowStock.map((i) => (
                      <li key={i.id} className="flex justify-between"><span>{i.name}</span><span className="font-semibold text-red-700">{i.quantity} / mín. {i.minStock}</span></li>
                    ))}
                  </ul>
                )}
                <Link href="/admin/inventario" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-forest-800">Inventario <ArrowRight className="size-4" /></Link>
              </section>
              {f && (
                <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5">
                  <h2 className="font-display text-2xl text-forest-900">Paquetes que más ingresan (12 meses)</h2>
                  {f.topPackages.length === 0 ? (
                    <p className="mt-3 text-sm text-earth-700">Aún no hay cobros registrados.</p>
                  ) : (
                    <ol className="mt-3 space-y-1.5 text-sm">
                      {f.topPackages.map((p) => (
                        <li key={p.name} className="flex justify-between gap-3"><span>{p.name} <span className="text-earth-600">({p.bookings})</span></span><strong className="tabular-nums">{money(p.income)}</strong></li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
            </div>
          </div>
          {!f && <Empty>Las cifras de ganancias solo son visibles para administradores (permiso finance.read).</Empty>}
        </>
      )}
    </div>
  );
}

/** Barras agrupadas ingresos vs. costos por mes (un solo eje en USD), con tooltip, leyenda y vista de tabla. */
function EarningsChart({ months, ytd }: { months: Month[]; ytd: { income: string; expenses: string; profit: string } }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...months.flatMap((m) => [Number(m.income), Number(m.costs)]));
  const empty = months.every((m) => Number(m.income) === 0 && Number(m.costs) === 0);
  const H = 200;

  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5" aria-label="Ganancias por mes">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-forest-900">Ingresos y costos por mes</h2>
          <p className="mt-1 text-sm text-earth-700">
            En el año: ingresos <strong>{money(ytd.income)}</strong> · costos <strong>{money(ytd.expenses)}</strong> · ganancia{" "}
            <strong className={Number(ytd.profit) < 0 ? "text-red-700" : "text-forest-800"}>{money(ytd.profit)}</strong>
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-700">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: INCOME }} /> Ingresos (cobros)</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: COSTS }} /> Costos (gastos + personal)</span>
          <button onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1 rounded-full border border-forest-900/15 px-2.5 py-1 font-semibold" aria-pressed={table}>
            <Table2 className="size-3.5" /> {table ? "Gráfico" : "Tabla"}
          </button>
        </div>
      </div>

      {empty && !table && <p className="mt-6 text-sm text-earth-700">Todavía no hay cobros ni gastos registrados. Las barras aparecerán al registrar el primer cobro en Reservas o el primer gasto en Finanzas.</p>}

      {table ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm tabular-nums">
            <thead><tr className="text-left text-xs text-earth-700"><th className="py-2">Mes</th><th>Ingresos</th><th>Costos</th><th>Ganancia</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-forest-900/5">
                  <td className="py-1.5">{monthLabel(m.month)}</td><td>{money(m.income)}</td><td>{money(m.costs)}</td>
                  <td className={Number(m.profit) < 0 ? "text-red-700" : ""}>{money(m.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !empty && (
          <div className="relative mt-6" onMouseLeave={() => setHover(null)}>
            <div className="grid grid-cols-12 items-end gap-2 border-b border-forest-900/15" style={{ height: H }}>
              {months.map((m, i) => (
                <div key={m.month} className="relative flex h-full items-end justify-center gap-[2px]" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
                  aria-label={`${monthLabel(m.month)}: ingresos ${money(m.income)}, costos ${money(m.costs)}, ganancia ${money(m.profit)}`}>
                  {/* zona de interacción más grande que las barras */}
                  <span className={`absolute inset-x-[-4px] inset-y-0 rounded-md ${hover === i ? "bg-forest-900/5" : ""}`} />
                  {[["income", INCOME], ["costs", COSTS]].map(([k, c]) => {
                    const h = (Number(m[k as "income" | "costs"]) / max) * (H - 8);
                    return <span key={k} className="relative w-[38%] max-w-5 rounded-t-[4px]" style={{ height: Math.max(h, Number(m[k as "income" | "costs"]) > 0 ? 2 : 0), background: c }} />;
                  })}
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-12 gap-2 text-center text-[11px] text-earth-600">
              {months.map((m) => <span key={m.month}>{monthLabel(m.month)}</span>)}
            </div>
            {hover !== null && (
              <div className="pointer-events-none absolute -top-2 z-10 w-48 -translate-x-1/2 -translate-y-full rounded-xl bg-forest-950 p-3 text-xs text-white shadow-lg"
                style={{ left: `${((hover + 0.5) / 12) * 100}%` }}>
                <p className="font-semibold">{monthLabel(months[hover].month)}</p>
                <p className="mt-1 flex justify-between"><span>Ingresos</span><span className="tabular-nums">{money(months[hover].income)}</span></p>
                <p className="flex justify-between"><span>Costos</span><span className="tabular-nums">{money(months[hover].costs)}</span></p>
                <p className="mt-1 flex justify-between border-t border-white/15 pt-1 font-semibold"><span>Ganancia</span><span className="tabular-nums">{money(months[hover].profit)}</span></p>
              </div>
            )}
          </div>
        )
      )}
    </section>
  );
}
