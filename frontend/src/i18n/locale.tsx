"use client";

/**
 * Idioma del sitio público (es/en), compartido por todas las páginas.
 * - Se guarda en localStorage y actualiza <html lang>.
 * - El servidor siempre pinta español; el navegador cambia a inglés tras hidratar
 *   (useSyncExternalStore evita desajustes de hidratación).
 * - `apiGet` añade `lang` a cada petición y Providers recarga los datos al cambiar.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { Languages } from "lucide-react";
import type { Locale } from "./dictionary";

const KEY = "xd-locale";
const listeners = new Set<() => void>();
let current: Locale | null = null;

export function getLocale(): Locale {
  if (typeof window === "undefined") return "es";
  if (current) return current;
  try {
    const saved = localStorage.getItem(KEY);
    current = saved === "en" || saved === "es" ? saved : navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
  } catch {
    current = "es";
  }
  document.documentElement.lang = current;
  return current;
}

export function setLocale(l: Locale) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* modo privado: solo en memoria */
  }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

export function subscribeLocale(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "es");
}

/** `t("Hola", "Hello")` según el idioma actual. */
export function useT() {
  const locale = useLocale();
  return { locale, t: (es: string, en: string) => (locale === "en" ? en : es) };
}

/** Texto bilingüe utilizable también desde componentes de servidor. */
export function T({ es, en }: { es: ReactNode; en: ReactNode }) {
  return <>{useLocale() === "en" ? en : es}</>;
}

/** Botón ES/EN. */
export function LocaleSwitch({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const next = locale === "es" ? "en" : "es";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition hover:bg-white/10 ${className}`}
      aria-label={locale === "es" ? "Cambiar idioma a inglés" : "Switch language to Spanish"}
    >
      <Languages className="size-4" /> {next.toUpperCase()}
    </button>
  );
}
