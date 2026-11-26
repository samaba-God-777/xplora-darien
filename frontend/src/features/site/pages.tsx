"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, CheckCircle2, Loader2, Star } from "lucide-react";
import { ApiError, apiGet } from "@/services/api";
import { apiPost, usePackages } from "@/features/packages/api";
import { Prose, useSite, type SiteSettings } from "./site";
import { useT } from "@/i18n/locale";

const TITLES: Record<string, [string, string]> = {
  "page.about": ["Quiénes somos", "About us"],
  "page.cancellation": ["Cancelaciones", "Cancellations"],
  "page.privacy": ["Política de privacidad", "Privacy policy"],
  "page.terms": ["Términos y condiciones", "Terms and conditions"],
};

/** Página institucional cuyo texto se edita en Panel → Configuración. */
export function InfoPage({ settingKey }: { settingKey: keyof SiteSettings }) {
  const { data, isLoading } = useSite();
  const { locale, t } = useT();
  // En inglés se usa la versión ".en" si el equipo la cargó; si no, el texto en español con un aviso.
  const en = locale === "en" ? data?.[`${settingKey}.en` as keyof SiteSettings] : undefined;
  const text = en || data?.[settingKey];
  return (
    <main className="min-h-[70svh] bg-sand-50 px-5 py-12 sm:px-10">
      <article className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-forest-800 hover:underline"><ArrowLeft className="size-4" /> {t("Inicio", "Home")}</Link>
        <h1 className="mt-6 font-display text-5xl text-forest-900">{t(...(TITLES[settingKey] ?? ["", ""]))}</h1>
        {locale === "en" && !en && text && <p className="mt-4 rounded-xl bg-sand-100 p-3 text-sm text-earth-700">This page is currently available in Spanish only.</p>}
        <div className="mt-8">{isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-forest-900/10" /> : text ? <Prose text={text} /> : <p className="text-earth-700">{t("Contenido en preparación.", "Content coming soon.")}</p>}</div>
      </article>
    </main>
  );
}

export interface Testimonial {
  id: string; name: string; country: string | null; rating: number; body: string; verified: boolean; date: string;
  package: { slug: string; name: string } | null;
}
export function useTestimonials(pkg?: string, limit = 12) {
  return useQuery({
    queryKey: ["testimonials", pkg, limit],
    queryFn: ({ signal }) => apiGet<{ count: number; average: string | null; items: Testimonial[] }>(`/testimonials?limit=${limit}${pkg ? `&package=${pkg}` : ""}`, { signal }),
    staleTime: 5 * 60_000,
  });
}

export function Stars({ n, size = "size-4" }: { n: number; size?: string }) {
  const { t } = useT();
  return (
    <span className="flex" aria-label={t(`${n} de 5 estrellas`, `${n} out of 5 stars`)}>
      {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`${size} ${i < n ? "fill-gold-400 text-gold-400" : "text-earth-300"}`} />)}
    </span>
  );
}

