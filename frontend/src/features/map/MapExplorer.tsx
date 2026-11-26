"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Layers, List, Map as MapIcon, Mountain, Search, Info } from "lucide-react";
import type { CategoryKey } from "@/data/destinations";
import { activityLabels, categoryLabels, ui, type Locale } from "@/i18n/dictionary";
import { BRAND_LOGO, coverOf, sized } from "@/lib/media";
import { DestinationPanel } from "./DestinationPanel";
import { activityIcons, categoryColor } from "./icons";
import type { MapStyleKey } from "./DarienMap";
import { useMapPoints } from "./useMapPoints";
import { setLocale, useLocale } from "@/i18n/locale";

// La vista inmersiva (three.js) se carga solo cuando se toca un lugar.
const PlaceReveal = dynamic(() => import("./PlaceReveal").then((m) => m.PlaceReveal), { ssr: false });

const DarienMap = dynamic(() => import("./DarienMap").then((m) => m.DarienMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-forest-900" />,
});

const FILTERS: CategoryKey[] = ["cascadas", "rios", "selva", "playas", "montanas", "comunidades", "cultura", "aves"];

export function MapExplorer() {
  const { destinations: all } = useMapPoints();
  const locale = useLocale();
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Abre el destino indicado en ?lugar= (enlace compartible).
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("lugar");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de la URL al montar
    if (slug && all.some((d) => d.slug === slug)) setSelected(slug);
  }, [all]);
  const [styleKey, setStyleKey] = useState<MapStyleKey>("map");
  const [listOpen, setListOpen] = useState(false);
  // 3D por defecto, salvo con «reducir movimiento» o equipos modestos; la elección se recuerda.
  const [terrain3d, setTerrain3d] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("xd-map-3d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const want = saved ? saved === "1" : !reduce && (navigator.hardwareConcurrency ?? 8) > 4;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia del navegador, solo tras hidratar
    if (!want) setTerrain3d(false);
  }, []);
  const toggle3d = () =>
    setTerrain3d((v) => {
      localStorage.setItem("xd-map-3d", v ? "0" : "1");
      return !v;
    });
  const t = ui[locale];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (d) =>
        (!category || d.categories.includes(category)) &&
        (!q ||
          d.name.toLowerCase().includes(q) ||
          d.region[locale].toLowerCase().includes(q) ||
          d.activities.some((a) => activityLabels[a][locale].toLowerCase().includes(q))),
    );
  }, [all, category, query, locale]);

  const active = all.find((d) => d.slug === selected) ?? null;

  const [reveal, setReveal] = useState<string | null>(null);
  const select = useCallback((slug: string) => {
    setSelected(slug);
    setReveal(slug);
    setListOpen(false);
  }, []);

  // Mantiene ?lugar= en la URL para compartir un destino.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("lugar", selected);
    else url.searchParams.delete("lugar");
    window.history.replaceState(null, "", url);
  }, [selected]);

  useEffect(() => {
    // Con la vista inmersiva abierta, Escape la cierra a ella primero (lo gestiona PlaceReveal).
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[data-place-reveal]") && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const list = (
    <ul className="space-y-1.5">
      {filtered.map((d) => (
        <li key={d.slug}>
          <button
            onClick={() => select(d.slug)}
            className={`group flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${
              selected === d.slug ? "bg-forest-800 text-white" : "hover:bg-forest-50"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sized(coverOf(d.photos), 160)}
              alt=""
              loading="lazy"
              className="size-12 shrink-0 rounded-lg object-cover ring-2"
              style={{ ["--tw-ring-color" as string]: categoryColor[d.category] }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{d.name}</span>
              <span className={`flex gap-1 pt-1 ${selected === d.slug ? "text-gold-300" : "text-earth-600"}`}>
                {d.activities.slice(0, 5).map((a) => {
                  const Icon = activityIcons[a];
                  return <Icon key={a} className="size-3.5" aria-label={activityLabels[a][locale]} />;
                })}
              </span>
            </span>
          </button>
        </li>
      ))}
      {filtered.length === 0 && <li className="px-2 py-6 text-center text-sm text-ink-600">{t.noResults}</li>}
    </ul>
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-forest-950">
      <DarienMap destinations={filtered} selected={selected} onSelect={select} styleKey={styleKey} terrain3d={terrain3d} />

      {/* Barra superior */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex w-full flex-col gap-3 lg:w-[360px]">
          <div className="flex items-center gap-3 rounded-2xl bg-sand-50/95 p-2.5 pr-3 shadow-lg shadow-black/15 backdrop-blur">
            <Link
              href="/"
              className="grid size-9 shrink-0 place-items-center rounded-full text-forest-800 transition hover:bg-forest-100"
              aria-label={t.back}
            >
              <ArrowLeft className="size-5" />
            </Link>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND_LOGO} alt="XPLORA DARIÉN" className="size-10 rounded-full" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-lg leading-none text-forest-900">{t.mapTitle}</h1>
              <p className="mt-1 truncate text-xs text-earth-700">{t.mapSubtitle}</p>
            </div>
            <button
              onClick={() => setLocale(locale === "es" ? "en" : "es")}
              className="rounded-full border border-forest-800/20 px-2.5 py-1 text-xs font-bold text-forest-800 transition hover:bg-forest-100"
              aria-label="Cambiar idioma / Change language"
            >
              {locale === "es" ? "EN" : "ES"}
            </button>
          </div>

          {/* Panel de búsqueda + lista (escritorio) */}
          <div className="hidden max-h-[calc(100dvh-120px)] flex-col overflow-hidden rounded-2xl bg-sand-50/95 shadow-lg shadow-black/15 backdrop-blur lg:flex">
            <Filters {...{ t, query, setQuery, category, setCategory, locale }} />
            <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-earth-600">
              {filtered.length} {t.places}
            </p>
            <div className="overflow-y-auto px-2 pb-2">{list}</div>
            <p className="flex items-start gap-1.5 border-t border-forest-900/10 px-4 py-2.5 text-[11px] leading-snug text-earth-700">
              <Info className="mt-px size-3.5 shrink-0" /> {t.routesNote}
            </p>
          </div>
        </div>
      </header>

      {/* Controles flotantes */}
      <div className="absolute right-3 top-[76px] z-20 flex flex-col gap-2 sm:right-4 lg:top-4">
        <button
          onClick={() => setStyleKey((s) => (s === "map" ? "satellite" : "map"))}
          className="flex items-center gap-2 rounded-full bg-sand-50/95 px-3.5 py-2 text-xs font-bold text-forest-900 shadow-lg shadow-black/15 backdrop-blur transition hover:bg-white"
        >
          <Layers className="size-4" /> {styleKey === "map" ? t.satellite : t.mapStyle}
        </button>
        <button
          onClick={toggle3d}
          aria-pressed={terrain3d}
          className="flex items-center gap-2 rounded-full bg-sand-50/95 px-3.5 py-2 text-xs font-bold text-forest-900 shadow-lg shadow-black/15 backdrop-blur transition hover:bg-white"
        >
          {terrain3d ? <MapIcon className="size-4" /> : <Mountain className="size-4" />}
          {terrain3d ? (locale === "es" ? "Vista 2D" : "2D view") : locale === "es" ? "Relieve 3D" : "3D terrain"}
        </button>
        <button
          onClick={() => setListOpen(true)}
          className="flex items-center gap-2 rounded-full bg-sand-50/95 px-3.5 py-2 text-xs font-bold text-forest-900 shadow-lg shadow-black/15 backdrop-blur lg:hidden"
        >
          <List className="size-4" /> {t.list}
        </button>
      </div>

      {/* Lista móvil */}
      <AnimatePresence>
        {listOpen && !active && (
          <motion.div
            className="absolute inset-x-0 bottom-0 z-30 flex max-h-[70dvh] flex-col rounded-t-3xl bg-sand-50 shadow-2xl lg:hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <button onClick={() => setListOpen(false)} className="mx-auto my-2.5 h-1.5 w-10 rounded-full bg-earth-300" aria-label={t.close} />
            <Filters {...{ t, query, setQuery, category, setCategory, locale }} />
            <div className="overflow-y-auto px-2 pb-6">{list}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ficha del destino */}
      <AnimatePresence>
        {active && (
          <motion.aside
            key="panel"
            className="absolute inset-x-0 bottom-0 z-40 h-[78dvh] overflow-hidden rounded-t-3xl bg-sand-50 shadow-2xl lg:inset-y-3 lg:left-auto lg:right-3 lg:h-auto lg:w-[420px] lg:rounded-3xl"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 34, stiffness: 300 }}
          >
            <DestinationPanel key={active.slug} destination={active} locale={locale} onClose={() => setSelected(null)} />
          </motion.aside>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {reveal && active && active.slug === reveal && (
          <div data-place-reveal key={reveal}>
            <PlaceReveal destination={active} locale={locale} onClose={() => setReveal(null)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Filters({
  t,
  query,
  setQuery,
  category,
  setCategory,
  locale,
}: {
  t: (typeof ui)[Locale];
  query: string;
  setQuery: (v: string) => void;
  category: CategoryKey | null;
  setCategory: (c: CategoryKey | null) => void;
  locale: Locale;
}) {
  return (
    <div className="space-y-3 p-3">
      <label className="flex items-center gap-2 rounded-xl border border-forest-900/10 bg-white px-3 py-2 focus-within:border-forest-700">
        <Search className="size-4 text-earth-600" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          className="w-full bg-transparent text-base text-ink-900 outline-none placeholder:text-earth-500 sm:text-sm"
        />
      </label>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
        {[null, ...FILTERS].map((c) => (
          <button
            key={c ?? "all"}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              category === c ? "bg-forest-800 text-gold-300" : "bg-forest-900/5 text-forest-900 hover:bg-forest-900/10"
            }`}
          >
            {c ? categoryLabels[c][locale] : t.all}
          </button>
        ))}
      </div>
    </div>
  );
}
