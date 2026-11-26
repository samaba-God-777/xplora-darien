"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Eye, FolderPlus, Loader2, Search, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import { API_URL } from "@/services/api";
import { isOptimizable, useCategories } from "@/features/gallery/api";
import { usePackages } from "@/features/packages/api";
import { useSession } from "./session";
import { fieldInline } from "./ui";

interface AdminMedia {
  id: string;
  type: "photo" | "video" | "graphic";
  kind: string;
  path: string;
  url: string;
  posterUrl?: string;
  title: string | null;
  description: string | null;
  status: "draft" | "published" | "archived";
  source: string;
  featured: boolean;
  aiGenerated: boolean;
  width: number | null;
  height: number | null;
  categories: string[];
  tags: string[];
  destinations: { slug: string; name: string; attribution: string }[];
  packages: { slug: string; name: string }[];
  stats: { views: number; plays: number; ctaClicks: number };
}
interface Page {
  items: AdminMedia[];
  total: number;
  page: number;
  hasMore: boolean;
}
interface Stats {
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  events30d: Record<string, number>;
  pendingJobs: number;
  failedJobs: number;
  unverifiedLinks: number;
}

const ATTR: Record<string, string> = {
  verified: "Verificado",
  owner_caption: "Pie de foto del autor",
  owner_filename: "Nombre de archivo del autor",
  visible_signage: "Letrero visible",
  editorial_guess: "Estimación (oculto al público)",
};