export function TestimonialCard({ t }: { t: Testimonial }) {
  const { t: tr } = useT();
  return (
    <figure className="flex h-full flex-col rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
      <Stars n={t.rating} />
      <blockquote className="mt-4 flex-1 text-ink-800">“{t.body}”</blockquote>
      <figcaption className="mt-5 text-sm">
        <span className="font-semibold text-forest-900">{t.name}</span>
        {t.country && <span className="text-earth-600"> · {t.country}</span>}
        {t.verified && <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-forest-800"><BadgeCheck className="size-4" /> {tr("Viaje verificado", "Verified trip")}{t.package ? ` · ${t.package.name}` : ""}</span>}
      </figcaption>
    </figure>
  );
}

/** Sección de testimonios para la portada y los paquetes. No se muestra si aún no hay opiniones publicadas. */
export function TestimonialsSection({ pkg, title }: { pkg?: string; title?: string }) {
  const { data } = useTestimonials(pkg, 6);
  const { t } = useT();
  if (!data || data.count === 0) return null;
  return (
    <section className="bg-sand-100 px-5 py-20 sm:px-10" aria-labelledby="testimonios">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600">{t("Opiniones", "Reviews")}</p>
            <h2 id="testimonios" className="mt-2 font-display text-4xl text-forest-900">{title ?? t("Lo que dicen los viajeros", "What travelers say")}</h2>
          </div>
          <p className="flex items-center gap-2 text-sm text-earth-700"><Stars n={Math.round(Number(data.average))} /> {data.average} / 5 · {data.count} {t("opiniones", "reviews")}</p>
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">{data.items.map((t) => <li key={t.id}><TestimonialCard t={t} /></li>)}</ul>
        <Link href="/opiniones" className="mt-8 inline-flex text-sm font-semibold text-forest-800 hover:underline">{t("Ver todas y dejar tu opinión", "See all and leave a review")}</Link>
      </div>
    </section>
  );
}

const makeReviewSchema = (t: (es: string, en: string) => string) =>
  z.object({
    name: z.string().trim().min(2, t("Escribe tu nombre", "Enter your name")).max(80),
    email: z.string().trim().email(t("Correo no válido", "Invalid email")),
    country: z.string().regex(/^([A-Z]{2})?$/, t("Código de 2 letras, p. ej. PA", "2-letter code, e.g. US")).optional(),
    rating: z.coerce.number().int().min(1, t("Elige una calificación", "Choose a rating")).max(5),
    body: z.string().trim().min(20, t("Cuéntanos un poco más (mínimo 20 caracteres)", "Tell us a bit more (at least 20 characters)")).max(1500),
    booking_code: z.string().trim().optional(),
    package: z.string().optional(),
  });
type ReviewSchema = ReturnType<typeof makeReviewSchema>;
type ReviewForm = z.input<ReviewSchema>;
type ReviewParsed = z.output<ReviewSchema>;

/** /opiniones: testimonios publicados + formulario (moderado antes de publicarse). */
export function ReviewsPage() {
  const { data } = useTestimonials(undefined, 50);
  const pkgs = usePackages();
  const [done, setDone] = useState<{ verified: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { locale, t } = useT();
  const { register, handleSubmit, setValue, control, formState } = useForm<ReviewForm, unknown, ReviewParsed>({
    resolver: zodResolver(makeReviewSchema(t)),
    defaultValues: { rating: 0, country: "PA", booking_code: "", package: "" },
  });
  const rating = Number(useWatch({ control, name: "rating" }));
  const onSubmit = handleSubmit(async (v) => {
    setErr(null);
    try {
      const r = await apiPost<{ verified: boolean }>("/reviews", {
        ...v, locale, country: v.country || undefined, booking_code: v.booking_code || undefined, package: v.package || undefined,
      });
      setDone(r);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("No se pudo enviar", "Could not send"));
    }
  });
  const field = "w-full rounded-xl border border-forest-900/15 bg-white px-3.5 py-2.5 text-base outline-none focus:border-forest-700 sm:text-sm";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-wider text-forest-800";
  const e = (m?: string) => m && <p className="mt-1 text-xs text-red-700">{m}</p>;

  return (
    <main className="bg-sand-50 px-5 py-12 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-forest-800 hover:underline"><ArrowLeft className="size-4" /> {t("Inicio", "Home")}</Link>
        <h1 className="mt-6 font-display text-5xl text-forest-900">{t("Opiniones de viajeros", "Traveler reviews")}</h1>
        {data && data.count > 0 && <p className="mt-3 flex items-center gap-2 text-earth-700"><Stars n={Math.round(Number(data.average))} /> {data.average} / 5 · {data.count} {t("opiniones publicadas", "published reviews")}</p>}
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_400px]">
          <section aria-label={t("Opiniones publicadas", "Published reviews")}>
            {data?.count === 0 && <p className="rounded-2xl bg-white p-8 text-earth-700 ring-1 ring-forest-900/5">{t("Aún no hay opiniones publicadas. ¿Viajaste con nosotros? Sé la primera persona en contarlo.", "No reviews published yet. Traveled with us? Be the first to share it.")}</p>}
            <ul className="grid gap-4 md:grid-cols-2">{data?.items.map((t) => <li key={t.id}><TestimonialCard t={t} /></li>)}</ul>
          </section>
          <section className="h-fit rounded-3xl bg-white p-6 ring-1 ring-forest-900/5" aria-labelledby="dejar">
            <h2 id="dejar" className="font-display text-3xl text-forest-900">{t("Deja tu opinión", "Leave a review")}</h2>
            {done ? (
              <div className="mt-4 space-y-2 text-sm">
                <CheckCircle2 className="size-8 text-forest-700" />
                <p className="font-semibold text-forest-900">{t("¡Gracias! Recibimos tu opinión.", "Thank you! We received your review.")}</p>
                <p className="text-earth-700">{t("La publicaremos después de revisarla", "We'll publish it after reviewing it")}{done.verified ? t(", marcada como viaje verificado", ", marked as a verified trip") : ""}.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
                <fieldset>
                  <legend className={lbl}>{t("Calificación", "Rating")}</legend>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button type="button" key={n} onClick={() => setValue("rating", n, { shouldValidate: true })} aria-label={t(`${n} estrellas`, `${n} stars`)} aria-pressed={rating === n}>
                        <Star className={`size-8 ${n <= rating ? "fill-gold-400 text-gold-400" : "text-earth-300"}`} />
                      </button>
                    ))}
                  </div>
                  {e(formState.errors.rating?.message)}
                </fieldset>
                <div><label className={lbl} htmlFor="rn">{t("Nombre", "Name")}</label><input id="rn" className={field} autoComplete="name" {...register("name")} />{e(formState.errors.name?.message)}</div>
                <div><label className={lbl} htmlFor="re">{t("Correo (no se publica)", "Email (not published)")}</label><input id="re" type="email" className={field} autoComplete="email" {...register("email")} />{e(formState.errors.email?.message)}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl} htmlFor="rc">{t("País", "Country")}</label><input id="rc" maxLength={2} className={`${field} uppercase`} {...register("country", { setValueAs: (v: string) => v.toUpperCase() })} />{e(formState.errors.country?.message)}</div>
                  <div>
                    <label className={lbl} htmlFor="rp">{t("Paquete", "Tour")}</label>
                    <select id="rp" className={field} {...register("package")}>
                      <option value="">—</option>
                      {pkgs.data?.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className={lbl} htmlFor="rb">{t("Tu experiencia", "Your experience")}</label><textarea id="rb" rows={5} className={field} {...register("body")} />{e(formState.errors.body?.message)}</div>
                <div>
                  <label className={lbl} htmlFor="rk">{t("Código de reserva (opcional)", "Booking code (optional)")}</label>
                  <input id="rk" className={field} placeholder="XD-2026-000001" {...register("booking_code")} />
                  <p className="mt-1 text-xs text-earth-600">{t("Con tu código y el mismo correo de la reserva, tu opinión aparece como “viaje verificado”.", "With your code and the same email used for the booking, your review shows as a “verified trip”.")}</p>
                </div>
                {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</p>}
                <button disabled={formState.isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-400 px-6 py-3 text-sm font-extrabold uppercase tracking-wider text-forest-950 hover:bg-gold-300 disabled:opacity-60">
                  {formState.isSubmitting && <Loader2 className="size-4 animate-spin" />} {t("Enviar opinión", "Submit review")}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
