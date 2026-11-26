"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, AtSign, Clock, Route } from "lucide-react";
import { mediaUrl } from "@/lib/media";
import { durationLabel, priceFrom, usePackages } from "./api";
import { useT } from "@/i18n/locale";

export function PackageList() {
  const { data, isLoading, isError } = usePackages();
  const { locale, t } = useT();
  return (
    <main className="min-h-svh bg-sand-50 px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/galeria" className="inline-flex items-center gap-2 text-sm font-semibold text-forest-800 hover:underline">
          <ArrowLeft className="size-4" /> {t("Galería", "Gallery")}
        </Link>
        <h1 className="mt-6 font-display text-5xl text-forest-900">{t("Paquetes turísticos", "Tour packages")}</h1>
        <p className="mt-3 max-w-2xl text-earth-700">
          {t(
            "Ordenados de más cerca a más lejos de Ciudad de Panamá. Los precios cambian según la temporada; ninguna reserva se confirma sin revisar la disponibilidad.",
            "Sorted from closest to farthest from Panama City. Prices change by season; no booking is confirmed without checking availability.",
          )}
        </p>
        {isLoading && <div className="mt-10 h-64 animate-pulse rounded-3xl bg-forest-900/10" />}
        {isError && <p className="mt-10 rounded-2xl bg-red-50 p-6 text-sm text-red-700">{t("No se pudieron cargar los paquetes.", "Could not load the tours.")}</p>}
        {data && data.length === 0 && (
          <div className="mt-10 rounded-3xl bg-forest-900 p-8 text-white sm:p-12">
            <h2 className="font-display text-3xl">{t("Muy pronto", "Coming soon")}</h2>
            <p className="mt-3 max-w-xl text-white/80">
              {t("Todavía no hay paquetes publicados. Mientras tanto, escríbenos y armamos tu viaje con guías locales.", "No tours published yet. In the meantime, message us and we'll plan your trip with local guides.")}
            </p>
            <a
              href="https://www.instagram.com/xplore_darien/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold-400 px-6 py-3 text-sm font-extrabold uppercase tracking-wider text-forest-950"
            >
              <AtSign className="size-4" /> @xplore_darien
            </a>
          </div>
        )}
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((p) => {
            const from = priceFrom(p);
            return (
              <li key={p.id}>
                <Link href={`/paquetes/${p.slug}`} className="group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-forest-900/5 transition hover:shadow-lg">
                  <div className="relative aspect-[4/3] bg-forest-900">
                    {p.media[0] && <Image src={mediaUrl(p.media[0])} alt="" fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />}
                  </div>
                  <div className="p-5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">{p.code}</p>
                    <h2 className="mt-1 font-display text-2xl text-forest-900">{p.name}</h2>
                    <p className="mt-2 line-clamp-2 text-sm text-earth-700">{p.shortDescription}</p>
                    {p.distanceKm !== null && (
                      <p className="mt-3 flex items-start gap-1.5 text-xs text-earth-700">
                        <Route className="mt-px size-3.5 shrink-0 text-red-600" />
                        <span>~{p.distanceKm} km {t("desde Ciudad de Panamá", "from Panama City")}{p.accessNote ? ` · ${p.accessNote}` : ""}</span>
                      </p>
                    )}
                    <p className="mt-4 flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-1 text-earth-700">
                        <Clock className="size-4" /> {durationLabel(p, locale)}
                      </span>
                      {from !== null && <strong className="text-forest-900">{t("desde", "from")} {p.currency} {from.toFixed(2)}</strong>}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
