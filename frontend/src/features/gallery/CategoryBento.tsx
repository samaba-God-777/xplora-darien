"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, Film } from "lucide-react";
import { isOptimizable, useCategories } from "./api";
import { Parallax, Reveal, TiltCard } from "./fx";
import { useT } from "@/i18n/locale";

/** Bento de categorías editoriales: cada una con portada, título y descripción propios. */
export function CategoryBento() {
  const { t } = useT();
  const { data, isLoading, isError } = useCategories();
  if (isError) return <p className="text-sm text-red-700">{t("No se pudieron cargar las categorías.", "Could not load the collections.")}</p>;
  if (isLoading || !data) return <div className="h-[520px] animate-pulse rounded-3xl bg-forest-900/10" />;

  // Patrón bento: piezas grandes al inicio y en el medio para ritmo editorial.
  const span = (i: number) =>
    i === 0 ? "md:col-span-2 md:row-span-2" : i === 5 ? "md:col-span-2" : i === 8 ? "md:row-span-2" : "";

  return (
    <ul className="grid auto-rows-[220px] grid-cols-2 gap-3 sm:gap-4 md:auto-rows-[240px] md:grid-cols-4">
      {data.map((c, i) => (
        <Reveal as="li" key={c.key} index={i} className={`${span(i)} ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
          <TiltCard className="h-full rounded-3xl" max={i === 0 ? 4 : 8}>
          <Link
            href={`/galeria/${c.key}`}
            className="group relative flex h-full flex-col justify-end overflow-hidden rounded-3xl bg-forest-900 p-4 text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-gold-400 sm:p-5"
          >
            {c.cover && (
              <Parallax amount={8}>
              <Image
                src={c.cover.url}
                alt=""
                fill
                sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
                quality={70}
                unoptimized={!isOptimizable(c.cover.url)}
                className="object-cover transition duration-[1.2s] ease-out group-hover:scale-105"
              />
              </Parallax>
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <span className="relative">
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-gold-300">{c.tagline}</span>
              <span className={`mt-1 block font-display leading-tight ${i === 0 ? "text-3xl sm:text-4xl" : "text-xl"}`}>{c.name}</span>
              {i === 0 && <span className="mt-2 hidden max-w-md text-sm text-white/80 sm:block">{c.description}</span>}
              <span className="mt-2 flex gap-3 text-[11px] text-white/70">
                {c.photos > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Camera className="size-3.5" /> {c.photos}
                  </span>
                )}
                {c.videos > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Film className="size-3.5" /> {c.videos}
                  </span>
                )}
                {c.photos + c.videos === 0 && <span>{t("Próximamente", "Coming soon")}</span>}
              </span>
            </span>
          </Link>
          </TiltCard>
        </Reveal>
      ))}
    </ul>
  );
}
