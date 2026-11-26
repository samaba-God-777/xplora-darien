"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarCheck, Map, Package } from "lucide-react";
import { apiGet } from "@/services/api";
import { isOptimizable, useGalleryDestinations } from "./api";
import { MasonryGallery } from "./MasonryGallery";
import { VideoGallery } from "./VideoGallery";
import { useT } from "@/i18n/locale";

interface DestinationDetail {
  packages: { slug: string; name: string; days: number; nights: number }[];
}

/** Galería de un pueblo o destino: sus fotos y videos, con acceso al mapa, paquetes y reserva. */
export function DestinationGallery({ slug }: { slug: string }) {
  const { t } = useT();
  const { data, isLoading } = useGalleryDestinations();
  const d = data?.find((x) => x.slug === slug);
  const detail = useQuery({
    queryKey: ["destination", slug],
    queryFn: ({ signal }) => apiGet<DestinationDetail>(`/destinations/${slug}`, { signal }),
  });
  if (data && !d) notFound();
  const pkgs = detail.data?.packages ?? [];

  return (
    <main>
      <header className="relative isolate flex min-h-[70svh] items-end overflow-hidden bg-forest-950 text-white">
        {d?.cover && <Image src={d.cover.url} alt="" fill priority sizes="100vw" quality={80} unoptimized={!isOptimizable(d.cover.url)} className="-z-10 object-cover" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950 via-forest-950/50 to-forest-950/20" />
        <Link href="/galeria#destinos" className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-black/50 sm:left-10">
          <ArrowLeft className="size-4" /> {t("Galería por destino", "Gallery by destination")}
        </Link>
        <div className="mx-auto w-full max-w-7xl px-5 pb-14 sm:px-10">
          {isLoading || !d ? (
            <div className="h-24 w-2/3 animate-pulse rounded-2xl bg-white/10" />
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-300">{d.region}</p>
              <h1 className="mt-3 font-display text-5xl leading-none sm:text-7xl">{d.name}</h1>
              <p className="mt-5 max-w-2xl text-lg text-white/85">{d.summary}</p>
              <p className="mt-3 text-sm text-white/60">{d.photos} {t("fotografías", "photos")} · {d.videos} videos</p>
              <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link href={`/mapa?lugar=${d.slug}`} className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-6 py-3 text-xs font-extrabold uppercase tracking-[0.14em] text-forest-950 hover:bg-gold-300">
                  <Map className="size-4" /> {t("Conoce este destino", "Discover this destination")}
                </Link>
                {pkgs.map((p) => (
                  <Link key={p.slug} href={`/paquetes/${p.slug}`} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/35 px-6 py-3 text-xs font-extrabold uppercase tracking-[0.14em] hover:bg-white/10">
                    <Package className="size-4" /> {p.name}
                  </Link>
                ))}
                <Link href={pkgs[0] ? `/reservar?paquete=${pkgs[0].slug}` : `/reservar?destino=${d.slug}`} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/35 px-6 py-3 text-xs font-extrabold uppercase tracking-[0.14em] hover:bg-white/10">
                  <CalendarCheck className="size-4" /> {t("Solicitar reserva", "Request a booking")}
                </Link>
              </div>
            </>
          )}
        </div>
      </header>

      {d && d.videos > 0 && (
        <section className="bg-forest-950 px-5 py-16 sm:px-10">
          <div className="mx-auto max-w-7xl">
            <VideoGallery filter={{ destination: slug }} />
          </div>
        </section>
      )}
      <section className="bg-sand-50 px-5 py-16 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <MasonryGallery filter={{ destination: slug }} />
          <p className="mt-6 text-xs text-earth-600">
            {t("Solo se muestran imágenes cuyo lugar está indicado por su autor, por un letrero visible o verificado por el equipo.", "We only show images whose place is named by their author, identified by a visible sign or verified by our team.")}
          </p>
        </div>
      </section>
    </main>
  );
}
