import Link from "next/link";
import { ArrowRight, AtSign as Instagram, CalendarCheck, Images, LayoutDashboard, MapPinned, Package } from "lucide-react";
import { BRAND_LOGO, mediaUrl } from "@/lib/media";
import { TestimonialsSection } from "@/features/site/pages";
import { FeaturedDestinations3D } from "@/features/home/FeaturedDestinations3D";
import { ScrollHeadline } from "@/features/gallery/fx";
import { LocaleSwitch, T } from "@/i18n/locale";

const HERO_VIDEO = "instagram/videos/2026-11-09_DfiYvP4hpeX_reel.mp4";
const HERO_POSTER = "imagen/img3.webp";
const FEATURED = ["cascada-arenal", "playa-muerto", "parque-nacional-darien", "el-embudo", "yaviza", "puerto-lara"];

export default function Home() {
  return (
    <main>
      {/* HERO */}
      <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-forest-950 text-white">
        <video
          className="absolute inset-0 -z-10 h-full w-full object-cover"
          src={mediaUrl(HERO_VIDEO)}
          poster={mediaUrl(HERO_POSTER)}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950 via-forest-950/40 to-forest-950/30" />
        <nav className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 sm:px-10">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND_LOGO} alt="" className="size-11 rounded-full" />
            <span className="font-display text-lg tracking-wide">XPLORA DARIÉN</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            {[
              { href: "/galeria", label: <T es="Galería" en="Gallery" />, icon: Images },
              { href: "/mapa", label: <T es="Mapa" en="Map" />, icon: MapPinned },
              { href: "/paquetes", label: <T es="Paquetes" en="Tours" />, icon: Package },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition hover:bg-white/15 sm:bg-white/10 sm:px-4 sm:backdrop-blur"
              >
                <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </Link>
            ))}
            <LocaleSwitch />
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-full border border-white/30 px-3 py-2 text-sm font-semibold transition hover:bg-white/15 sm:px-4"
              aria-label="Administración / Admin"
            >
              <LayoutDashboard className="size-4" /> <span className="hidden md:inline"><T es="Administración" en="Admin" /></span>
            </Link>
          </div>
        </nav>
        <div className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-10 sm:pb-24">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-gold-300">Darién · Panamá</p>
          <h1 className="font-display text-5xl leading-[0.95] sm:text-7xl lg:text-8xl">
            <T es="Explora lo" en="Explore the" />
            <br />
            <span className="text-gold-400"><T es="extraordinario" en="extraordinary" /></span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/85">
            <T es="Descubre Darién, vive la aventura y conecta con la naturaleza." en="Discover Darién, live the adventure and connect with nature." />
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/mapa"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider text-forest-950 transition hover:bg-gold-300 active:scale-[0.98]"
            >
              <T es="Explorar destinos" en="Explore destinations" /> <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/galeria"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider backdrop-blur transition hover:bg-white/20"
            >
              <Images className="size-4" /> <T es="Ver galería" en="View gallery" />
            </Link>
            <Link
              href="/paquetes"
              className="inline-flex items-center justify-center rounded-full border border-white/40 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider transition hover:bg-white/10"
            >
              <T es="Ver paquetes turísticos" en="View tour packages" />
            </Link>
          </div>
        </div>
      </section>

      {/* DESTINOS */}
      <section id="destinos" className="mx-auto max-w-6xl px-5 py-20 sm:px-10">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600"><T es="Destinos destacados" en="Featured destinations" /></p>
            <ScrollHeadline text="Un lugar por descubrir" en="A place to discover" className="mt-2 font-display text-4xl text-forest-900 sm:text-5xl" />
          </div>
          <Link href="/mapa" className="inline-flex items-center gap-2 font-semibold text-forest-800 hover:underline">
            <T es="Ver todos en el mapa" en="See them all on the map" /> <ArrowRight className="size-4" />
          </Link>
        </div>
        <FeaturedDestinations3D slugs={FEATURED} />
        <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl bg-sand-100 p-6 sm:flex-row sm:items-center">
          <p className="max-w-xl text-earth-800">
            <T
              es={<><strong className="text-forest-900">Paquetes con precios por temporada.</strong> Elige tu destino, mira el itinerario y solicita tu viaje: el equipo confirma la disponibilidad antes de reservar.</>}
              en={<><strong className="text-forest-900">Tours with seasonal prices.</strong> Pick your destination, check the itinerary and request your trip: our team confirms availability before booking.</>}
            />
          </p>
          <Link
            href="/paquetes"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-forest-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-forest-800"
          >
            <Package className="size-4" /> <T es="Ver paquetes" en="View tours" />
          </Link>
        </div>
      </section>

      <TestimonialsSection />

      {/* CONTACTO */}
      <section id="contacto" className="bg-forest-900 px-5 py-20 text-white sm:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl sm:text-5xl"><T es="¿Listo para explorar?" en="Ready to explore?" /></h2>
          <p className="mt-4 text-white/80">
            <T
              es="Solicita tu viaje en línea o escríbenos para armarlo a tu medida con guías locales. Te confirmamos fechas y disponibilidad antes de reservar."
              en="Request your trip online or message us to tailor it with local guides. We confirm dates and availability before booking."
            />
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/reservar"
            className="inline-flex items-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider text-forest-950 transition hover:bg-gold-300"
          >
            <CalendarCheck className="size-4" /> <T es="Solicitar reserva" en="Request a booking" />
          </Link>
          <a
            href="https://www.instagram.com/xplore_darien/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-sm font-extrabold uppercase tracking-wider transition hover:bg-white/10"
          >
            <Instagram className="size-4" /> @xplore_darien
          </a>
          </div>
        </div>
      </section>
    </main>
  );
}
