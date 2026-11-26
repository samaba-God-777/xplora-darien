"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AtSign, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { ApiError, apiGet } from "@/services/api";
import { apiPost, durationLabel, fmtDate, usePackages } from "./api";
import { useT } from "@/i18n/locale";

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const makeSchema = (t: (es: string, en: string) => string) =>
  z.object({
    package: z.string().min(1, t("Selecciona un paquete", "Choose a tour")),
    travel_date: z.string().refine((d) => d >= tomorrow(), t("La fecha debe ser futura", "The date must be in the future")),
    departure_id: z.string().optional(),
    adults: z.coerce.number().int().min(1, t("Al menos 1 adulto", "At least 1 adult")).max(60),
    children: z.coerce.number().int().min(0).max(60),
    visitor: z.object({
      first_name: z.string().trim().min(1, t("Obligatorio", "Required")).max(80),
      last_name: z.string().trim().min(1, t("Obligatorio", "Required")).max(80),
      email: z.string().trim().email(t("Correo no válido", "Invalid email")),
      phone: z.string().trim().min(6, t("Teléfono no válido", "Invalid phone number")).max(30),
      country: z.string().regex(/^[A-Z]{2}$/, t("Código de país de 2 letras (p. ej. PA)", "2-letter country code (e.g. US)")),
    }),
    services: z.array(z.object({ description: z.string().trim().min(2).max(200), quantity: z.coerce.number().int().min(1).max(50) })).max(10),
    notes: z.string().max(2000).optional(),
  });
type Schema = ReturnType<typeof makeSchema>;
type FormValues = z.input<Schema>;
type Parsed = z.output<Schema>;

interface Breakdown {
  priced: boolean;
  currency: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
}
interface Created {
  code: string;
  status: string;
  message: string;
  price: Breakdown;
  package: { name: string; days: number; nights: number };
  travel_date: string;
  itinerary: { day: number; title: string }[];
}

