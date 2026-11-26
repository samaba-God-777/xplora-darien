"use client";

import Image from "next/image";
import Link from "next/link";
import { Camera, Film, MapPin } from "lucide-react";
import { isOptimizable, useGalleryDestinations } from "./api";
import { Parallax, Reveal, TiltCard } from "./fx";

/** Índice de la galería por pueblo o destino turístico. */
export function DestinationGrid() {
  const { data, isLoading, isError } = useGalleryDestinations();
  if (isError) return <p className="text-sm text-red-700">No se pudieron cargar los destinos.</p>;
  if (isLoading || !data) return <div className="h-80 animate-pulse rounded-3xl bg-forest-900/10" />;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {data.map((d, i) => (
        <Reveal as="li" key={d.slug} index={i}>
          <TiltCard className="rounded-3xl">
          <Link
            href={`/galeria/destino/${d.slug}`}
            className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-3xl bg-forest-900 p-4 text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
          >
            {d.cover && (
              <Parallax>
                <Image src={d.cover.url} alt="" fill sizes="(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw" quality={70}
                  unoptimized={!isOptimizable(d.cover.url)} className="object-cover transition duration-[1.2s] ease-out group-hover:scale-105" />
              </Parallax>
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <span className="relative">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300">
                <MapPin className="size-3" /> {d.region.split("·")[0].trim()}
              </span>
              <span className="mt-1 block font-display text-xl leading-tight sm:text-2xl">{d.name}</span>
              <span className="mt-2 flex gap-3 text-[11px] text-white/75">
                <span className="inline-flex items-center gap-1"><Camera className="size-3.5" /> {d.photos}</span>
                {d.videos > 0 && <span className="inline-flex items-center gap-1"><Film className="size-3.5" /> {d.videos}</span>}
              </span>
            </span>
          </Link>
          </TiltCard>
        </Reveal>
      ))}
    </ul>
  );
}
