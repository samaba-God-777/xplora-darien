"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CalendarCheck, MessageSquareQuote, Settings, Clapperboard, Images, LayoutDashboard, Loader2, LogOut, Map, Package, Users, Wallet } from "lucide-react";
import { BRAND_LOGO } from "@/lib/media";
import { SessionProvider, useSession } from "./session";

const NAV = [
  { href: "/admin", label: "Panel de control", icon: LayoutDashboard, perm: "bookings.read", exact: true },
  { href: "/admin/reservas", label: "Reservas", icon: CalendarCheck, perm: "bookings.read" },
  { href: "/admin/finanzas", label: "Finanzas y ganancias", icon: Wallet, perm: "finance.read" },
  { href: "/admin/paquetes", label: "Paquetes y precios", icon: Package, perm: "packages.pricing" },
  { href: "/admin/personal", label: "Personal", icon: Users, perm: "staff.manage" },
  { href: "/admin/inventario", label: "Inventario", icon: Boxes, perm: "inventory.manage" },
  { href: "/admin/opiniones", label: "Opiniones", icon: MessageSquareQuote, perm: "reviews.moderate" },
  { href: "/admin/medios", label: "Media Management Studio", icon: Images, perm: "media.write" },
  { href: "/admin/estudio-ia", label: "XPLORA AI Video Studio", icon: Clapperboard, perm: "ai.generate" },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings, perm: "settings.manage" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Guard>{children}</Guard>
    </SessionProvider>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const { session, logout, can } = useSession();
  const path = usePathname();
  if (!session) return <Login />;
  return (
    <div className="min-h-svh bg-sand-50 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 z-30 flex items-center gap-3 border-b border-forest-900/10 bg-forest-950 px-4 py-3 text-white lg:h-svh lg:flex-col lg:items-stretch lg:border-0 lg:p-5">
        <Link href="/admin" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_LOGO} alt="" className="size-9 rounded-full" />
          <span className="font-display text-base leading-tight">XPLORA DARIÉN<span className="block text-[11px] font-sans text-white/50">Panel</span></span>
        </Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto lg:mt-8 lg:flex-col lg:overflow-visible" aria-label="Panel">
          {NAV.filter((n) => can(n.perm)).map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? path === href : path.startsWith(href);
            return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active ? "bg-gold-400 text-forest-950" : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
            </Link>
            );
          })}
          <Link href="/galeria" className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:text-white lg:mt-auto">
            <Map className="size-4" /> <span className="hidden sm:inline">Ver sitio</span>
          </Link>
        </nav>
        <div className="flex items-center gap-2 lg:border-t lg:border-white/10 lg:pt-4">
          <span className="hidden min-w-0 flex-1 truncate text-xs text-white/60 lg:block">{session.user.email}</span>
          <button onClick={logout} className="grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar sesión">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8">{children}</main>
    </div>
  );
}

function Login() {
  const { login } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-svh place-items-center bg-forest-950 p-5">
      <form
        className="w-full max-w-sm rounded-3xl bg-sand-50 p-7"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            await login(String(f.get("email")), String(f.get("password")));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND_LOGO} alt="" className="size-14 rounded-full" />
        <h1 className="mt-4 font-display text-3xl text-forest-900">Panel administrativo</h1>
        <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-forest-800" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="mt-1 w-full rounded-xl border border-forest-900/15 bg-white px-3.5 py-2.5 text-base outline-none focus:border-forest-700" />
        <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-forest-800" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-xl border border-forest-900/15 bg-white px-3.5 py-2.5 text-base outline-none focus:border-forest-700" />
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
        <button disabled={busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest-800 px-6 py-3 text-sm font-bold text-white hover:bg-forest-700 disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" />} Entrar
        </button>
      </form>
    </main>
  );
}