/** Pasos 1–7 de la solicitud de reserva. La reserva nunca se confirma automáticamente. */
export function BookingForm() {
  const params = useSearchParams();
  const { data: packages, isLoading } = usePackages();
  const destino = params.get("destino");
  const options = useMemo(
    () => (packages ?? []).filter((p) => !destino || p.destinations.some((d) => d.slug === destino)),
    [packages, destino],
  );
  const [done, setDone] = useState<Created | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const { locale, t } = useT();
  const fecha = params.get("fecha");

  const { register, handleSubmit, control, formState, setValue, getValues } = useForm<FormValues, unknown, Parsed>({
    resolver: zodResolver(makeSchema(t)),
    defaultValues: {
      package: params.get("paquete") ?? "",
      travel_date: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
      adults: 2,
      children: 0,
      visitor: { first_name: "", last_name: "", email: "", phone: "", country: "PA" },
      services: [],
      notes: "",
    },
  });
  const services = useFieldArray({ control, name: "services" });
  // Si llegas desde un destino con un solo paquete, se preselecciona.
  // El paquete de la URL (?paquete=) se vuelve a aplicar cuando llegan las opciones, para que el <select> lo muestre.
  const paquete = params.get("paquete");
  useEffect(() => {
    if (paquete && options.some((p) => p.slug === paquete)) setValue("package", paquete, { shouldValidate: false });
    else if (options.length === 1 && !getValues("package")) setValue("package", options[0].slug, { shouldValidate: false });
  }, [options, paquete, getValues, setValue]);
  const [pkgSlug, date, adults, children] = useWatch({ control, name: ["package", "travel_date", "adults", "children"] });
  const pkg = options.find((p) => p.slug === pkgSlug);

  // Paso 6: precio total calculado por el servidor.
  const price = useQuery({
    queryKey: ["price", pkgSlug, date, adults, children],
    queryFn: ({ signal }) =>
      apiGet<Breakdown>(`/bookings/price?package=${pkgSlug}&travel_date=${date}&adults=${adults}&children=${children || 0}`, { signal }),
    enabled: !!pkgSlug && !!date && date >= tomorrow() && Number(adults) >= 1,
    retry: false,
  });

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      setDone(await apiPost<Created>("/bookings", { ...v, locale, departure_id: v.departure_id || undefined }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : t("No se pudo enviar la solicitud", "Could not send the request"));
    }
  });

  const field = "w-full rounded-xl border border-forest-900/15 bg-white px-3.5 py-2.5 text-base outline-none focus:border-forest-700 sm:text-sm";
  const label = "mb-1 block text-xs font-bold uppercase tracking-wider text-forest-800";
  const err = (m?: string) => m && <p className="mt-1 text-xs text-red-700">{m}</p>;

  if (done)
    return (
      <main className="min-h-svh bg-sand-50 px-5 py-16 sm:px-10">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 ring-1 ring-forest-900/5">
          <CheckCircle2 className="size-10 text-forest-700" />
          <h1 className="mt-4 font-display text-4xl text-forest-900">{t("Solicitud recibida", "Request received")}</h1>
          <p className="mt-2 text-earth-700">{done.message}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <dt className="text-earth-600">{t("Código", "Code")}</dt><dd className="font-bold text-forest-900">{done.code}</dd>
            <dt className="text-earth-600">{t("Paquete", "Tour")}</dt><dd>{done.package.name}</dd>
            <dt className="text-earth-600">{t("Fecha", "Date")}</dt><dd className="capitalize">{fmtDate(done.travel_date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd>
            <dt className="text-earth-600">Total</dt>
            <dd>{done.price.priced ? `${done.price.currency} ${done.price.total}` : t("A cotizar", "On request")}</dd>
          </dl>
          <Link href="/galeria" className="mt-8 inline-flex text-sm font-semibold text-forest-800 hover:underline">{t("Volver a la galería", "Back to the gallery")}</Link>
        </div>
      </main>
    );

  return (
    <main className="min-h-svh bg-sand-50 px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/paquetes" className="inline-flex items-center gap-2 text-sm font-semibold text-forest-800 hover:underline">
          <ArrowLeft className="size-4" /> {t("Paquetes", "Tours")}
        </Link>
        <h1 className="mt-6 font-display text-5xl text-forest-900">{t("Solicitar reserva", "Request a booking")}</h1>
        <p className="mt-2 text-earth-700">{t("Nuestro equipo verificará la disponibilidad y te contactará para confirmar.", "Our team will check availability and contact you to confirm.")}</p>
        {destino && options.length > 0 && (
          <p className="mt-3 rounded-xl bg-forest-50 px-4 py-2 text-sm text-forest-900">
            {t("Mostrando los paquetes que visitan este destino", "Showing the tours that visit this destination")} ({options.length}). <Link href="/reservar" className="font-semibold underline">{t("Ver todos", "See all")}</Link>
          </p>
        )}

        {!isLoading && options.length === 0 ? (
          <div className="mt-8 rounded-3xl bg-forest-900 p-8 text-white">
            <p className="text-white/85">
              {destino ? t("Aún no hay paquetes publicados para este destino.", "There are no tours published for this destination yet.") : t("Aún no hay paquetes publicados.", "There are no tours published yet.")}{" "}
              {t("Escríbenos y preparamos tu viaje.", "Message us and we'll plan your trip.")}
            </p>
            <a href="https://www.instagram.com/xplore_darien/" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-gold-400 px-6 py-3 text-sm font-extrabold uppercase text-forest-950">
              <AtSign className="size-4" /> @xplore_darien
            </a>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-8">
            <fieldset className="space-y-4">
              <legend className="font-display text-2xl text-forest-900">1–3 · {t("Viaje", "Trip")}</legend>
              <div>
                <label className={label} htmlFor="package">{t("Paquete", "Tour")}</label>
                <select id="package" className={field} {...register("package")}>
                  <option value="">{t("Selecciona…", "Choose…")}</option>
                  {options.map((p) => <option key={p.slug} value={p.slug}>{p.name} ({durationLabel(p, locale)})</option>)}
                </select>
                {err(formState.errors.package?.message)}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={label} htmlFor="date">{t("Fecha", "Date")}</label>
                  <input id="date" type="date" min={tomorrow()} className={field} {...register("travel_date")} />
                  {err(formState.errors.travel_date?.message)}
                </div>
                <div>
                  <label className={label} htmlFor="adults">{t("Adultos", "Adults")}</label>
                  <input id="adults" type="number" min={1} className={field} {...register("adults")} />
                  {err(formState.errors.adults?.message)}
                </div>
                <div>
                  <label className={label} htmlFor="children">{t("Niños", "Children")}</label>
                  <input id="children" type="number" min={0} className={field} {...register("children")} />
                </div>
              </div>
              {pkg && pkg.availableDates.length > 0 && (
                <div>
                  <p className={label}>{t("Fechas disponibles", "Available dates")}</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={t("Fechas disponibles", "Available dates")}>
                    {pkg.availableDates.map((a) => (
                      <button
                        type="button"
                        key={a.date}
                        onClick={() => setValue("travel_date", a.date, { shouldValidate: true })}
                        aria-pressed={date === a.date}
                        className={`rounded-xl px-3 py-2 text-left text-sm leading-tight ring-1 transition ${date === a.date ? "bg-forest-900 text-white ring-forest-900" : "bg-white text-forest-900 ring-forest-900/15 hover:ring-forest-700"}`}
                      >
                        <span className="block font-semibold capitalize">{fmtDate(a.date, locale)}</span>
                        <span className={`text-[11px] ${date === a.date ? "text-white/75" : "text-earth-600"}`}>{a.seatsLeft} {t(a.seatsLeft === 1 ? "cupo" : "cupos", a.seatsLeft === 1 ? "spot" : "spots")}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-earth-600">{t("También puedes proponer otra fecha: el equipo te dirá si es posible.", "You can also suggest another date: our team will tell you if it's possible.")}</p>
                </div>
              )}
              {pkg && pkg.departures.length > 0 && (
                <div>
                  <label className={label} htmlFor="dep">{t("Salida programada (opcional)", "Scheduled departure (optional)")}</label>
                  <select id="dep" className={field} {...register("departure_id")}>
                    <option value="">{t("Fecha libre", "Flexible date")}</option>
                    {pkg.departures.map((d) => <option key={d.id} value={d.id}>{fmtDate(d.departureDate, locale)} · {d.seatsAvailable} {t("plazas", "seats")}</option>)}
                  </select>
                </div>
              )}
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="font-display text-2xl text-forest-900">4 · {t("Tus datos", "Your details")}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={label} htmlFor="fn">{t("Nombre", "First name")}</label><input id="fn" autoComplete="given-name" className={field} {...register("visitor.first_name")} />{err(formState.errors.visitor?.first_name?.message)}</div>
                <div><label className={label} htmlFor="ln">{t("Apellidos", "Last name")}</label><input id="ln" autoComplete="family-name" className={field} {...register("visitor.last_name")} />{err(formState.errors.visitor?.last_name?.message)}</div>
                <div><label className={label} htmlFor="em">{t("Correo", "Email")}</label><input id="em" type="email" autoComplete="email" className={field} {...register("visitor.email")} />{err(formState.errors.visitor?.email?.message)}</div>
                <div><label className={label} htmlFor="ph">{t("Teléfono", "Phone")}</label><input id="ph" type="tel" autoComplete="tel" className={field} {...register("visitor.phone")} />{err(formState.errors.visitor?.phone?.message)}</div>
                <div><label className={label} htmlFor="co">{t("País (ISO)", "Country (ISO)")}</label><input id="co" maxLength={2} className={`${field} uppercase`} {...register("visitor.country", { setValueAs: (v: string) => v.toUpperCase() })} />{err(formState.errors.visitor?.country?.message)}</div>
              </div>
              <div><label className={label} htmlFor="notes">{t("Observaciones", "Notes")}</label><textarea id="notes" rows={3} className={field} {...register("notes")} /></div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="font-display text-2xl text-forest-900">5 · {t("Servicios adicionales", "Extra services")}</legend>
              <p className="text-sm text-earth-700">{t("Se cotizan aparte (transporte desde la ciudad, noches extra…).", "Quoted separately (transport from the city, extra nights…).")}</p>
              {services.fields.map((f, i) => (
                <div key={f.id} className="flex gap-2">
                  <input placeholder={t("Descripción", "Description")} className={field} {...register(`services.${i}.description`)} />
                  <input type="number" min={1} className={`${field} w-24`} {...register(`services.${i}.quantity`)} />
                  <button type="button" onClick={() => services.remove(i)} className="rounded-xl px-3 text-red-700 hover:bg-red-50" aria-label={t("Quitar servicio", "Remove service")}><Trash2 className="size-4" /></button>
                </div>
              ))}
              {services.fields.length < 10 && (
                <button type="button" onClick={() => services.append({ description: "", quantity: 1 })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-800 hover:underline">
                  <Plus className="size-4" /> {t("Añadir servicio", "Add service")}
                </button>
              )}
            </fieldset>

            <div className="rounded-2xl bg-forest-900 p-5 text-white" aria-live="polite">
              <p className="text-xs font-bold uppercase tracking-wider text-gold-300">6 · {t("Precio total", "Total price")}</p>
              {price.isFetching && <p className="mt-2 text-sm text-white/70">{t("Calculando…", "Calculating…")}</p>}
              {price.error && <p className="mt-2 text-sm text-red-200">{(price.error as Error).message}</p>}
              {price.data && (price.data.priced ? (
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><dt>Subtotal</dt><dd>{price.data.currency} {price.data.subtotal}</dd></div>
                  {Number(price.data.discount_total) > 0 && <div className="flex justify-between"><dt>{t("Descuento", "Discount")}</dt><dd>− {price.data.discount_total}</dd></div>}
                  <div className="flex justify-between"><dt>{t("Impuestos", "Taxes")}</dt><dd>{price.data.tax_total}</dd></div>
                  <div className="flex justify-between border-t border-white/15 pt-2 text-lg font-bold"><dt>Total</dt><dd>{price.data.currency} {price.data.total}</dd></div>
                </dl>
              ) : <p className="mt-2 text-sm text-white/80">{t("Este paquete se cotiza a medida.", "This tour is quoted on request.")}</p>)}
              {!price.data && !price.isFetching && !price.error && <p className="mt-2 text-sm text-white/70">{t("Elige paquete, fecha y participantes.", "Choose a tour, date and participants.")}</p>}
            </div>

            {serverError && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{serverError}</p>}
            <button
              type="submit"
              disabled={formState.isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-4 text-sm font-extrabold uppercase tracking-wider text-forest-950 hover:bg-gold-300 disabled:opacity-60"
            >
              {formState.isSubmitting && <Loader2 className="size-4 animate-spin" />} 7 · {t("Enviar solicitud", "Send request")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
