"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { API_URL, ApiError } from "@/services/api";

/**
 * Sesión del panel: JWT emitido por la API Rust, guardado en sessionStorage (se borra al cerrar la pestaña).
 * Las credenciales de Higgsfield NUNCA llegan al navegador: el panel solo habla con la API propia.
 */
export interface SessionUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}
interface Session {
  token: string;
  user: SessionUser;
  expiresAt: number;
}

const KEY = "xd.session";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Session | null = null;

function read(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const s = raw ? (JSON.parse(raw) as Session) : null;
      cached = s && s.expiresAt > Date.now() ? s : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}
function write(s: Session | null) {
  if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
  else sessionStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

const Ctx = createContext<{
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (perm: string) => boolean;
  api: <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;
} | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );

  const logout = useCallback(() => write(null), []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", res.status === 401 ? "Correo o contraseña incorrectos" : data?.error?.message ?? "Error");
    write({ token: data.access_token, user: data.user, expiresAt: Date.now() + data.expires_in * 1000 });
  }, []);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
      const s = read();
      const headers = new Headers(init.headers);
      if (s) headers.set("Authorization", `Bearer ${s.token}`);
      let body = init.body;
      if (init.json !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(init.json);
      }
      const res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
      if (res.status === 401) logout();
      if (res.status === 204) return undefined as T;
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const details = data?.error?.details?.params as string[] | undefined;
        throw new ApiError(res.status, data?.error?.code ?? "error", [data?.error?.message, ...(details ?? [])].filter(Boolean).join(" · ") || res.statusText);
      }
      return data as T;
    },
    [logout],
  );

  const can = useCallback(
    (perm: string) => !!session && (session.user.roles.includes("superadmin") || session.user.permissions.includes(perm)),
    [session],
  );

  const value = useMemo(() => ({ session, login, logout, can, api }), [session, login, logout, can, api]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession fuera de SessionProvider");
  return v;
}
