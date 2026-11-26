"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowLeft, CalendarCheck, Check, Clock, Gauge, MapPin, X } from "lucide-react";
import { ApiError } from "@/services/api";
import { mediaUrl } from "@/lib/media";
import { MasonryGallery } from "@/features/gallery/MasonryGallery";
import { VideoGallery } from "@/features/gallery/VideoGallery";
import { durationLabel, fmtDate, seasonName, usePackage } from "./api";
import { useT } from "@/i18n/locale";
import { difficultyLabels } from "@/i18n/dictionary";
import { TestimonialsSection } from "@/features/site/pages";

const PRICE_LABEL: Record<string, [string, string]> = {
  per_person: ["Por persona", "Per person"],
  adult: ["Adulto", "Adult"],
  child: ["Niño", "Child"],
  group: ["Grupo", "Group"],
  special: ["Precio especial", "Special price"],
};

const fmtMd = (md: string, l: "es" | "en") => fmtDate(`2000-${md}`, l, { day: "numeric", month: "short" });

/** Ficha de paquete con su propia galería de fotos y videos. */
export function PackageDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: p, isLoading, error } = usePackage(slug);
  const { locale, t } = useT();
  if (error instanceof ApiError && error.status === 404) notFound();
  if (isLoading || !p) return <div className="min-h-svh animate-pulse bg-forest-950" />;

  return (
    <main>
      <header className="relative isolate flex min-h-[70svh] items-end overflow-hidden bg-forest-950 text-white">
        {p.media[0] && <Image src={mediaUrl(p.media[0])} alt="" fill priority sizes="100vw" className="-z-10 object-cover" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950 via-forest-950/50 to-transparent" />
        <Link href="/paquetes" className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-semibold backdrop-blur sm:left-10">
          <ArrowLeft className="size-4" /> {t("Paquetes", "Tours")}
        </Link>
        <div className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-300">{p.code}</p>
          <h1 className="mt-2 font-display text-5xl leading-none sm:text-6xl">{p.name}</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">{p.shortDescription}</p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm text-white/80">
            <span className="inline-flex items-center gap-1.5"><Clock className="size-4" /> {durationLabel(p, locale)}</span>
            <span className="inline-flex items-center gap-1.5"><Gauge className="size-4" /> {difficultyLabels[p.difficulty as keyof typeof difficultyLabels]?.[locale] ?? p.difficulty}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" /> {p.destinations.map((d) => d.name).join(" · ")}</span>
          </div>
          <Link
            href={`/reservar?paquete=${p.slug}`}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider text-forest-950 hover:bg-gold-300"
          >
            <CalendarCheck className="size-4" /> {t("Solicitar reserva", "Request a booking")}
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          <p className="whitespace-pre-line text-ink-800">{p.description}</p>
          {p.itinerary.length > 0 && (
            <div>
              <h2 className="font-display text-3xl text-forest-900">{t("Itinerario", "Itinerary")}</h2>
              <ol className="mt-5 space-y-4">
                {p.itinerary.map((d) => (
                  <li key={d.day} className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-600">{t("Día", "Day")} {d.day}</p>
                    <h3 className="mt-1 text-lg font-semibold text-forest-900">{d.title}</h3>
                    {d.description && <p className="mt-1 text-sm text-earth-700">{d.description}</p>}
                    <p className="mt-2 text-xs text-earth-600">
                      {[d.transport && `${t("Transporte", "Transport")}: ${d.transport}`, d.meals && `${t("Alimentación", "Meals")}: ${d.meals}`, d.lodging && `${t("Alojamiento", "Lodging")}: ${d.lodging}`].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <aside className="space-y-6">
          <div className="rounded-2xl bg-forest-900 p-5 text-white">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gold-300">{t("Precios vigentes", "Current prices")}</h2>
            {p.prices.length === 0 ? (
              <p className="mt-2 text-sm text-white/75">{t("A cotizar: el equipo te enviará el precio verificado.", "On request: our team will send you the verified price.")}</p>
            ) : (
              <div className="mt-3 space-y-4 text-sm">
                {Object.values(
                  p.prices.reduce<Record<string, { title: string; period?: string; today: boolean; rows: typeof p.prices }>>((acc, x) => {
                    const k = x.season?.key ?? "general";
                    acc[k] ??= {
                      title: x.season ? seasonName(x.season, locale) : t("Todo el año", "All year"),
                      period: x.season ? `${fmtMd(x.season.start, locale)} – ${fmtMd(x.season.end, locale)}` : undefined,
                      today: x.appliesToday,
                      rows: [],
                    };
                    acc[k].rows.push(x);
                    return acc;
                  }, {}),
                ).map((g) => (
                  <div key={g.title}>
                    <p className="flex items-center gap-2 text-xs font-semibold text-white/80">
                      {g.title} {g.period && <span className="font-normal text-white/55">{g.period}</span>}
                      {g.today && g.period && <span className="rounded-full bg-gold-400 px-1.5 py-px text-[10px] font-bold uppercase text-forest-950">{t("Vigente", "Current")}</span>}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {g.rows.map((x) => (
                        <li key={x.id} className="flex justify-between">
                          <span>{t(...(PRICE_LABEL[x.type] ?? [x.type, x.type]))}{x.minGroupSize ? ` (${x.minGroupSize}+ ${t("personas", "people")})` : ""}</span>
                          <strong>{p.currency} {x.amount}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="text-[11px] text-white/55">{t("El precio final se calcula según la fecha de tu viaje.", "The final price is calculated from your travel date.")}</p>
                {p.feesNote && <p className="rounded-lg bg-gold-400/15 px-2.5 py-2 text-xs text-gold-200">{p.feesNote}</p>}
              </div>
            )}
          </div>
          {p.availableDates.length > 0 && (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-red-600">{t("Próximas fechas", "Upcoming dates")}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {p.availableDates.slice(0, 8).map((a) => (
                  <li key={a.date}>
                    <Link
                      href={`/reservar?paquete=${p.slug}&fecha=${a.date}`}
                      className="flex flex-col rounded-xl bg-sand-100 px-3 py-2 text-sm leading-tight transition hover:bg-gold-100 hover:ring-1 hover:ring-gold-400"
                    >
                      <span className="font-semibold capitalize text-forest-900">{fmtDate(a.date, locale)}</span>
                      <span className="text-[11px] text-earth-600">{a.seatsLeft} {t(a.seatsLeft === 1 ? "cupo" : "cupos", a.seatsLeft === 1 ? "spot" : "spots")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-earth-600">{t("Elige una fecha para solicitarla. El equipo la confirma contigo.", "Pick a date to request it. Our team confirms it with you.")}</p>
            </div>
          )}
          {p.inclusions.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {p.inclusions.map((i) => (
                <li key={i.description} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-forest-700" /> {i.description}</li>
              ))}
            </ul>
          )}
          {p.exclusions.length > 0 && (
            <ul className="space-y-1.5 text-sm text-earth-700">
              {p.exclusions.map((e) => (
                <li key={e} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-red-600" /> {e}</li>
              ))}
            </ul>
          )}
        </aside>
      </section>

      <TestimonialsSection pkg={p.slug} title={t("Opiniones de este viaje", "Reviews of this trip")} />
      <section className="bg-forest-950 px-5 py-14 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <VideoGallery filter={{ package: p.slug }} />
        </div>
      </section>
      <section className="bg-sand-50 px-5 py-14 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-6 font-display text-3xl text-forest-900">{t("Galería del paquete", "Tour gallery")}</h2>
          <MasonryGallery filter={{ package: p.slug }} emptyText={t("Este paquete aún no tiene fotografías asociadas.", "This tour has no photos yet.")} />
        </div>
      </section>
    </main>
  );
}
