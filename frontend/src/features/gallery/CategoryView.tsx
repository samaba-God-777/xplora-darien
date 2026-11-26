"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isOptimizable, useCategories } from "./api";
import { MasonryGallery } from "./MasonryGallery";
import { VideoGallery } from "./VideoGallery";
import { useT } from "@/i18n/locale";

/** Portada editorial propia de cada categoría + fotos y videos. */
export function CategoryView({ categoryKey }: { categoryKey: string }) {
  const { t } = useT();
  const { data, isLoading } = useCategories();
  const cat = data?.find((c) => c.key === categoryKey);
  if (data && !cat) notFound();

  return (
    <main>
      <header className="relative isolate flex min-h-[70svh] items-end overflow-hidden bg-forest-950 text-white">
        {cat?.cover && (
          <Image src={cat.cover.url} alt="" fill priority sizes="100vw" quality={80} unoptimized={!isOptimizable(cat.cover.url)} className="-z-10 object-cover" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950 via-forest-950/50 to-forest-950/20" />
        <Link href="/galeria" className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-black/50 sm:left-10">
          <ArrowLeft className="size-4" /> {t("Galería", "Gallery")}
        </Link>
        <div className="mx-auto w-full max-w-7xl px-5 pb-14 sm:px-10">
          {isLoading ? (
            <div className="h-24 w-2/3 animate-pulse rounded-2xl bg-white/10" />
          ) : (
            cat && (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-300">{cat.tagline}</p>
                <h1 className="mt-3 font-display text-5xl leading-none sm:text-7xl">{cat.name}</h1>
                <p className="mt-5 max-w-2xl text-lg text-white/85">{cat.description}</p>
                <p className="mt-4 text-sm text-white/60">
                  {cat.photos} {t("fotografías", "photos")} · {cat.videos} videos
                </p>
              </>
            )
          )}
        </div>
      </header>

      {cat && cat.videos > 0 && (
        <section className="bg-forest-950 px-5 py-16 sm:px-10">
          <div className="mx-auto max-w-7xl">
            <VideoGallery filter={{ category: categoryKey }} />
          </div>
        </section>
      )}
      <section className="bg-sand-50 px-5 py-16 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <MasonryGallery
            filter={{ category: categoryKey }}
            emptyText={
              categoryKey === "paquetes-turisticos"
                ? t("Las fotografías de paquetes aparecerán cuando el equipo publique los primeros paquetes turísticos.", "Tour photos will appear once the team publishes the first tours.")
                : undefined
            }
          />
        </div>
      </section>
    </main>
  );
}
