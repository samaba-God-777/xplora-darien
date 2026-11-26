"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Gauge,
  MapPin,
  Navigation,
  ShieldAlert,
  TriangleAlert,
  X,
  BadgeCheck,
} from "lucide-react";
import type { Destination } from "@/data/destinations";
import { activityLabels, categoryLabels, difficultyLabels, ui, type Locale } from "@/i18n/dictionary";
import { BRAND_LOGO, mediaUrl, sized } from "@/lib/media";
import { activityIcons } from "./icons";

interface Props {
  destination: Destination;
  locale: Locale;
  onClose: () => void;
}

export function DestinationPanel({ destination: d, locale, onClose }: Props) {
  const t = ui[locale];
  const media: { kind: "img" | "video" | "logo"; src: string }[] = [
    ...d.photos.map((src) => ({ kind: "img" as const, src })),
    ...d.videos.map((src) => ({ kind: "video" as const, src })),
  ];
  const [index, setIndex] = useState(0);
  // Sin fotografía verificada: se muestra el logotipo en lugar de una imagen no atribuible.
  const current = media[index] ?? media[0] ?? { kind: "logo", src: "" };
  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + media.length) % media.length);

  return (
    <article className="flex h-full flex-col" aria-labelledby="dest-title">
      {/* Galería */}
      <div className="relative aspect-[4/3] max-h-[34dvh] w-full shrink-0 overflow-hidden bg-forest-950 lg:aspect-[16/11] lg:max-h-none">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={current.src}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {current.kind === "logo" ? (
              <div className="grid h-full w-full place-items-center bg-forest-900 text-center">
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={BRAND_LOGO} alt="" className="mx-auto size-20 rounded-full opacity-90" />
                  <p className="mt-3 px-6 text-xs text-white/70">Aún no hay fotografías verificadas de este lugar.</p>
                </div>
              </div>
            ) : current.kind === "img" ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto HD pasada por el optimizador con sized()
              <img src={sized(mediaUrl(current.src), 1080, 80)} alt={d.name} className="h-full w-full object-cover" />
            ) : (
              <video
                src={mediaUrl(current.src)}
                className="h-full w-full bg-black object-contain"
                controls
                autoPlay
                muted
                playsInline
                loop
              />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />
        <button
          onClick={onClose}
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-gold-400"
          aria-label={t.close}
        >
          <X className="size-5" />
        </button>
        {media.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              aria-label="Anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              aria-label="Siguiente"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute bottom-3 right-3 flex gap-1.5">
              {media.map((m, i) => (
                <button
                  key={m.src}
                  onClick={() => setIndex(i)}
                  aria-label={`${m.kind === "video" ? t.video : "Foto"} ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-gold-400" : "w-1.5 bg-white/60"}`}
                />
              ))}
            </div>
          </>
        )}
        <div className="absolute bottom-3 left-4 right-24 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300">
            {categoryLabels[d.category][locale]}
          </p>
          <h2 id="dest-title" className="font-display text-2xl leading-tight sm:text-3xl">
            {d.name}
          </h2>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-8 pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-earth-700">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-red-600" />
            {d.region[locale]}
          </span>
          {d.coordsVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-forest-100 px-2 py-0.5 text-xs font-medium text-forest-800">
              <BadgeCheck className="size-3.5" /> {t.verified}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-earth-800"
              title={t.approxHint}
            >
              <TriangleAlert className="size-3.5" /> {t.approx}
            </span>
          )}
        </div>

        <p className="text-[15px] leading-relaxed text-ink-800">{d.description[locale]}</p>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-forest-800">{t.activities}</h3>
          <ul className="grid grid-cols-2 gap-2">
            {d.activities.map((a) => {
              const Icon = activityIcons[a];
              return (
                <li
                  key={a}
                  className="flex items-center gap-2.5 rounded-xl border border-forest-900/10 bg-white px-3 py-2.5 text-sm font-medium text-ink-800 shadow-[0_1px_0_rgba(31,77,43,0.06)]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-forest-800 text-gold-300">
                    <Icon className="size-4" />
                  </span>
                  {activityLabels[a][locale]}
                </li>
              );
            })}
          </ul>
        </section>

        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: Clock, label: t.duration, value: d.visitDuration[locale] },
            { icon: Gauge, label: t.difficulty, value: difficultyLabels[d.difficulty][locale] },
            { icon: CalendarDays, label: t.season, value: d.season[locale] },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl bg-sand-100 px-2 py-3">
              <Icon className="mx-auto mb-1 size-4 text-earth-700" />
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-earth-600">{label}</dt>
              <dd className="mt-0.5 text-xs font-medium leading-snug text-ink-800">{value}</dd>
            </div>
          ))}
        </dl>

        {d.history && (
          <section>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.16em] text-forest-800">{t.history}</h3>
            <p className="text-sm leading-relaxed text-ink-700">{d.history[locale]}</p>
          </section>
        )}

        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-forest-800">
            <Navigation className="size-3.5" /> {t.access}
          </h3>
          <p className="text-sm leading-relaxed text-ink-700">{d.access[locale]}</p>
        </section>

        <section className="rounded-xl border-l-4 border-red-600 bg-red-50 px-4 py-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-red-700">
            <ShieldAlert className="size-3.5" /> {t.safety}
          </h3>
          <p className="text-sm leading-relaxed text-ink-800">{d.safety[locale]}</p>
          {!d.coordsVerified && <p className="mt-1.5 text-xs text-ink-600">{t.approxHint}</p>}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={`/reservar?destino=${d.slug}`}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-gold-400 px-5 py-3 text-sm font-bold uppercase tracking-wide text-forest-950 transition hover:bg-gold-300 active:scale-[0.98]"
          >
            {t.requestTrip}
          </a>
          {d.coordsVerified && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${d.coords[0]},${d.coords[1]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-forest-800/25 px-5 py-3 text-sm font-semibold text-forest-800 transition hover:bg-forest-50"
            >
              {t.openMaps} <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        {d.sources[0] && (
          <a
            href={d.sources[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-earth-700 underline-offset-2 hover:underline"
          >
            {t.source} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </article>
  );
}
