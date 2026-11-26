"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Info, Minus, Plus, X } from "lucide-react";
import { isOptimizable, track, type MediaItem } from "./api";
import { MediaInfo } from "./MediaInfo";
import { useT } from "@/i18n/locale";

interface Props {
  items: MediaItem[];
  index: number | null;
  onIndex: (i: number | null) => void;
  /** Se llama al acercarse al final para cargar más resultados. */
  onNearEnd?: () => void;
}

const MAX_ZOOM = 4;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(1, z));

export function Lightbox({ items, index, onIndex, onNearEnd }: Props) {
  const { t } = useT();
  const item = index !== null ? (items[index] ?? null) : null;
  const open = item !== null;
  const [showInfo, setShowInfo] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (index === null) return;
      const next = index + dir;
      if (next < 0 || next >= items.length) return;
      onIndex(next);
      if (dir === 1 && next >= items.length - 4) onNearEnd?.();
    },
    [index, items.length, onIndex, onNearEnd],
  );

  // Foco accesible y bloqueo de scroll mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      restore?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onIndex(null);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "i") setShowInfo((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onIndex]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={item.title ?? t("Fotografía", "Photo")}
          className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white lg:flex-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* key: cada foto monta su propio escenario (zoom y carga se reinician solos) */}
            <Stage key={item.id} item={item} onSwipe={go} />

            <span className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-3 py-1.5 text-xs tabular-nums text-white/70">
              {index! + 1} / {items.length}
            </span>
            <div className="absolute right-3 top-3 z-10 flex gap-2">
              <button onClick={() => setShowInfo((s) => !s)} className="lb-btn hidden lg:grid" aria-label={t("Información", "Information")} aria-pressed={showInfo}>
                <Info className="size-5" />
              </button>
              <button ref={closeRef} onClick={() => onIndex(null)} className="lb-btn" aria-label={t("Cerrar", "Close")}>
                <X className="size-5" />
              </button>
            </div>
            <button onClick={() => go(-1)} disabled={index === 0} className="lb-btn absolute left-3 top-1/2 z-10 -translate-y-1/2" aria-label={t("Anterior", "Previous")}>
              <ChevronLeft className="size-6" />
            </button>
            <button onClick={() => go(1)} disabled={index === items.length - 1} className="lb-btn absolute right-3 top-1/2 z-10 -translate-y-1/2" aria-label={t("Siguiente", "Next")}>
              <ChevronRight className="size-6" />
            </button>
          </div>

          {showInfo && (
            <aside className="max-h-[42dvh] shrink-0 overflow-y-auto border-t border-white/10 bg-forest-950/90 p-5 sm:p-6 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
              <MediaInfo item={item} />
              {item.width && item.height && (
                <p className="mt-6 text-[11px] uppercase tracking-wider text-white/40">
                  {item.width} × {item.height} px
                </p>
              )}
            </aside>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Foto con zoom (rueda, doble clic, botones, + / −), arrastre y carga progresiva. */
function Stage({ item, onSwipe }: { item: MediaItem; onSwipe: (dir: 1 | -1) => void }) {
  const { t } = useT();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hiResReady, setHiResReady] = useState(false);
  const start = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => track(item.id, "lightbox_open"), [item.id]);

  const setZoomTo = useCallback((z: number) => {
    const next = clamp(z);
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") setZoomTo(zoom + 0.5);
      else if (e.key === "-") setZoomTo(zoom - 0.5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, setZoomTo]);

  return (
    <div
      className="absolute inset-0 touch-none"
      onWheel={(e) => setZoomTo(zoom - e.deltaY * 0.002)}
      onPointerDown={(e) => {
        // Los botones de zoom conservan su clic (la captura del puntero lo redirigiría).
        if ((e.target as HTMLElement).closest("button")) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!start.current || zoom === 1) return;
        setPan({ x: start.current.px + (e.clientX - start.current.x), y: start.current.py + (e.clientY - start.current.y) });
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        setDragging(false);
        // Deslizar horizontalmente cambia de foto cuando no hay zoom.
        if (s && zoom === 1 && Math.abs(e.clientX - s.x) > 60) onSwipe(e.clientX < s.x ? 1 : -1);
      }}
    >
      <motion.div
        className="absolute inset-0 flex items-center justify-center p-4 sm:p-10"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          className="relative h-full w-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.22,1,0.36,1)",
            cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
          }}
          onDoubleClick={() => setZoomTo(zoom > 1 ? 1 : 2.5)}
        >
          {/* Carga progresiva: versión ligera (ya en caché desde la cuadrícula) y alta resolución encima */}
          <Image src={item.url} alt="" fill sizes="384px" unoptimized={!isOptimizable(item.url)} className="object-contain blur-sm" aria-hidden />
          <Image
            src={item.url}
            alt={item.title ?? t("Fotografía de Darién", "Photo of Darién")}
            fill
            sizes="100vw"
            quality={85}
            unoptimized={!isOptimizable(item.url)}
            onLoad={() => setHiResReady(true)}
            className={`object-contain transition-opacity duration-500 ${hiResReady ? "opacity-100" : "opacity-0"}`}
          />
        </div>
      </motion.div>
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        <button onClick={() => setZoomTo(zoom - 0.5)} className="lb-btn" aria-label="Alejar" disabled={zoom === 1}>
          <Minus className="size-5" />
        </button>
        <span className="grid min-w-14 place-items-center rounded-full bg-black/45 px-3 text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoomTo(zoom + 0.5)} className="lb-btn" aria-label="Acercar" disabled={zoom === MAX_ZOOM}>
          <Plus className="size-5" />
        </button>
      </div>
    </div>
  );
}
