"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Sparkles } from "lucide-react";
import { isOptimizable, useMediaPages, type MediaFilter, type MediaItem } from "./api";
import { Lightbox } from "./Lightbox";
import { Reveal, TiltCard } from "./fx";
import { useT } from "@/i18n/locale";

/** Masonry de fotografías con carga bajo demanda (scroll infinito + botón accesible). */
export function MasonryGallery({ filter, limit = 24, emptyText }: { filter: MediaFilter; limit?: number; emptyText?: string }) {
  const { t } = useT();
  const q = useMediaPages({ ...filter, type: "photo" }, limit);
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const [open, setOpen] = useState<number | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && !isFetchingNextPage && fetchNextPage(), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (q.isError) return <p className="rounded-2xl bg-red-50 p-6 text-sm text-red-700">{t("No se pudo cargar la galería. Verifica que la API esté disponible.", "Could not load the gallery. Check that the API is available.")}</p>;
  if (q.isLoading) return <GridSkeleton />;
  if (items.length === 0) return <p className="rounded-2xl bg-sand-100 p-8 text-center text-sm text-earth-700">{emptyText ?? t("Aún no hay fotografías publicadas aquí.", "No photos published here yet.")}</p>;

  return (
    <>
      <ul className="columns-2 gap-3 sm:gap-4 md:columns-3 xl:columns-4 [&>li]:mb-3 sm:[&>li]:mb-4">
        {items.map((m, i) => (
          <Reveal as="li" key={m.id} index={i} className="break-inside-avoid">
            <TiltCard className="rounded-2xl" max={6}>
              <Tile item={m} onOpen={() => setOpen(i)} priority={i < 4} />
            </TiltCard>
          </Reveal>
        ))}
      </ul>
      <div ref={sentinel} className="flex justify-center py-8">
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="inline-flex items-center gap-2 rounded-full border border-forest-800/25 px-6 py-3 text-sm font-semibold text-forest-900 transition hover:bg-forest-50"
          >
            {isFetchingNextPage && <Loader2 className="size-4 animate-spin" />} {t("Cargar más fotografías", "Load more photos")}
          </button>
        )}
      </div>
      <Lightbox items={items} index={open} onIndex={setOpen} onNearEnd={() => hasNextPage && fetchNextPage()} />
    </>
  );
}

function Tile({ item, onOpen, priority }: { item: MediaItem; onOpen: () => void; priority?: boolean }) {
  const { t } = useT();
  const [loaded, setLoaded] = useState(false);
  const ratio = item.width && item.height ? item.width / item.height : 4 / 5;
  return (
    <button
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-2xl bg-forest-900/90 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
      style={{ aspectRatio: String(ratio) }}
      aria-label={`${t("Ver", "View")} ${item.title ?? t("fotografía", "photo")}`}
    >
      <Image
        src={item.url}
        alt={item.title ?? t("Fotografía de Darién", "Photo of Darién")}
        fill
        sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
        quality={70}
        priority={priority}
        unoptimized={!isOptimizable(item.url)}
        onLoad={() => setLoaded(true)}
        className={`object-cover transition duration-700 ease-out group-hover:scale-[1.04] ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-sm font-semibold text-white opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
        {item.title}
      </span>
      {item.aiGenerated && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-300">
          <Sparkles className="size-3" /> IA
        </span>
      )}
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="columns-2 gap-4 md:columns-3 xl:columns-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="mb-4 animate-pulse rounded-2xl bg-forest-900/10" style={{ aspectRatio: i % 3 === 0 ? "3/4" : "4/3" }} />
      ))}
    </div>
  );
}
