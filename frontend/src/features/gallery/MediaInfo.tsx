"use client";

import Link from "next/link";
import { BadgeCheck, CalendarCheck, ExternalLink, Map, Package, Sparkles } from "lucide-react";
import { ATTRIBUTION_LABEL, track, useMediaDetail, type MediaItem } from "./api";
import { useT } from "@/i18n/locale";

/**
 * Información de un recurso + botones de acción reales:
 * CONOCE ESTE DESTINO · VER PAQUETE TURÍSTICO · SOLICITAR RESERVA.
 * Solo aparecen cuando existe la asociación (no hay botones decorativos).
 * DESCUBRE LA EXPERIENCIA se añadirá cuando exista la página pública de experiencias.
 */
export function MediaInfo({ item, tone = "dark" }: { item: MediaItem; tone?: "dark" | "light" }) {
  const { t } = useT();
  const { data: detail, isLoading } = useMediaDetail(item.id);
  const muted = tone === "dark" ? "text-white/65" : "text-earth-700";
  const dest = detail?.destinations[0];
  const pkg = detail?.packages[0];

  const cta = (kind: string) => () => track(item.id, "cta_click", kind);
  const primary =
    "inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-5 py-3 text-xs font-extrabold uppercase tracking-[0.14em] text-forest-950 transition hover:bg-gold-300 active:scale-[0.98]";
  const secondary = `inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-xs font-extrabold uppercase tracking-[0.14em] transition active:scale-[0.98] ${
    tone === "dark" ? "border-white/30 text-white hover:bg-white/10" : "border-forest-800/30 text-forest-900 hover:bg-forest-50"
  }`;

  return (
    <div className="space-y-5">
      <div>
        {item.aiGenerated && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-gold-400/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gold-300">
            <Sparkles className="size-3.5" /> {t("Generado con IA", "AI-generated")}
          </span>
        )}
        <h2 className="font-display text-2xl leading-tight sm:text-3xl">{item.title ?? "Darién"}</h2>
        {item.description && <p className={`mt-2 text-sm leading-relaxed ${muted}`}>{item.description}</p>}
      </div>

      {detail && detail.destinations.length > 0 && (
        <ul className="space-y-1.5">
          {detail.destinations.map((d) => (
            <li key={d.slug} className={`flex items-start gap-2 text-xs ${muted}`}>
              <BadgeCheck className="mt-px size-4 shrink-0 text-gold-400" />
              <span>
                <strong className={tone === "dark" ? "text-white" : "text-forest-900"}>{d.name}</strong> · {t(...ATTRIBUTION_LABEL[d.attribution])}
              </span>
            </li>
          ))}
        </ul>
      )}
      {detail && detail.destinations.length === 0 && !item.aiGenerated && (
        <p className={`text-xs ${muted}`}>{t("Lugar no identificado: no lo atribuimos a un destino sin verificar su procedencia.", "Place not identified: we don't attribute it to a destination without verifying its source.")}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {dest && (
          <Link href={`/mapa?lugar=${dest.slug}`} onClick={cta("destination")} className={primary}>
            <Map className="size-4" /> {t("Conoce este destino", "Discover this destination")}
          </Link>
        )}
        {pkg && (
          <Link href={`/paquetes/${pkg.slug}`} onClick={cta("package")} className={secondary}>
            <Package className="size-4" /> {t("Ver paquete turístico", "View tour")}
          </Link>
        )}
        {(pkg || dest) && (
          <Link
            href={pkg ? `/reservar?paquete=${pkg.slug}` : `/reservar?destino=${dest!.slug}`}
            onClick={cta("booking")}
            className={secondary}
          >
            <CalendarCheck className="size-4" /> {t("Solicitar reserva", "Request a booking")}
          </Link>
        )}
        {isLoading && <span className={`text-xs ${muted}`}>{t("Cargando…", "Loading…")}</span>}
      </div>

      {item.sourceUrl && (
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline ${muted}`}>
          {t("Publicación original", "Original post")} <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