export function MediaStudio() {
  const { api } = useSession();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: "", type: "", status: "", source: "", category: "" });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminMedia | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const query = useMemo(
    () => Object.entries({ ...filters, page: String(page), limit: "40" }).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&"),
    [filters, page],
  );
  const list = useQuery({ queryKey: ["admin-media", query], queryFn: () => api<Page>(`/admin/media?${query}`), placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: ["admin-media-stats"], queryFn: () => api<Stats>("/admin/media/stats") });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-media"] });
    qc.invalidateQueries({ queryKey: ["admin-media-stats"] });
    qc.invalidateQueries({ queryKey: ["gallery"] });
  };

  const s = stats.data;
  const cards = s
    ? [
        { label: "Fotos publicadas", value: s.byStatus["photo:published"] ?? 0 },
        { label: "Videos publicados", value: s.byStatus["video:published"] ?? 0 },
        { label: "Borradores", value: Object.entries(s.byStatus).filter(([k]) => k.endsWith(":draft")).reduce((a, [, n]) => a + n, 0) },
        { label: "Vistas (30 d)", value: (s.events30d.view ?? 0) + (s.events30d.lightbox_open ?? 0) },
        { label: "Reproducciones (30 d)", value: s.events30d.play ?? 0 },
        { label: "Clics en CTA (30 d)", value: s.events30d.cta_click ?? 0 },
        { label: "Lugares sin verificar", value: s.unverifiedLinks },
        { label: "Procesos pendientes", value: s.pendingJobs },
      ]
    : [];

  const select = "rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">Panel</p>
          <h1 className="font-display text-4xl text-forest-900">Media Management Studio</h1>
        </div>
        <Uploader onDone={refresh} />
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {cards.map((c) => (
          <li key={c.label} className="rounded-2xl bg-white p-4 ring-1 ring-forest-900/5">
            <p className="text-2xl font-bold tabular-nums text-forest-900">{c.value}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-earth-600">{c.label}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-forest-900/15 bg-white px-3">
          <Search className="size-4 text-earth-600" />
          <input
            value={filters.q}
            onChange={(e) => (setPage(1), setFilters({ ...filters, q: e.target.value }))}
            placeholder="Buscar título, descripción o archivo"
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
        </label>
        <select aria-label="Tipo" className={select} value={filters.type} onChange={(e) => (setPage(1), setFilters({ ...filters, type: e.target.value }))}>
          <option value="">Todo tipo</option><option value="photo">Fotos</option><option value="video">Videos</option><option value="graphic">Gráficas</option>
        </select>
        <select aria-label="Estado" className={select} value={filters.status} onChange={(e) => (setPage(1), setFilters({ ...filters, status: e.target.value }))}>
          <option value="">Todo estado</option><option value="published">Publicado</option><option value="draft">Borrador</option>
        </select>
        <select aria-label="Origen" className={select} value={filters.source} onChange={(e) => (setPage(1), setFilters({ ...filters, source: e.target.value }))}>
          <option value="">Todo origen</option><option value="pageWeb">pageWeb</option><option value="upload">Subidas</option><option value="higgsfield">Higgsfield IA</option>
        </select>
        <CategorySelect value={filters.category} onChange={(v) => (setPage(1), setFilters({ ...filters, category: v }))} />
        <button
          onClick={() => (setSelectMode((m) => !m), setSelected([]))}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${selectMode ? "bg-forest-800 text-white" : "border border-forest-900/15 bg-white text-forest-900"}`}
        >
          <CheckSquare className="size-4" /> Seleccionar
        </button>
      </div>

      {selectMode && <CollectionBar selected={selected} onDone={() => (setSelectMode(false), setSelected([]))} />}

      {list.isError && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{(list.error as Error).message}</p>}
      <p className="text-sm text-earth-700">{list.data ? `${list.data.total} recursos` : "Cargando…"}</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {list.data?.items.map((m) => {
          const thumb = m.type === "video" ? m.posterUrl : m.url;
          const isSel = selected.includes(m.id);
          return (
            <li key={m.id}>
              <button
                onClick={() => (selectMode ? setSelected((s) => (isSel ? s.filter((x) => x !== m.id) : [...s, m.id])) : setEditing(m))}
                className={`group block w-full overflow-hidden rounded-2xl bg-white text-left ring-1 transition hover:shadow-md ${isSel ? "ring-4 ring-gold-400" : "ring-forest-900/5"}`}
              >
                <span className="relative block aspect-square bg-forest-900/10">
                  {thumb && <Image src={thumb} alt="" fill sizes="(min-width:1536px) 16vw, (min-width:1024px) 25vw, 50vw" quality={65} unoptimized={!isOptimizable(thumb)} className="object-cover" />}
                  <span className="absolute left-2 top-2 flex gap-1">
                    <Badge tone={m.status === "published" ? "green" : "gray"}>{m.status === "published" ? "Publicado" : m.status === "draft" ? "Borrador" : "Archivado"}</Badge>
                    {m.type === "video" && <Badge tone="dark">Video</Badge>}
                    {m.aiGenerated && <Badge tone="gold"><Sparkles className="size-3" /> IA</Badge>}
                  </span>
                  {m.featured && <Star className="absolute right-2 top-2 size-5 fill-gold-400 text-gold-400" />}
                </span>
                <span className="block p-3">
                  <span className="block truncate text-sm font-semibold text-forest-900">{m.title ?? "Sin título"}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-earth-600">
                    <Eye className="size-3" /> {m.stats.views} · {m.categories.length} cat. · {m.destinations.length} dest.
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-center gap-3">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-forest-900/15 px-4 py-2 text-sm disabled:opacity-40">Anterior</button>
        <span className="text-sm tabular-nums text-earth-700">Página {page}</span>
        <button disabled={!list.data?.hasMore} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-forest-900/15 px-4 py-2 text-sm disabled:opacity-40">Siguiente</button>
      </div>

      {editing && <EditDrawer key={editing.id} item={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

function Badge({ tone, children }: { tone: "green" | "gray" | "gold" | "dark"; children: React.ReactNode }) {
  const c = { green: "bg-forest-800 text-white", gray: "bg-white/90 text-earth-800", gold: "bg-gold-400 text-forest-950", dark: "bg-black/70 text-white" }[tone];
  return <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c}`}>{children}</span>;
}

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useCategories("es");
  return (
    <select aria-label="Categoría" className="rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Toda categoría</option>
      {data?.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
    </select>
  );
}

/** Subida con barra de progreso (XHR) a POST /admin/media/upload. */
function Uploader({ onDone }: { onDone: () => void }) {
  const { session } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; pct: number; error?: string }[]>([]);

  const upload = (file: File) =>
    new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      const update = (patch: Partial<{ pct: number; error: string }>) =>
        setProgress((p) => p.map((x) => (x.name === file.name ? { ...x, ...patch } : x)));
      xhr.upload.onprogress = (e) => e.lengthComputable && update({ pct: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        if (xhr.status >= 300) {
          let msg = `Error ${xhr.status}`;
          try {
            msg = JSON.parse(xhr.responseText)?.error?.message ?? msg;
          } catch {}
          update({ error: msg });
        }
        else update({ pct: 100 });
        resolve();
      };
      xhr.onerror = () => (update({ error: "Error de red" }), resolve());
      xhr.open("POST", `${API_URL}/admin/media/upload`);
      xhr.setRequestHeader("Authorization", `Bearer ${session?.token}`);
      const fd = new FormData();
      fd.append("file", file);
      xhr.send(fd);
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime"
        className="sr-only"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          setProgress(files.map((f) => ({ name: f.name, pct: 0 })));
          for (const f of files) await upload(f);
          onDone();
          e.target.value = "";
        }}
      />
      <button onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-forest-700">
        <Upload className="size-4" /> Subir fotos o videos
      </button>
      {progress.map((p) => (
        <p key={p.name} className={`w-72 truncate text-xs ${p.error ? "text-red-700" : "text-earth-700"}`}>
          {p.name}: {p.error ?? `${p.pct}%`}
        </p>
      ))}
    </div>
  );
}

