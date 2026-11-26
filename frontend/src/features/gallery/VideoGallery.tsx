"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Play, Sparkles, X } from "lucide-react";
import { isOptimizable, track, useMediaPages, type MediaFilter, type MediaItem, type Orientation } from "./api";
import { MediaInfo } from "./MediaInfo";
import { Reveal, TiltCard } from "./fx";
import { useT } from "@/i18n/locale";

const fmt = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

/**
 * Galería de videos: solo se cargan los pósters. El video se descarga (streaming con Range)
 * únicamente cuando el visitante lo reproduce.
 */
export function VideoGallery({ filter, title = true }: { filter: MediaFilter; title?: boolean }) {
  const { t } = useT();
  const [orientation, setOrientation] = useState<Orientation | undefined>();
  const q = useMediaPages({ ...filter, type: "video", orientation }, 12);
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const [playing, setPlaying] = useState<MediaItem | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const tabs: { key: Orientation | undefined; label: string }[] = [
    { key: undefined, label: t("Todos", "All") },
    { key: "vertical", label: t("Verticales", "Vertical") },
    { key: "horizontal", label: t("Horizontales", "Horizontal") },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {title && <h3 className="font-display text-2xl text-white sm:text-3xl">Videos</h3>}
        <div role="tablist" aria-label={t("Formato", "Format")} className="flex gap-1 rounded-full bg-white/10 p-1">
          {tabs.map((t) => (
            <button
              key={t.label}
              role="tab"
              aria-selected={orientation === t.key}
              onClick={() => setOrientation(t.key)}
              className={`relative rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${orientation === t.key ? "text-forest-950" : "text-white/80 hover:text-white"}`}
            >
              {orientation === t.key && (
                <motion.span layoutId="video-tab-pill" className="absolute inset-0 rounded-full bg-gold-400" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
              )}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {q.isLoading && <div className="h-72 animate-pulse rounded-3xl bg-white/5" />}
      {!q.isLoading && items.length === 0 && (
        <p className="rounded-2xl bg-white/5 p-8 text-center text-sm text-white/70">{t("No hay videos publicados con este formato todavía.", "No videos published in this format yet.")}</p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((v, i) => (
          <Reveal as="li" key={v.id} index={i} className={v.orientation === "horizontal" ? "col-span-2" : ""}>
            <TiltCard className="rounded-2xl" max={6}>
            <button
              onClick={() => setPlaying(v)}
              onPointerEnter={(e) => e.pointerType === "mouse" && setPreview(v.id)}
              onPointerLeave={() => setPreview((p) => (p === v.id ? null : p))}
              className="group relative block w-full overflow-hidden rounded-2xl bg-black text-left focus-visible:outline-3 focus-visible:outline-gold-400"
              style={{ aspectRatio: v.width && v.height ? `${v.width}/${v.height}` : "9/16" }}
              aria-label={`${t("Reproducir", "Play")} ${v.title ?? "video"}`}
            >
              {v.posterUrl && (
                <Image
                  src={v.posterUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  quality={65}
                  unoptimized={!isOptimizable(v.posterUrl)}
                  className="object-cover opacity-85 transition duration-700 group-hover:scale-[1.04] group-hover:opacity-100"
                />
              )}
              {/* Vista previa silenciosa al pasar el mouse (solo se descarga en ese momento) */}
              {preview === v.id && (
                <motion.video
                  src={v.url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-cover"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.25 }}
                />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur transition group-hover:scale-110 group-hover:bg-gold-400 group-hover:text-forest-950">
                <Play className="ml-0.5 size-6 fill-current" />
              </span>
              <span className="absolute inset-x-0 bottom-0 p-3">
                <span className="block text-sm font-semibold text-white">{v.title}</span>
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-white/65">
                  {fmt(v.duration)} {v.orientation === "vertical" ? "· Vertical" : v.orientation === "horizontal" ? "· Horizontal" : ""}
                  {v.aiGenerated && (
                    <span className="inline-flex items-center gap-0.5 text-gold-300">
                      <Sparkles className="size-3" /> IA
                    </span>
                  )}
                </span>
              </span>
            </button>
            </TiltCard>
          </Reveal>
        ))}
      </ul>
      {q.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <button onClick={() => q.fetchNextPage()} className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10">
            {q.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />} {t("Más videos", "More videos")}
          </button>
        </div>
      )}
      <VideoPlayer item={playing} onClose={() => setPlaying(null)} />
    </div>
  );
}

/** Reproductor integrado: controles nativos, pantalla completa y CTAs. */
export function VideoPlayer({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  const { t } = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const played = useRef(false);

  useEffect(() => {
    if (!item) return;
    played.current = false;
    const prevFocus = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
  }, [item, onClose]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={item.title ?? "Video"}
          className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white lg:flex-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8">
            <video
              key={item.id}
              src={item.url}
              poster={item.posterUrl}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="max-h-full max-w-full rounded-xl bg-black"
              onPlay={() => {
                if (!played.current) track(item.id, "play");
                played.current = true;
              }}
              onEnded={() => track(item.id, "complete")}
            />
            <button ref={closeRef} onClick={onClose} className="lb-btn absolute right-3 top-3" aria-label={t("Cerrar video", "Close video")}>
              <X className="size-5" />
            </button>
          </div>
          <aside className="max-h-[40dvh] shrink-0 overflow-y-auto border-t border-white/10 bg-forest-950/90 p-5 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0 lg:p-6">
            <MediaInfo item={item} />
          </aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
