"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarCheck, ChevronLeft, ChevronRight, Compass, MapPin, X } from "lucide-react";
import type { Destination } from "@/data/destinations";
import { activityLabels, categoryLabels, type Locale } from "@/i18n/dictionary";
import { mediaUrl, sized } from "@/lib/media";
import { activityIcons } from "./icons";
import { PhotoStage } from "./PhotoStage";

const AUTOPLAY_MS = 7000;
const ease = [0.22, 1, 0.36, 1] as const;

/** Vista inmersiva al tocar un lugar del mapa: foto grande en WebGL + textos animados. */
export function PlaceReveal({ destination: d, locale, onClose }: { destination: Destination; locale: Locale; onClose: () => void }) {
  // Texturas a 1920 px (AVIF/WebP) desde las fotos HD: nítidas a pantalla completa sin descargar el archivo entero.
  const photos = useMemo(() => d.photos.map((p) => sized(mediaUrl(p), 1920, 80)), [d.photos]);
  const thumbs = useMemo(() => d.photos.map((p) => sized(mediaUrl(p), 160)), [d.photos]);
  const [i, setI] = useState(0);
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const es = locale === "es";

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => (n + 1) % Math.max(photos.length, 1));
      if (e.key === "ArrowLeft") setI((n) => (n - 1 + photos.length) % Math.max(photos.length, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length]);

  // Pase automático entre fotos
  useEffect(() => {
    if (reduce || photos.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % photos.length), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [i, photos.length, reduce]);

  const words = d.name.split(" ");
  const item = (delay: number) => ({
    initial: { opacity: 0, y: 18, filter: "blur(6px)" },
    animate: ready ? { opacity: 1, y: 0, filter: "blur(0px)" } : {},
    transition: { delay: reduce ? 0 : delay, duration: 0.8, ease },
  });

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={d.name}
      className="fixed inset-0 z-[90] overflow-hidden bg-forest-950 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      transition={{ duration: 0.4 }}
    >
      {photos.length > 0 ? (
        <PhotoStage photos={photos} index={i} onReady={() => setReady(true)} />
      ) : (
        <div className="absolute inset-0 bg-forest-950" />
      )}
      {/* Legibilidad del texto */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/20" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/40 to-transparent" />

      <button
        ref={closeRef}
        onClick={onClose}
        className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-black/40 backdrop-blur transition hover:bg-black/60 focus-visible:outline-3 focus-visible:outline-gold-400 sm:right-6 sm:top-6"
        aria-label={es ? "Cerrar" : "Close"}
      >
        <X className="size-5" />
      </button>

      <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-8 sm:px-10 sm:pb-12">
        <div className="mx-auto max-w-6xl">
          <motion.p {...item(0.15)} className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-gold-300">
            {categoryLabels[d.category][locale]} <span className="text-white/40">·</span>
            <span className="inline-flex items-center gap-1 normal-case tracking-normal text-white/80"><MapPin className="size-3.5" /> {d.region[locale]}</span>
          </motion.p>
          <h2 className="mt-3 font-display text-5xl leading-[0.95] sm:text-7xl lg:text-8xl">
            {words.map((w, k) => (
              <span key={k} className="inline-block overflow-hidden pb-1 align-bottom">
                <motion.span
                  className="inline-block"
                  initial={{ y: "110%" }}
                  animate={ready ? { y: "0%" } : {}}
                  transition={{ delay: reduce ? 0 : 0.25 + k * 0.09, duration: 0.9, ease }}
                >
                  {w}&nbsp;
                </motion.span>
              </span>
            ))}
          </h2>
          <motion.p {...item(0.55)} className="mt-4 max-w-2xl text-lg text-white/85">{d.summary[locale]}</motion.p>

          <motion.ul
            className="mt-5 flex flex-wrap gap-2"
            initial="hidden"
            animate={ready ? "show" : "hidden"}
            variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.05, delayChildren: reduce ? 0 : 0.7 } } }}
          >
            {d.activities.map((a) => {
              const Icon = activityIcons[a];
              return (
                <motion.li
                  key={a}
                  variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1 } }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold backdrop-blur"
                >
                  <Icon className="size-3.5 text-gold-300" /> {activityLabels[a][locale]}
                </motion.li>
              );
            })}
          </motion.ul>

          <motion.div {...item(0.95)} className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/reservar?destino=${d.slug}`}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider text-forest-950 transition hover:bg-gold-300 active:scale-[0.98]"
            >
              <CalendarCheck className="size-4" /> {es ? "Solicitar este viaje" : "Request this trip"}
            </Link>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider transition hover:bg-white/10"
            >
              <Compass className="size-4" /> {es ? "Explorar el lugar" : "Explore the place"}
            </button>

            {photos.length > 1 && (
              <div className="flex items-center gap-2 sm:ml-auto">
                <button onClick={() => setI((n) => (n - 1 + photos.length) % photos.length)} className="lb-btn" aria-label={es ? "Foto anterior" : "Previous photo"}>
                  <ChevronLeft className="size-5" />
                </button>
                <div className="flex max-w-[50vw] gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {photos.slice(0, 10).map((p, k) => (
                    <button
                      key={p}
                      onClick={() => setI(k)}
                      aria-label={`${es ? "Foto" : "Photo"} ${k + 1}`}
                      aria-current={k === i}
                      className={`relative h-11 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition ${k === i ? "ring-gold-400" : "opacity-60 ring-transparent hover:opacity-100"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbs[k]} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {k === i && !reduce && (
                        <motion.span key={i} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gold-400" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }} />
                      )}
                    </button>
                  ))}
                </div>
                <button onClick={() => setI((n) => (n + 1) % photos.length)} className="lb-btn" aria-label={es ? "Foto siguiente" : "Next photo"}>
                  <ChevronRight className="size-5" />
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {!ready && (
          <motion.div className="absolute inset-0 grid place-items-center" exit={{ opacity: 0 }}>
            <span className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-gold-400" aria-label={es ? "Cargando" : "Loading"} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