function CollectionBar({ selected, onDone }: { selected: string[]; onDone: () => void }) {
  const { api } = useSession();
  const [title, setTitle] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api("/admin/media/collections", {
        method: "PUT",
        json: { slug: title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), title, media_ids: selected },
      }),
    onSuccess: onDone,
  });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-forest-900 p-3 text-white">
      <span className="text-sm">{selected.length} seleccionados</span>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre de la colección" className="min-w-48 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/50" />
      <button
        disabled={!title.trim() || selected.length === 0 || save.isPending}
        onClick={() => save.mutate()}
        className="inline-flex items-center gap-1.5 rounded-xl bg-gold-400 px-4 py-2 text-sm font-bold text-forest-950 disabled:opacity-50"
      >
        <FolderPlus className="size-4" /> Crear colección
      </button>
      {save.error && <span className="text-xs text-red-200">{(save.error as Error).message}</span>}
    </div>
  );
}

function EditDrawer({ item, onClose, onSaved }: { item: AdminMedia; onClose: () => void; onSaved: () => void }) {
  const { api } = useSession();
  const cats = useCategories("es");
  const pkgs = usePackages();
  const dests = useQuery({ queryKey: ["destinations-es"], queryFn: () => api<{ slug: string; name: string }[]>("/destinations?lang=es") });
  const [form, setForm] = useState({
    title: item.title ?? "",
    description: item.description ?? "",
    status: item.status,
    is_featured: item.featured,
    tags: item.tags.join(", "),
    categories: item.categories,
    destinations: item.destinations.map((d) => ({ slug: d.slug, attribution: d.attribution })),
    packages: item.packages.map((p) => p.slug),
  });
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);

  const save = useMutation({
    mutationFn: () => api(`/admin/media/${item.id}`, { method: "PATCH", json: { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) } }),
    onSuccess: () => (onSaved(), onClose()),
  });
  const del = useMutation({
    mutationFn: () => api(`/admin/media/${item.id}?confirm=${item.id}`, { method: "DELETE" }),
    onSuccess: () => (onSaved(), onClose()),
  });
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const label = "mb-1 block text-xs font-bold uppercase tracking-wider text-forest-800";
  const field = "w-full rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm outline-none focus:border-forest-700";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={`Editar ${item.title ?? "recurso"}`} onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-sand-50 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl text-forest-900">Editar recurso</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-forest-900/5" aria-label="Cerrar"><X className="size-5" /></button>
        </div>
        <div className="relative mt-4 aspect-video overflow-hidden rounded-2xl bg-black">
          {item.type === "video" ? (
            <video src={item.url} poster={item.posterUrl} controls preload="none" className="h-full w-full object-contain" />
          ) : (
            <Image src={item.url} alt="" fill sizes="576px" unoptimized={!isOptimizable(item.url)} className="object-contain" />
          )}
        </div>
        <p className="mt-2 break-all text-[11px] text-earth-600">{item.path} · {item.source} {item.width ? `· ${item.width}×${item.height}` : ""}</p>

        <div className="mt-6 space-y-4">
          <div><label className={label} htmlFor="t">Título</label><input id="t" className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className={label} htmlFor="d">Descripción</label><textarea id="d" rows={3} className={field} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className={label} htmlFor="s">Estado</label>
              <select id="s" className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AdminMedia["status"] })}>
                <option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option>
              </select>
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm font-semibold text-forest-900">
              <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="size-4 accent-forest-800" /> Destacado
            </label>
          </div>
          <div><label className={label} htmlFor="tags">Etiquetas (separadas por coma)</label><input id="tags" className={field} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
          <fieldset>
            <legend className={label}>Categorías</legend>
            <div className="flex flex-wrap gap-1.5">
              {cats.data?.map((c) => (
                <button type="button" key={c.key} onClick={() => setForm({ ...form, categories: toggle(form.categories, c.key) })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${form.categories.includes(c.key) ? "bg-forest-800 text-gold-300" : "bg-forest-900/5 text-forest-900"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className={label}>Destinos y procedencia</legend>
            {form.destinations.map((d, i) => (
              <div key={d.slug} className="mb-2 flex gap-2">
                <span className="flex-1 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-forest-900/10">{dests.data?.find((x) => x.slug === d.slug)?.name ?? d.slug}</span>
                <select aria-label="Procedencia" className={`${fieldInline} w-56`} value={d.attribution}
                  onChange={(e) => setForm({ ...form, destinations: form.destinations.map((x, j) => (j === i ? { ...x, attribution: e.target.value } : x)) })}>
                  {Object.entries(ATTR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button type="button" onClick={() => setForm({ ...form, destinations: form.destinations.filter((_, j) => j !== i) })} className="rounded-xl px-2 text-red-700 hover:bg-red-50" aria-label="Quitar destino"><X className="size-4" /></button>
              </div>
            ))}
            <select aria-label="Añadir destino" className={field} value="" onChange={(e) => e.target.value && setForm({ ...form, destinations: [...form.destinations, { slug: e.target.value, attribution: "verified" }] })}>
              <option value="">+ Asociar destino…</option>
              {dests.data?.filter((d) => !form.destinations.some((x) => x.slug === d.slug)).map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-earth-600">Las asociaciones “Estimación” no se muestran al público hasta verificarse.</p>
          </fieldset>
          <fieldset>
            <legend className={label}>Paquetes turísticos</legend>
            {pkgs.data && pkgs.data.length === 0 && <p className="text-xs text-earth-600">No hay paquetes publicados todavía.</p>}
            <div className="flex flex-wrap gap-1.5">
              {pkgs.data?.map((p) => (
                <button type="button" key={p.slug} onClick={() => setForm({ ...form, packages: toggle(form.packages, p.slug) })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${form.packages.includes(p.slug) ? "bg-forest-800 text-gold-300" : "bg-forest-900/5 text-forest-900"}`}>
                  {p.name}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-earth-600">30 días: {item.stats.views} vistas · {item.stats.plays} reproducciones · {item.stats.ctaClicks} clics en botones</p>
        </div>

        {save.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{(save.error as Error).message}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Guardar
          </button>
          <button onClick={() => setConfirming(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">
            <Trash2 className="size-4" /> Eliminar
          </button>
        </div>
        {confirming && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4" role="alertdialog" aria-label="Confirmar eliminación">
            <p className="text-sm text-red-800">
              Se ocultará de la galería y del panel. {item.source === "pageWeb" ? "El archivo original de pageWeb no se borra." : "El archivo se conserva en el almacenamiento."} Escribe <strong>ELIMINAR</strong> para confirmar.
            </p>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm" aria-label="Escribe ELIMINAR" />
            <div className="mt-3 flex gap-2">
              <button disabled={confirmText !== "ELIMINAR" || del.isPending} onClick={() => del.mutate()} className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Eliminar</button>
              <button onClick={() => (setConfirming(false), setConfirmText(""))} className="rounded-full px-4 py-2 text-sm">Cancelar</button>
            </div>
            {del.error && <p className="mt-2 text-xs text-red-700">{(del.error as Error).message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
