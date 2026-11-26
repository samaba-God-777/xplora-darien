"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { API_URL, apiGet } from "@/services/api";

export type ContentType = "photo" | "video" | "graphic";
export type Orientation = "horizontal" | "vertical" | "square";

export interface MediaItem {
  id: string;
  type: ContentType;
  path: string;
  url: string;
  title: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  orientation: Orientation | null;
  duration: number | null;
  featured: boolean;
  aiGenerated: boolean;
  sourceUrl: string | null;
  posterPath: string | null;
  posterUrl?: string;
  categories: string[];
}

export interface Attribution {
  slug: string;
  name: string;
  attribution: "verified" | "owner_caption" | "owner_filename" | "visible_signage";
  attributionNote: string | null;
}

export interface MediaDetail extends MediaItem {
  destinations: Attribution[];
  packages: { slug: string; name: string }[];
  experiences: { slug: string; name: string }[];
}

export interface GalleryCategory {
  key: string;
  name: string;
  tagline: string;
  description: string;
  cover: { id: string; path: string; url: string; width: number | null; height: number | null } | null;
  photos: number;
  videos: number;
}

export interface MediaPage {
  items: MediaItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface MediaFilter {
  category?: string;
  type?: "photo" | "video";
  orientation?: Orientation;
  destination?: string;
  package?: string;
  featured?: boolean;
}

const qs = (o: Record<string, string | number | boolean | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

/** `lang` fija el idioma (el panel usa "es"); sin él, se usa el idioma del visitante. */
export function useCategories(lang?: "es" | "en") {
  return useQuery({
    queryKey: ["gallery", "categories", lang ?? "auto"],
    queryFn: ({ signal }) => apiGet<GalleryCategory[]>(`/gallery/categories${lang ? `?lang=${lang}` : ""}`, { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useHero() {
  return useQuery({
    queryKey: ["gallery", "hero"],
    queryFn: ({ signal }) => apiGet<{ videos: MediaItem[]; photos: MediaItem[] }>("/gallery/hero", { signal }),
    staleTime: 5 * 60_000,
  });
}

/** Paginación bajo demanda (scroll infinito). */
export function useMediaPages(filter: MediaFilter, limit = 24, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["gallery", "media", filter, limit],
    queryFn: ({ pageParam, signal }) =>
      apiGet<MediaPage>(`/gallery/media?${qs({ ...filter, page: pageParam, limit })}`, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 60_000,
    enabled,
  });
}

export function useMediaDetail(id: string | null) {
  return useQuery({
    queryKey: ["gallery", "item", id],
    queryFn: ({ signal }) => apiGet<MediaDetail>(`/gallery/media/${id}`, { signal }),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

/** Analítica anónima; nunca bloquea la interfaz. */
export function track(id: string, event: "view" | "lightbox_open" | "play" | "complete" | "cta_click", cta?: string) {
  fetch(`${API_URL}/gallery/media/${id}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, cta }),
    keepalive: true,
  }).catch(() => {});
}

/** Las imágenes de pageWeb (/media/…) y de la API pasan por el optimizador de Next. */
export const isOptimizable = (url: string) => (url.startsWith("/media/") || url.startsWith("/media-hd/")) || url.startsWith(process.env.NEXT_PUBLIC_FILES_URL ?? "http://localhost:8080/files");

export const ATTRIBUTION_LABEL: Record<Attribution["attribution"], [string, string]> = {
  verified: ["Lugar verificado por XPLORA DARIÉN", "Place verified by XPLORA DARIÉN"],
  owner_caption: ["Lugar indicado en la publicación original", "Place named in the original post"],
  owner_filename: ["Lugar indicado por el autor de la fotografía", "Place named by the photographer"],
  visible_signage: ["Lugar identificado por un letrero visible", "Place identified by a visible sign"],
};

export interface GalleryDestination {
  slug: string;
  name: string;
  region: string;
  summary: string;
  category: string;
  photos: number;
  videos: number;
  cover: { id: string; path: string; url: string; width: number | null; height: number | null } | null;
}

/** Galería organizada por pueblo o destino turístico. */
export function useGalleryDestinations() {
  return useQuery({
    queryKey: ["gallery", "destinations"],
    queryFn: ({ signal }) => apiGet<GalleryDestination[]>(`/gallery/destinations`, { signal }),
    staleTime: 5 * 60_000,
  });
}
