"use client";

import { useQuery } from "@tanstack/react-query";
import { destinations as seed, type Destination } from "@/data/destinations";
import { apiGet } from "@/services/api";

/**
 * Puntos del mapa desde la API (`GET /map/points`).
 * Mientras carga, o si la API no responde, se usan los datos semilla del frontend,
 * así el mapa nunca queda vacío.
 */
export function useMapPoints() {
  const query = useQuery({
    queryKey: ["map-points"],
    queryFn: ({ signal }) => apiGet<Destination[]>("/map/points", { signal }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return {
    destinations: query.data && query.data.length > 0 ? query.data : seed,
    source: query.data ? ("api" as const) : ("seed" as const),
    isError: query.isError,
  };
}
