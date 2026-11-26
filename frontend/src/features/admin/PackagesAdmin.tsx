"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronDown, ExternalLink, History, Loader2, Save, Star } from "lucide-react";
import { useSession } from "./session";
import { fieldInline } from "./ui";
import { AvailabilityEditor, type Availability, type Departure } from "./AvailabilityEditor";

interface Season { key: string; name: string; description: string | null; start: string; end: string; current: boolean }
interface Price {
  id: string;
  type: "per_person" | "adult" | "child" | "group" | "special";
  amount: string;
  minGroupSize: number | null;
  discountPct: string;
  season: { key: string; name: string } | null;
  appliesToday: boolean;
}
interface AdminPackage {
  id: string;
  code: string;
  slug: string;
  name: string;
  shortDescription: string;
  days: number;
  nights: number;
  status: "draft" | "published" | "archived";
  featured: boolean;
  currency: string;
  destinations: { slug: string; name: string }[];
  media: string[];
  prices: Price[];
  availability: Availability[];
  departures: Departure[];
  priceHistory: { type: string; old: string | null; new: string | null; season: string | null; operation: string; at: string }[];
}

const ROWS: { type: Price["type"]; label: string }[] = [
  { type: "adult", label: "Adulto" },
  { type: "child", label: "Niño" },
  { type: "group", label: "Grupo (por persona)" },
];
const MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function PackagesAdmin() {
  const { api, can } = useSession();
  const seasons = useQuery({ queryKey: ["seasons"], queryFn: () => api<Season[]>("/seasons") });
  const packages = useQuery({ queryKey: ["admin-packages"], queryFn: () => api<AdminPackage[]>("/admin/packages") });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">Panel</p>
        <h1 className="font-display text-4xl text-forest-900">Paquetes y precios por temporada</h1>
        <p className="mt-2 max-w-3xl text-sm text-earth-700">
          Define el precio de cada paquete para cada temporada. Si un viaje cae en una temporada con precio, se cobra ese; si no, el precio general.
          Un paquete no se puede publicar sin al menos un precio. Cada cambio queda en el historial.
        </p>
      </header>

      {seasons.data && <SeasonsEditor seasons={seasons.data} canEdit={can("seasons.manage")} />}

      {packages.isError && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{(packages.error as Error).message}</p>}
      {packages.isLoading && <div className="h-40 animate-pulse rounded-3xl bg-forest-900/10" />}
      <ul className="space-y-4">
        {packages.data?.map((p) => (
          <li key={p.id}>
            <PackageCard pkg={p} seasons={seasons.data ?? []} canPrice={can("packages.pricing")} canPublish={can("packages.publish")} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeasonsEditor({ seasons, canEdit }: { seasons: Season[]; canEdit: boolean }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(() => Object.fromEntries(seasons.map((s) => [s.key, { name: s.name, start: s.start, end: s.end, description: s.description ?? "" }])));
  const save = useMutation({
    mutationFn: (key: string) => api(`/admin/seasons/${key}`, { method: "PUT", json: draft[key] }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["seasons"] }), qc.invalidateQueries({ queryKey: ["admin-packages"] })),
  });
  const field = "rounded-lg border border-forest-900/15 bg-white px-2.5 py-1.5 text-sm";
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-forest-900/5" aria-label="Temporadas">
      <h2 className="flex items-center gap-2 font-display text-2xl text-forest-900"><CalendarRange className="size-5" /> Temporadas</h2>
      <p className="mt-1 text-xs text-earth-700">Se repiten cada año (formato MM-DD). Pueden cruzar el año, p. ej. 12-15 → 04-30.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {seasons.map((s) => {
          const d = draft[s.key];
          const valid = MD.test(d.start) && MD.test(d.end) && d.name.trim().length > 1;
          return (
            <div key={s.key} className="rounded-2xl bg-sand-100 p-4">
              <div className="flex items-center gap-2">
                <input aria-label="Nombre de la temporada" disabled={!canEdit} className={`${field} flex-1 font-semibold`} value={d.name} onChange={(e) => setDraft({ ...draft, [s.key]: { ...d, name: e.target.value } })} />
                {s.current && <span className="rounded-full bg-forest-800 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-300">Vigente hoy</span>}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <label className="flex items-center gap-1">Desde <input aria-label={`Inicio ${s.name}`} disabled={!canEdit} className={`${fieldInline} w-20`} value={d.start} onChange={(e) => setDraft({ ...draft, [s.key]: { ...d, start: e.target.value } })} /></label>
                <label className="flex items-center gap-1">hasta <input aria-label={`Fin ${s.name}`} disabled={!canEdit} className={`${fieldInline} w-20`} value={d.end} onChange={(e) => setDraft({ ...draft, [s.key]: { ...d, end: e.target.value } })} /></label>
                {canEdit && (
                  <button disabled={!valid || save.isPending} onClick={() => save.mutate(s.key)} className="ml-auto inline-flex items-center gap-1 rounded-full bg-forest-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                    <Save className="size-3.5" /> Guardar
                  </button>
                )}
              </div>
              {s.description && <p className="mt-2 text-xs text-earth-700">{s.description}</p>}
            </div>
          );
        })}
      </div>
      {save.error && <p className="mt-2 text-sm text-red-700">{(save.error as Error).message}</p>}
    </section>
  );
}

type Cell = { amount: string; id?: string; original?: string };
const cellKey = (type: string, season: string | null) => `${type}|${season ?? "general"}`;

function PackageCard({ pkg, seasons, canPrice, canPublish }: { pkg: AdminPackage; seasons: Season[]; canPrice: boolean; canPublish: boolean }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const cols: { key: string | null; label: string }[] = [{ key: null, label: "General (todo el año)" }, ...seasons.map((s) => ({ key: s.key, label: s.name }))];
  const initialCells = () => {
    const c: Record<string, Cell> = {};
    for (const p of pkg.prices) c[cellKey(p.type, p.season?.key ?? null)] = { amount: p.amount, id: p.id, original: p.amount };
    return c;
  };
  const [cells, setCells] = useState<Record<string, Cell>>(initialCells);
  const [groupMin, setGroupMin] = useState(String(pkg.prices.find((p) => p.type === "group")?.minGroupSize ?? 6));
  const [error, setError] = useState<string | null>(null);
  const dirty = Object.values(cells).some((c) => c.amount !== (c.original ?? ""));

  const save = useMutation({
    mutationFn: async () => {
      for (const [k, c] of Object.entries(cells)) {
        if (c.amount === (c.original ?? "")) continue;
        const [type, s] = k.split("|");
        const season = s === "general" ? null : s;
        const amount = c.amount.trim();
        if (amount !== "" && !(Number(amount) >= 0)) throw new Error(`Precio no válido: ${amount}`);
        if (c.id && amount === "") await api(`/admin/packages/${pkg.id}/prices/${c.id}`, { method: "PATCH", json: { is_active: false } });
        else if (c.id) await api(`/admin/packages/${pkg.id}/prices/${c.id}`, { method: "PATCH", json: { amount } });
        else if (amount !== "")
          await api(`/admin/packages/${pkg.id}/prices`, {
            method: "POST",
            json: { price_type: type, amount, season, min_group_size: type === "group" ? Number(groupMin) : undefined },
          });
      }
    },
    onMutate: () => setError(null),
    onError: (e) => setError((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-packages"] }),
  });
  const publish = useMutation({
    mutationFn: (body: { status?: string; is_featured?: boolean }) => api(`/admin/packages/${pkg.id}/publish`, { method: "POST", json: body }),
    onMutate: () => setError(null),
    onError: (e) => setError((e as Error).message),
    onSettled: () => (qc.invalidateQueries({ queryKey: ["admin-packages"] }), qc.invalidateQueries({ queryKey: ["packages"] })),
  });

  const hasPrice = pkg.prices.length > 0;
  return (
    <article className="overflow-hidden rounded-3xl bg-white ring-1 ring-forest-900/5">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-4 p-5 text-left hover:bg-forest-50/50">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">{pkg.code}</p>
          <h2 className="font-display text-2xl text-forest-900">{pkg.name}</h2>
          <p className="mt-1 text-xs text-earth-700">
            {pkg.days} días · {pkg.nights} noches · {pkg.destinations.map((d) => d.name).join(", ")} · {pkg.media.length} fotos en su galería
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${pkg.status === "published" ? "bg-forest-800 text-white" : "bg-sand-100 text-earth-800"}`}>
          {pkg.status === "published" ? "Publicado" : "Borrador"}
        </span>
        {pkg.featured && <Star className="size-5 fill-gold-400 text-gold-400" aria-label="Destacado" />}
        {!hasPrice && <span className="hidden text-xs font-semibold text-red-700 sm:block">Sin precios</span>}
        <ChevronDown className={`size-5 text-earth-600 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-forest-900/10 p-5">
          <p className="text-sm text-ink-800">{pkg.shortDescription}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="mb-2 text-left text-xs font-bold uppercase tracking-wider text-forest-800">Precios ({pkg.currency}) — vacío = sin precio</caption>
              <thead>
                <tr className="text-left text-xs text-earth-700">
                  <th className="py-2 pr-3 font-semibold">Tarifa</th>
                  {cols.map((c) => <th key={c.label} className="px-2 py-2 font-semibold">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.type} className="border-t border-forest-900/5">
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-forest-900">
                      {r.label}
                      {r.type === "group" && (
                        <label className="mt-1 flex items-center gap-1 text-[11px] font-normal text-earth-700">
                          desde <input aria-label="Mínimo de personas del grupo" value={groupMin} onChange={(e) => setGroupMin(e.target.value)} disabled={!canPrice} className="w-12 rounded border border-forest-900/15 px-1 py-0.5" /> personas
                        </label>
                      )}
                    </th>
                    {cols.map((c) => {
                      const k = cellKey(r.type, c.key);
                      const cell = cells[k] ?? { amount: "" };
                      const changed = cell.amount !== (cell.original ?? "");
                      return (
                        <td key={k} className="px-2 py-2">
                          <input
                            inputMode="decimal"
                            aria-label={`${r.label} · ${c.label}`}
                            disabled={!canPrice}
                            value={cell.amount}
                            placeholder="—"
                            onChange={(e) => setCells({ ...cells, [k]: { ...cell, amount: e.target.value.replace(",", ".") } })}
                            className={`w-28 rounded-lg border px-2.5 py-1.5 tabular-nums ${changed ? "border-gold-500 bg-gold-100" : "border-forest-900/15 bg-white"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canPrice && (
              <button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar precios
              </button>
            )}
            {dirty && <button onClick={() => setCells(initialCells())} className="rounded-full px-4 py-2.5 text-sm text-earth-700">Descartar cambios</button>}
            {canPublish && (
              <>
                <button
                  onClick={() => publish.mutate({ status: pkg.status === "published" ? "draft" : "published" })}
                  disabled={publish.isPending || dirty}
                  title={dirty ? "Guarda los precios primero" : undefined}
                  className={`ml-auto rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-40 ${pkg.status === "published" ? "border border-forest-800 text-forest-900" : "bg-gold-400 text-forest-950"}`}
                >
                  {pkg.status === "published" ? "Despublicar" : "Publicar"}
                </button>
                <button onClick={() => publish.mutate({ is_featured: !pkg.featured })} disabled={publish.isPending} className="inline-flex items-center gap-1 rounded-full px-3 py-2.5 text-sm font-semibold text-forest-900" aria-pressed={pkg.featured}>
                  <Star className={`size-4 ${pkg.featured ? "fill-gold-400 text-gold-400" : ""}`} /> Destacar
                </button>
              </>
            )}
            {pkg.status === "published" && (
              <Link href={`/paquetes/${pkg.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-forest-800 underline">
                Ver en el sitio <ExternalLink className="size-3.5" />
              </Link>
            )}
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}

          {canPrice && <AvailabilityEditor packageId={pkg.id} days={pkg.days} availability={pkg.availability} departures={pkg.departures} />}

          {pkg.priceHistory.length > 0 && (
            <details className="text-xs text-earth-700">
              <summary className="flex cursor-pointer items-center gap-1 font-semibold text-forest-900"><History className="size-3.5" /> Historial de precios</summary>
              <ul className="mt-2 space-y-1">
                {pkg.priceHistory.map((h, i) => (
                  <li key={i}>
                    {new Date(h.at).toLocaleString("es-PA")} · {h.type}{h.season ? ` · ${h.season}` : " · general"} · {h.operation === "INSERT" ? `nuevo ${h.new}` : h.operation === "DEACTIVATE" ? `retirado (${h.old})` : `${h.old} → ${h.new}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
