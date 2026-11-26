"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useMotionTemplate, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { BRAND_LOGO } from "@/lib/media";
import { isOptimizable, useHero, type MediaItem } from "./api";
import { LocaleSwitch, useT } from "@/i18n/locale";

const SCENE_MS = 9000;

/**
 * Hero cinematográfico: alterna videos destacados y fotografías de naturaleza con
 * fundidos y movimiento lento. Solo se monta el video de la escena actual.
 * Los videos de pageWeb son verticales: en escritorio se muestran en un marco vertical
 * nítido sobre un fondo desenfocado del mismo plano (sin escalar el video de más).
 */
export function GalleryHero() {
  const { t } = useT();
  const { data } = useHero();
  const reduce = useReducedMotion();
  const scenes = useMemo(() => {
    const v = data?.videos ?? [];
    const p = data?.photos ?? [];
    const out: MediaItem[] = [];
    for (let i = 0; i < Math.max(v.length, p.length); i++) {
      if (v[i]) out.push(v[i]);
      if (p[i]) out.push(p[i]);
    }
    return out;
  }, [data]);
  const [i, setI] = useState(0);
  const scene = scenes.length ? scenes[i % scenes.length] : null;

  useEffect(() => {
    if (reduce || scenes.length < 2) return;
    const t = setTimeout(() => setI((n) => n + 1), SCENE_MS);
    return () => clearTimeout(t);
  }, [i, scenes.length, reduce]);

  const bg = scene ? (scene.type === "video" ? scene.posterUrl : scene.url) : undefined;

  // Al bajar: el hero se recorta en una tarjeta redondeada, la imagen se acerca y el texto se aleja.
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const inset = useTransform(scrollYProgress, [0, 1], [0, 5]);
  const radius = useTransform(scrollYProgress, [0, 1], [0, 48]);
  const clip = useMotionTemplate`inset(0% ${inset}% 0% ${inset}% round ${radius}px)`;
  const zoom = useTransform(scrollYProgress, [0, 1], [1, 1.18]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -140]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  return (
    <motion.section
      ref={ref}
      style={reduce ? undefined : { clipPath: clip }}
      className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-forest-950 text-white"
      aria-label={t("Darién, una aventura sin límites", "Darién, an adventure without limits")}
    >
      <motion.div className="absolute inset-0 -z-20" style={reduce ? undefined : { scale: zoom }}>
      <AnimatePresence initial={false}>
        {scene && bg && (
          <motion.div
            key={scene.id}
            className="absolute inset-0 -z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
          >
            <motion.div
              className="absolute inset-0"
              initial={{ scale: reduce ? 1 : 1.12, x: 0 }}
              animate={{ scale: 1, x: reduce ? 0 : i % 2 ? -18 : 18 }}
              transition={{ duration: SCENE_MS / 1000 + 1.6, ease: "linear" }}
            >
              <Image
                src={bg}
                alt=""
                fill
                priority
                sizes="100vw"
                quality={80}
                unoptimized={!isOptimizable(bg)}
                className={`object-cover ${scene.type === "video" ? "scale-110 blur-2xl brightness-75 lg:blur-3xl" : ""}`}
              />
            </motion.div>
            {scene.type === "video" && (
              <video
                src={scene.url}
                poster={scene.posterUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover lg:inset-y-[12%] lg:left-auto lg:right-[7%] lg:h-[76%] lg:w-auto lg:rounded-[28px] lg:shadow-[0_40px_120px_rgba(0,0,0,0.6)] lg:ring-1 lg:ring-white/15"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950 via-forest-950/45 to-forest-950/25 lg:bg-gradient-to-r lg:from-forest-950/90 lg:via-forest-950/45 lg:to-transparent" />

      <nav className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_LOGO} alt="" className="size-11 rounded-full" />
          <span className="font-display text-lg tracking-wide">XPLORA DARIÉN</span>
        </Link>
        <div className="flex gap-2 text-sm font-semibold">
          <Link href="/mapa" className="rounded-full px-4 py-2 transition hover:bg-white/10">{t("Mapa", "Map")}</Link>
          <Link href="/paquetes" className="rounded-full px-4 py-2 transition hover:bg-white/10">{t("Paquetes", "Tours")}</Link>
          <LocaleSwitch />
        </div>
      </nav>

      <motion.div className="mx-auto w-full max-w-7xl px-5 pb-16 sm:px-10 sm:pb-24" style={reduce ? undefined : { y: textY, opacity: textOpacity }}>
        <motion.p
          className="mb-5 text-xs font-bold uppercase tracking-[0.32em] text-gold-300"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
        >
          Cinematic Gallery · Darién, Panamá
        </motion.p>
        <motion.h1
          className="max-w-3xl font-display text-5xl leading-[0.92] sm:text-7xl lg:text-[6.5rem]"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          {t("Darién, una aventura", "Darién, an adventure")} <span className="text-gold-400">{t("sin límites", "without limits")}</span>
        </motion.h1>
        <motion.p
          className="mt-6 max-w-xl text-lg text-white/85"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.8 }}
        >
          {t("Explora la naturaleza, descubre su cultura y vive experiencias extraordinarias.", "Explore nature, discover its culture and live extraordinary experiences.")}
        </motion.p>
        <motion.div className="mt-9 flex flex-col gap-3 sm:flex-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
          <a
            href="#galeria"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider text-forest-950 transition hover:bg-gold-300 active:scale-[0.98]"
          >
            {t("Descubrir galería", "Discover the gallery")} <ArrowDown className="size-4" />
          </a>
          <Link
            href="/paquetes"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider transition hover:bg-white/10"
          >
            {t("Explorar paquetes", "Explore tours")} <ArrowRight className="size-4" />
          </Link>
        </motion.div>

        {scenes.length > 1 && (
          <div className="mt-12 flex max-w-md items-center gap-3">
            <div className="flex flex-1 gap-1.5" aria-hidden>
              {scenes.map((s, n) => (
                <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
                  {n === i % scenes.length && !reduce && (
                    <motion.span
                      className="block h-full bg-gold-400"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: SCENE_MS / 1000, ease: "linear" }}
                    />
                  )}
                </span>
              ))}
            </div>
            <span className="min-w-0 truncate text-xs text-white/70">{scene?.title}</span>
          </div>
        )}
      </motion.div>
    </motion.section>
  );
}
