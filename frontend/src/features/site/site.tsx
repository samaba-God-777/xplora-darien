"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { apiGet } from "@/services/api";
import { BRAND_LOGO } from "@/lib/media";
import { useT } from "@/i18n/locale";

export type SiteSettings = Partial<Record<
  "contact.whatsapp" | "contact.email" | "contact.phone" | "contact.address" | "contact.name" | "page.about" | "page.cancellation" | "page.privacy" | "page.terms"
  | "page.about.en" | "page.cancellation.en" | "page.privacy.en" | "page.terms.en",
  string
>>;

export function useSite() {
  return useQuery({ queryKey: ["site"], queryFn: ({ signal }) => apiGet<SiteSettings>("/site", { signal }), staleTime: 10 * 60_000 });
}

export const waLink = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

/** Botón flotante de WhatsApp (solo si el negocio configuró su número) y pie de página. Oculto en el panel. */
export function PublicChrome() {
  const path = usePathname();
  const { data } = useSite();
  const { t } = useT();
  if (path.startsWith("/admin")) return null;
  const wa = data?.["contact.whatsapp"];
  return (
    <>
      {wa && (
        <a
          href={waLink(wa, t(`Hola XPLORA DARIÉN, quiero información sobre un viaje a Darién. (Desde ${path})`, `Hi XPLORA DARIÉN, I'd like information about a trip to Darién. (From ${path})`))}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("Escríbenos por WhatsApp", "Message us on WhatsApp")}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-black/25 transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
        >
          <MessageCircle className="size-5 fill-white/20" /> <span className="hidden sm:inline">WhatsApp</span>
        </a>
      )}
      {path !== "/mapa" && <SiteFooter site={data} />}
    </>
  );
}

function SiteFooter({ site }: { site?: SiteSettings }) {
  const link = "text-white/75 hover:text-white";
  const { t } = useT();
  return (
    <footer className="bg-forest-950 px-5 py-14 text-sm text-white sm:px-10">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND_LOGO} alt="" className="size-11 rounded-full" />
            <span className="font-display text-xl">XPLORA DARIÉN</span>
          </Link>
          <p className="mt-4 max-w-sm text-white/70">{t("Turismo de naturaleza, aventura y cultura en Darién, Panamá, con guías y comunidades locales.", "Nature, adventure and culture tourism in Darién, Panama, with local guides and communities.")}</p>
          <ul className="mt-5 space-y-2 text-white/80">
            {site?.["contact.name"] && <li className="font-semibold text-white">{t("Atención", "Contact")}: {site["contact.name"]}</li>}
            {site?.["contact.whatsapp"] && (
              <li><a className="inline-flex items-center gap-2 hover:text-white" href={waLink(site["contact.whatsapp"], t("Hola XPLORA DARIÉN", "Hi XPLORA DARIÉN"))} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> WhatsApp</a></li>
            )}
            {site?.["contact.phone"] && <li><a className="inline-flex items-center gap-2 hover:text-white" href={`tel:${site["contact.phone"]}`}><Phone className="size-4" /> {site["contact.phone"]}</a></li>}
            {site?.["contact.email"] && <li><a className="inline-flex items-center gap-2 hover:text-white" href={`mailto:${site["contact.email"]}`}><Mail className="size-4" /> {site["contact.email"]}</a></li>}
            {site?.["contact.address"] && <li className="inline-flex items-center gap-2"><MapPin className="size-4" /> {site["contact.address"]}</li>}
            <li><a className="inline-flex items-center gap-2 hover:text-white" href="https://www.instagram.com/xplore_darien/" target="_blank" rel="noopener noreferrer"><AtSign className="size-4" /> @xplore_darien</a></li>
          </ul>
        </div>
        <nav aria-label={t("Explorar", "Explore")}>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gold-300">{t("Explorar", "Explore")}</p>
          <ul className="space-y-2">
            {[["/paquetes", t("Paquetes", "Tours")], ["/galeria", t("Galería", "Gallery")], ["/mapa", t("Mapa de Darién", "Map of Darién")], ["/opiniones", t("Opiniones", "Reviews")], ["/reservar", t("Solicitar reserva", "Request a booking")]].map(([h, l]) => (
              <li key={h}><Link className={link} href={h}>{l}</Link></li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t("Información", "Information")}>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gold-300">{t("Información", "Information")}</p>
          <ul className="space-y-2">
            {[["/nosotros", t("Quiénes somos", "About us")], ["/cancelaciones", t("Cancelaciones", "Cancellations")], ["/privacidad", t("Privacidad", "Privacy")], ["/terminos", t("Términos y condiciones", "Terms and conditions")]].map(([h, l]) => (
              <li key={h}><Link className={link} href={h}>{l}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-12 max-w-6xl border-t border-white/10 pt-6 text-xs text-white/50">© XPLORA DARIÉN · Darién, Panamá</p>
    </footer>
  );
}

/** Texto simple: párrafos, **negrita** y listas con "- ". Sin HTML, sin riesgos de inyección. */
export function Prose({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="text-forest-900">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  return (
    <div className="space-y-4 text-[17px] leading-relaxed text-ink-800">
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.length && lines.every((l) => l.trim().startsWith("- ")))
          return <ul key={i} className="list-disc space-y-1.5 pl-6">{lines.map((l, j) => <li key={j}>{inline(l.trim().slice(2))}</li>)}</ul>;
        return <p key={i}>{inline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
