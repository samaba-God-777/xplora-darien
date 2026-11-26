/** Cliente de la API Rust (XPLORA DARIÉN). */
import { getLocale } from "@/i18n/locale";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Añade el idioma actual (`lang`) salvo que la ruta ya lo indique. */
function withLang(path: string) {
  if (/[?&]lang=/.test(path)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}lang=${getLocale()}`;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${withLang(path)}`, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.code ?? "http_error", body?.error?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
