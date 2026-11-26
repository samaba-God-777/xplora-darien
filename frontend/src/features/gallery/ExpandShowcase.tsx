"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { isOptimizable, useHero, type MediaItem } from "./api";
import { useT } from "@/i18n/locale";

/**
 * Escena "pin & expand" estilo Apple: una fotografía empieza como tarjeta pequeña y,
 * mientras se hace scroll, crece hasta ocupar toda la pantalla; luego aparece el texto.
 */
export function ExpandShowcase() {
  const { data } = useHero();
  const photo = data?.photos?.[1] ?? data?.photos?.[0];
  if (!photo) return null;
  return <Expand photo={photo} />;
}

function Expand({ photo }: { photo: MediaItem }) {
  const { t } = useT();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  const width = useTransform(scrollYProgress, [0, 0.55], ["42%", "100%"]);
  const height = useTransform(scrollYProgress, [0, 0.55], ["52%", "100%"]);
  const radius = useTransform(scrollYProgress, [0, 0.55], [36, 0]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.35, 1]);
  const introOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const introY = useTransform(scrollYProgress, [0, 0.2], [0, -40]);
  const outroOpacity = useTransform(scrollYProgress, [0.55, 0.75], [0, 1]);
  const outroY = useTransform(scrollYProgress, [0.55, 0.75], [40, 0]);

  const img = (
    <Image src={photo.url} alt={photo.title ?? t("Paisaje de Darién", "Darién landscape")} fill sizes="100vw" quality={80}
      unoptimized={!isOptimizable(photo.url)} className="object-cover" />
  );

  if (reduce) {
    return (
      <section ref={ref} className="relative h-[80svh] overflow-hidden bg-forest-950 text-white">
        {img}
        <div className="absolute inset-0 bg-black/40" />
        <Outro />
      </section>
    );
  }

  return (
    <section ref={ref} className="relative h-[260svh] bg-sand-50" aria-label={t("Darién de cerca", "Darién up close")}>
      <div className="sticky top-0 flex h-[100svh] items-center justify-center overflow-hidden">
        <motion.p
          style={{ opacity: introOpacity, y: introY }}
          className="absolute top-[12%] px-5 text-center font-display text-4xl text-forest-900 sm:text-6xl"
        >
          {t("Mira más de cerca.", "Take a closer look.")}
        </motion.p>
        <motion.div
          style={{ width, height, borderRadius: radius }}
          className="relative overflow-hidden bg-forest-900 shadow-[0_40px_120px_rgba(10,30,20,0.35)]"
        >
          <motion.div className="absolute inset-0" style={{ scale: imgScale }}>
            {img}
          </motion.div>
          <motion.div style={{ opacity: outroOpacity }} className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <motion.div style={{ opacity: outroOpacity, y: outroY }} className="absolute inset-0">
            <Outro />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function Outro() {
  const { t } = useT();
  return (
    <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-5 pb-14 text-white sm:px-10 sm:pb-20">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-300">{t("Darién sin filtros", "Darién, unfiltered")}</p>
      <p className="mt-3 max-w-3xl font-display text-4xl leading-[0.95] sm:text-6xl lg:text-7xl">
        {t("Cada foto es un lugar real, visitado por nuestra comunidad.", "Every photo is a real place, visited by our community.")}
      </p>
    </div>
  );
}
