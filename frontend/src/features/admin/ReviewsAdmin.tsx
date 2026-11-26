"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Star } from "lucide-react";
import { useSession } from "./session";
import { Empty, ErrorText, PageHeader } from "./ui";

interface Review {
  id: string; name: string; email: string | null; country: string | null; rating: number; body: string;
  verified: boolean; status: "draft" | "published" | "archived"; createdAt: string; booking: string | null; package: string | null;
}
const TABS = [["draft", "Por revisar"], ["published", "Publicadas"], ["archived", "Rechazadas"]] as const;

export function ReviewsAdmin() {
  const { api } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("draft");
  const list = useQuery({ queryKey: ["admin-reviews", tab], queryFn: () => api<Review[]>(`/admin/reviews?status=${tab}`) });
  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/reviews/${id}/moderate`, { method: "POST", json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-reviews"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Opiniones" subtitle="Ninguna opinión se publica sin revisión. “Viaje verificado” = el autor dio un código de reserva y un correo que coinciden con un viaje ya realizado." />
      <div className="flex gap-1.5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab === k ? "bg-forest-800 text-gold-300" : "bg-white text-forest-900 ring-1 ring-forest-900/10"}`}>{l}</button>
        ))}
      </div>
      <ErrorText error={list.error || moderate.error} />
      {list.data?.length === 0 && <Empty>No hay opiniones en esta lista. Los viajeros las envían desde /opiniones.</Empty>}
      <ul className="grid gap-4 lg:grid-cols-2">
        {list.data?.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-forest-900">{r.name} {r.country && <span className="text-xs font-normal text-earth-600">({r.country})</span>}</p>
                <p className="text-xs text-earth-600">{r.email} · {new Date(r.createdAt).toLocaleDateString("es-PA")}{r.package ? ` · ${r.package}` : ""}</p>
              </div>
              <span className="flex" aria-label={`${r.rating} de 5`}>
                {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-4 ${i < r.rating ? "fill-gold-400 text-gold-400" : "text-earth-300"}`} />)}
              </span>
            </div>
            {r.verified && <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-forest-800"><BadgeCheck className="size-4" /> Viaje verificado · {r.booking}</p>}
            <p className="mt-3 whitespace-pre-line text-sm text-ink-800">{r.body}</p>
            <div className="mt-4 flex gap-2">
              {r.status !== "published" && <button onClick={() => moderate.mutate({ id: r.id, status: "published" })} className="rounded-full bg-forest-800 px-4 py-2 text-xs font-bold text-white">Publicar</button>}
              {r.status !== "archived" && <button onClick={() => moderate.mutate({ id: r.id, status: "archived" })} className="rounded-full px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">{r.status === "published" ? "Retirar" : "Rechazar"}</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
