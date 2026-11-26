"use client";

import { useQuery } from "@tanstack/react-query";
import { API_URL, ApiError, apiGet } from "@/services/api";

export interface PackagePrice {
  id: string;
  type: "per_person" | "adult" | "child" | "group" | "special";
  amount: string;
  minGroupSize: number | null;
  discountPct: string;
  season: { key: string; name: string; start: string; end: string } | null;
  appliesToday: boolean;
}

export interface TourPackage {
  id: string;
  code: string;
  slug: string;
  name: string;
  type: string;
  shortDescription: string;
  description: string;
  days: number;
  nights: number;
  difficulty: string;
  minAge: number | null;
  minParticipants: number;
  maxCapacity: number | null;
  currency: string;
  distanceKm: number | null;
  accessNote: string | null;
  cancellationPolicy: string | null;
  feesNote: string | null;
  packingList: string | null;
  destinations: { slug: string; name: string }[];
  media: string[];
  inclusions: { kind: string; description: string }[];
  exclusions: string[];
  prices: PackagePrice[];
  /** Próximas fechas abiertas con cupo (máx. 12). */
  availableDates: { date: string; seatsLeft: number }[];
  departures: { id: string; departureDate: string; returnDate: string; seatsAvailable: number; meetingPoint: string | null }[];
  itinerary: { day: number; title: string; description: string | null; lodging: string | null; meals: string | null; transport: string | null }[];
}

export function usePackages() {
  return useQuery({ queryKey: ["packages"], queryFn: ({ signal }) => apiGet<TourPackage[]>("/packages", { signal }) });
}

export function usePackage(slug: string | null) {
  return useQuery({
    queryKey: ["package", slug],
    queryFn: ({ signal }) => apiGet<TourPackage>(`/packages/${slug}`, { signal }),
    enabled: !!slug,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "http_error", data?.error?.message ?? res.statusText);
  return data as T;
}

/** Precio "desde" para hoy: si hay precio de la temporada vigente, ese; si no, el general. */
export const priceFrom = (p: TourPackage) => {
  const today = p.prices.filter((x) => x.appliesToday && x.type !== "child");
  const seasonal = today.filter((x) => x.season);
  const pool = seasonal.length ? seasonal : today;
  const amounts = pool.map((x) => Number(x.amount));
  return amounts.length ? Math.min(...amounts) : null;
};

/** "1 día" · "2 días · 1 noche" (o en inglés). */
export const durationLabel = (p: { days: number; nights: number }, l: "es" | "en") =>
  l === "en"
    ? p.days === 1 ? "1 day" : `${p.days} days · ${p.nights} ${p.nights === 1 ? "night" : "nights"}`
    : p.days === 1 ? "1 día" : `${p.days} días · ${p.nights} ${p.nights === 1 ? "noche" : "noches"}`;

/** "sáb 28 nov" / "Sat, Nov 28" a partir de YYYY-MM-DD (sin desfase horario). */
export const fmtDate = (iso: string, l: "es" | "en", opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(l === "en" ? "en-US" : "es-PA", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};

const SEASON_EN: Record<string, string> = { alta: "High season (dry)", baja: "Low season (rainy)" };
export const seasonName = (s: { key: string; name: string }, l: "es" | "en") => (l === "en" ? SEASON_EN[s.key] ?? s.name : s.name);
