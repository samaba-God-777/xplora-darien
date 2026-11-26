"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Check, ExternalLink, Film, ImageIcon, Loader2, Plus, Save, Trash2, Wand2, X } from "lucide-react";
import { isOptimizable, useCategories } from "@/features/gallery/api";
import { useSession } from "./session";

/* ----------------------------------------------------------------- Tipos */
interface ParamSpec {
  type?: string;
  enum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
  description?: string;
}
interface Model {
  endpoint: string;
  family: string;
  title: string;
  mode: "text-to-video" | "image-to-video";
  params: Record<string, ParamSpec>;
  required: string[];
  imageParam: string | null;
  aspectRatios: string[] | null;
  docUrl: string;
  verifiedAt: string;
}
interface Template { key: string; name: string; description: string | null; prompt: string; negativePrompt: string | null; aspectRatio: string; duration: number; category: string | null }
interface Preset { key: string; name: string; aspectRatio: string; channels: string[] }
interface Status { configured: boolean; workerEnabled: boolean; monthlyBudgetUsd: string; spentThisMonthUsd: string; maxConcurrent: string; generations: Record<string, number> }
interface Generation {
  id: string;
  status: "queued" | "submitted" | "processing" | "succeeded" | "failed" | "nsfw" | "cancelled";
  reviewStatus: "pending" | "approved" | "discarded";
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  requestId: string | null;
  correlationId: string | null;
  attempts: number;
  error: string | null;
  estimatedUsd: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  category: string | null;
  requestedBy: string | null;
  reference: { id: string; path: string; url: string; title: string } | null;
  result: { id: string; url: string; posterUrl?: string; width: number | null; height: number | null; duration: number | null; status: string } | null;
}
interface MediaLite { id: string; url: string; title: string | null; width: number | null; height: number | null }

// Campos que el estudio gestiona aparte del formulario dinámico.
const MANAGED = new Set(["prompt", "aspect_ratio", "multi_shots", "multi_prompt", "elements", "audio_url", "audio_urls", "video_urls", "image_urls", "end_image_url", "last_image_url"]);
const STATUS_LABEL: Record<Generation["status"], string> = {
  queued: "En cola", submitted: "Enviada", processing: "Procesando", succeeded: "Completada", failed: "Fallida", nsfw: "Rechazada (moderación)", cancelled: "Cancelada",
};
const ACTIVE = new Set(["queued", "submitted", "processing"]);

export function AiStudio() {
  const { api, can } = useSession();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["ai-status"], queryFn: () => api<Status>("/admin/ai/status"), refetchInterval: 15_000 });
  const models = useQuery({ queryKey: ["ai-models"], queryFn: () => api<Model[]>("/admin/ai/models") });
  const templates = useQuery({ queryKey: ["ai-templates"], queryFn: () => api<Template[]>("/admin/ai/templates") });
  const presets = useQuery({ queryKey: ["ai-presets"], queryFn: () => api<Preset[]>("/admin/ai/presets") });
  const cats = useCategories("es");

  // Flujo de producción (pasos 1–6)
  const [category, setCategory] = useState("");
  const [source, setSource] = useState<"prompt" | "photo">("prompt");
  const [template, setTemplate] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [reference, setReference] = useState<MediaLite | null>(null);
  const [picker, setPicker] = useState(false);
  const [modelId, setModelId] = useState("");
  const [aspect, setAspect] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [shots, setShots] = useState<{ prompt: string; duration: number }[]>([]);
  const [estimate, setEstimate] = useState<{ estimateUsd: string; withinBudget: boolean; spentThisMonthUsd: string; monthlyBudgetUsd: string } | null>(null);

  const mode = source === "photo" ? "image-to-video" : "text-to-video";
  const available = useMemo(() => (models.data ?? []).filter((m) => m.mode === mode), [models.data, mode]);
  const model = available.find((m) => m.endpoint === modelId) ?? null;
  const supportsShots = !!model?.params.multi_prompt;

  const pickModel = (id: string) => {
    setModelId(id);
    setEstimate(null);
    const m = available.find((x) => x.endpoint === id);
    // Valores por defecto documentados del modelo.
    const defaults: Record<string, unknown> = {};
    if (m) for (const [k, spec] of Object.entries(m.params)) if (!MANAGED.has(k) && k !== m.imageParam && spec.default !== undefined) defaults[k] = spec.default;
    setParams(defaults);
    setAspect(m?.aspectRatios?.includes(aspect ?? "") ? aspect : (m?.aspectRatios?.[0] ?? null));
    setShots([]);
  };

  const body = () => {
    const p: Record<string, unknown> = { ...params };
    if (model?.aspectRatios && aspect) p.aspect_ratio = aspect;
    if (supportsShots && shots.length > 0) {
      p.multi_shots = true;
      p.multi_prompt = shots;
    }
    return {
      model: modelId,
      prompt,
      params: p,
      reference_media_id: source === "photo" ? reference?.id : undefined,
      template: template ?? undefined,
      category: category || undefined,
    };
  };

  const estimateM = useMutation({
    mutationFn: () => api<{ estimateUsd: string; withinBudget: boolean; spentThisMonthUsd: string; monthlyBudgetUsd: string }>("/admin/ai/generations", { method: "POST", json: { ...body(), dry_run: true } }),
    onSuccess: setEstimate,
  });
  const submitM = useMutation({
    mutationFn: () => api<{ id: string }>("/admin/ai/generations", { method: "POST", json: body() }),
    onSuccess: () => {
      setEstimate(null);
      qc.invalidateQueries({ queryKey: ["ai-generations"] });
      qc.invalidateQueries({ queryKey: ["ai-status"] });
    },
  });

  const ready = !!modelId && (source === "prompt" ? prompt.trim().length > 0 : !!reference) && (!model?.required.includes("prompt") || prompt.trim().length > 0);
  const configured = status.data?.configured ?? false;
  const step = "flex items-center gap-2 font-display text-xl text-forest-900";
  const num = "grid size-7 shrink-0 place-items-center rounded-full bg-forest-800 font-sans text-xs font-bold text-gold-300";
  const field = "w-full rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm outline-none focus:border-forest-700";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">Higgsfield</p>
          <h1 className="font-display text-4xl text-forest-900">XPLORA AI Video Studio</h1>
        </div>
        <a href="https://docs.higgsfield.ai/docs/llms.txt" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-800 hover:underline">
          <BookOpen className="size-4" /> Documentación de Higgsfield
        </a>
      </header>

      {status.data && !configured && (
        <div className="flex gap-3 rounded-2xl border border-gold-400 bg-gold-100 p-4 text-sm text-earth-800" role="status">
          <AlertTriangle className="size-5 shrink-0 text-earth-700" />
          <p>
            <strong>Higgsfield no está configurado.</strong> Añade <code>HIGGSFIELD_API_KEY_ID</code> y <code>HIGGSFIELD_API_KEY_SECRET</code> (de console.higgsfield.ai) al entorno del backend y reinícialo.
            Las claves solo viven en el servidor Rust. Puedes preparar prompts y plantillas mientras tanto, pero no se puede estimar ni generar.
          </p>
        </div>
      )}
      {status.data && <BudgetCard status={status.data} canEdit={can("settings.manage")} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ------------------------------------------------ Flujo de producción */}
        <section className="space-y-6 rounded-3xl bg-white p-5 ring-1 ring-forest-900/5 sm:p-7" aria-label="Nueva generación">
          <div>
            <h2 className={step}><span className={num}>1</span> Categoría</h2>
            <select aria-label="Categoría" className={`${field} mt-3`} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Sin categoría</option>
              {cats.data?.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <h2 className={step}><span className={num}>2</span> Fotografía o prompt</h2>
            <div role="tablist" className="mt-3 inline-flex rounded-full bg-forest-900/5 p-1">
              {(["prompt", "photo"] as const).map((s) => (
                <button key={s} role="tab" aria-selected={source === s} onClick={() => (setSource(s), setModelId(""), setEstimate(null))}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold ${source === s ? "bg-forest-800 text-white" : "text-forest-900"}`}>
                  {s === "prompt" ? <><Wand2 className="size-4" /> Texto a video</> : <><ImageIcon className="size-4" /> Animar una fotografía</>}
                </button>
              ))}
            </div>
            {source === "photo" && (
              <div className="mt-3 flex items-center gap-3">
                {reference ? (
                  <>
                    <span className="relative size-20 overflow-hidden rounded-xl bg-forest-900/10">
                      <Image src={reference.url} alt="" fill sizes="80px" unoptimized={!isOptimizable(reference.url)} className="object-cover" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm"><strong className="block truncate">{reference.title}</strong>{reference.width}×{reference.height}</span>
                  </>
                ) : (
                  <span className="text-sm text-earth-700">Elige una foto de la biblioteca (originales de pageWeb o subidas).</span>
                )}
                <button onClick={() => setPicker(true)} className="rounded-full border border-forest-900/20 px-4 py-2 text-sm font-semibold text-forest-900">{reference ? "Cambiar" : "Elegir foto"}</button>
              </div>
            )}
            <TemplateLibrary
              templates={templates.data ?? []}
              active={template}
              onPick={(t) => {
                setTemplate(t.key);
                setPrompt(t.prompt);
                if (t.category) setCategory(t.category);
                if (t.aspectRatio && model?.aspectRatios?.includes(t.aspectRatio)) setAspect(t.aspectRatio);
              }}
              current={{ prompt, category }}
              onSaved={() => qc.invalidateQueries({ queryKey: ["ai-templates"] })}
            />
            <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-forest-800" htmlFor="prompt">Prompt (editable antes de enviar)</label>
            <textarea id="prompt" rows={6} className={`${field} mt-1`} value={prompt} maxLength={model?.params.prompt?.maxLength ?? 2500}
              onChange={(e) => (setPrompt(e.target.value), setEstimate(null))} />
            <p className="mt-1 text-right text-[11px] text-earth-600">{prompt.length}{model?.params.prompt?.maxLength ? ` / ${model.params.prompt.maxLength}` : ""}</p>
          </div>

          <div>
            <h2 className={step}><span className={num}>3</span> Modelo Higgsfield</h2>
            <select aria-label="Modelo" className={`${field} mt-3`} value={modelId} onChange={(e) => pickModel(e.target.value)}>
              <option value="">Selecciona un modelo {mode === "image-to-video" ? "imagen → video" : "texto → video"}…</option>
              {available.map((m) => <option key={m.endpoint} value={m.endpoint}>{m.title}</option>)}
            </select>
            {model && (
              <p className="mt-2 text-xs text-earth-700">
                <code className="rounded bg-forest-900/5 px-1.5 py-0.5">{model.endpoint}</code> · parámetros verificados en la documentación el {model.verifiedAt} ·{" "}
                <a href={model.docUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">ficha del modelo <ExternalLink className="size-3" /></a>
              </p>
            )}
          </div>

          {model && (
            <>
              <div>
                <h2 className={step}><span className={num}>4</span> Formato</h2>
                {model.aspectRatios ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {presets.data?.map((p) => {
                      const ok = model.aspectRatios!.includes(p.aspectRatio);
                      return (
                        <button key={p.key} disabled={!ok} onClick={() => (setAspect(p.aspectRatio), setEstimate(null))} aria-pressed={aspect === p.aspectRatio}
                          className={`rounded-2xl p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${aspect === p.aspectRatio ? "bg-forest-800 text-white ring-forest-800" : "ring-forest-900/15 hover:bg-forest-50"}`}>
                          <span className="flex items-center gap-2 text-sm font-bold"><AspectIcon ratio={p.aspectRatio} /> {p.name} · {p.aspectRatio}</span>
                          <span className={`mt-1 block text-[11px] ${aspect === p.aspectRatio ? "text-white/70" : "text-earth-600"}`}>{ok ? p.channels.join(" · ") : "No admitido por este modelo"}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-sand-100 p-3 text-sm text-earth-800">
                    {model.mode === "image-to-video"
                      ? "Este modelo no documenta el parámetro aspect_ratio: el video conserva la proporción de la fotografía de referencia. Para un reel vertical, elige una foto vertical."
                      : "Este modelo no documenta el parámetro aspect_ratio: no se puede elegir el formato."}
                  </p>
                )}
                {model.aspectRatios && <p className="mt-2 text-[11px] text-earth-600">Proporciones admitidas por el modelo: {model.aspectRatios.join(", ")}</p>}
              </div>

              <div>
                <h2 className={step}><span className={num}>5</span> Duración y parámetros admitidos</h2>
                <ParamsForm model={model} values={params} onChange={(v) => (setParams(v), setEstimate(null))} />
                {supportsShots && <ShotsEditor model={model} shots={shots} onChange={(s) => (setShots(s), setEstimate(null))} />}
              </div>

              <div>
                <h2 className={step}><span className={num}>6</span> Enviar solicitud</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button disabled={!configured || !ready || estimateM.isPending} onClick={() => estimateM.mutate()}
                    className="inline-flex items-center gap-2 rounded-full border border-forest-800 px-5 py-2.5 text-sm font-bold text-forest-900 disabled:opacity-40">
                    {estimateM.isPending && <Loader2 className="size-4 animate-spin" />} Estimar costo
                  </button>
                  <button disabled={!configured || !ready || !estimate?.withinBudget || submitM.isPending} onClick={() => submitM.mutate()}
                    className="inline-flex items-center gap-2 rounded-full bg-gold-400 px-6 py-2.5 text-sm font-extrabold uppercase tracking-wide text-forest-950 disabled:opacity-40">
                    {submitM.isPending && <Loader2 className="size-4 animate-spin" />} Generar video
                  </button>
                </div>
                {estimate && (
                  <p className={`mt-2 text-sm ${estimate.withinBudget ? "text-forest-800" : "text-red-700"}`}>
                    Costo estimado por Higgsfield: <strong>USD {estimate.estimateUsd}</strong> · gastado este mes USD {estimate.spentThisMonthUsd} de {estimate.monthlyBudgetUsd}
                    {!estimate.withinBudget && " · supera el presupuesto mensual"}
                  </p>
                )}
                {!estimate && configured && ready && <p className="mt-2 text-xs text-earth-600">Primero estima el costo: generar exige una estimación dentro del presupuesto.</p>}
                {(estimateM.error || submitM.error) && <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{((estimateM.error || submitM.error) as Error).message}</p>}
                {submitM.isSuccess && <p className="mt-2 text-sm text-forest-800">Generación en cola. Sigue su estado en el historial.</p>}
              </div>
            </>
          )}
        </section>

        <Generations />
      </div>

      {picker && <PhotoPicker onClose={() => setPicker(false)} onPick={(m) => (setReference(m), setPicker(false), setEstimate(null))} />}
    </div>
  );
}

function AspectIcon({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const s = 16 / Math.max(w, h);
  return <span className="inline-block rounded-[3px] border-2 border-current" style={{ width: w * s, height: h * s }} aria-hidden />;
}

/* ----------------------------------------------------------------- Presupuesto */
function BudgetCard({ status, canEdit }: { status: Status; canEdit: boolean }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [budget, setBudget] = useState(status.monthlyBudgetUsd);
  const [max, setMax] = useState(status.maxConcurrent);
  const save = useMutation({
    mutationFn: () => api("/admin/ai/settings", { method: "PUT", json: { monthly_budget_usd: budget, max_concurrent: Number(max) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-status"] }),
  });
  const spent = Number(status.spentThisMonthUsd);
  const total = Number(status.monthlyBudgetUsd);
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl bg-forest-900 p-5 text-white">
      <div className="min-w-56 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-gold-300">Consumo del mes (estimado)</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">USD {spent.toFixed(2)} <span className="text-sm font-normal text-white/60">/ {total > 0 ? total.toFixed(2) : "sin presupuesto"}</span></p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-gold-400" style={{ width: `${pct}%` }} /></div>
      </div>
      <p className="text-xs text-white/70">
        {Object.entries(status.generations).map(([k, n]) => `${STATUS_LABEL[k as Generation["status"]] ?? k}: ${n}`).join(" · ") || "Sin generaciones todavía"}
      </p>
      {canEdit && (
        <div className="flex items-end gap-2">
          <label className="text-xs">Presupuesto USD<input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" className="mt-1 block w-24 rounded-lg bg-white/10 px-2 py-1.5 text-sm" /></label>
          <label className="text-xs">Simultáneas<input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" className="mt-1 block w-20 rounded-lg bg-white/10 px-2 py-1.5 text-sm" /></label>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-gold-400 px-3 py-1.5 text-sm font-bold text-forest-950">Guardar</button>
          {save.error && <span className="text-xs text-red-200">{(save.error as Error).message}</span>}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Biblioteca de prompts */
function TemplateLibrary({ templates, active, onPick, current, onSaved }: {
  templates: Template[]; active: string | null; onPick: (t: Template) => void; current: { prompt: string; category: string }; onSaved: () => void;
}) {
  const { api } = useSession();
  const activeT = templates.find((t) => t.key === active);
  const save = useMutation({
    mutationFn: () => api(`/admin/ai/templates/${activeT!.key}`, {
      method: "PUT",
      json: { name: activeT!.name, description: activeT!.description, prompt: current.prompt, negative_prompt: activeT!.negativePrompt, aspect_ratio: activeT!.aspectRatio, duration: activeT!.duration, category: current.category || activeT!.category },
    }),
    onSuccess: onSaved,
  });
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-wider text-forest-800">Biblioteca de prompts</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <button key={t.key} onClick={() => onPick(t)} title={t.description ?? ""}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active === t.key ? "bg-gold-400 text-forest-950" : "bg-forest-900/5 text-forest-900 hover:bg-forest-900/10"}`}>
            {t.name}
          </button>
        ))}
        {activeT && activeT.prompt !== current.prompt && (
          <button onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-forest-800 underline">
            <Save className="size-3.5" /> Guardar cambios en “{activeT.name}”
          </button>
        )}
      </div>
      {save.error && <p className="mt-1 text-xs text-red-700">{(save.error as Error).message}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- Formulario dinámico */
function ParamsForm({ model, values, onChange }: { model: Model; values: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const entries = Object.entries(model.params).filter(([k]) => !MANAGED.has(k) && k !== model.imageParam);
  const set = (k: string, v: unknown) => {
    const next = { ...values };
    if (v === "" || v === undefined || Number.isNaN(v)) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const field = "mt-1 w-full rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm";
  if (entries.length === 0) return <p className="mt-3 text-sm text-earth-700">Este modelo no tiene parámetros adicionales.</p>;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {entries.map(([k, spec]) => {
        const req = model.required.includes(k);
        const lbl = `${k.replace(/_/g, " ")}${req ? " *" : ""}`;
        const hint = spec.minimum !== undefined || spec.maximum !== undefined ? `${spec.minimum ?? ""}–${spec.maximum ?? ""}` : "";
        if (spec.enum)
          return (
            <label key={k} className="text-xs font-bold uppercase tracking-wider text-forest-800">{lbl}
              <select className={field} value={String(values[k] ?? "")} onChange={(e) => set(k, spec.type === "integer" || spec.type === "number" ? Number(e.target.value) : e.target.value)}>
                {!req && <option value="">Por defecto</option>}
                {spec.enum.map((o) => <option key={String(o)} value={String(o)}>{String(o)}{k === "duration" ? " s" : ""}</option>)}
              </select>
            </label>
          );
        if (spec.type === "boolean")
          return (
            <label key={k} className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-forest-900">
              <input type="checkbox" className="size-4 accent-forest-800" checked={Boolean(values[k] ?? spec.default)} onChange={(e) => set(k, e.target.checked)} /> {k.replace(/_/g, " ")}
            </label>
          );
        if (spec.type === "integer" || spec.type === "number")
          return (
            <label key={k} className="text-xs font-bold uppercase tracking-wider text-forest-800">{lbl} {hint && <span className="font-normal normal-case text-earth-600">({hint})</span>}
              <input type="number" className={field} min={spec.minimum} max={spec.maximum} step={spec.type === "integer" ? 1 : 0.01} value={values[k] === undefined ? "" : String(values[k])}
                onChange={(e) => set(k, e.target.value === "" ? undefined : spec.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value))} />
            </label>
          );
        if (spec.type === "string")
          return (
            <label key={k} className="text-xs font-bold uppercase tracking-wider text-forest-800 sm:col-span-2">{lbl}
              <input className={field} maxLength={spec.maxLength} value={String(values[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
            </label>
          );
        return null;
      })}
    </div>
  );
}

/** Secuencias de varios planos (solo modelos que documentan multi_prompt, p. ej. Kling 3.0). */
function ShotsEditor({ model, shots, onChange }: { model: Model; shots: { prompt: string; duration: number }[]; onChange: (s: { prompt: string; duration: number }[]) => void }) {
  const max = model.params.multi_prompt?.maxItems ?? 6;
  return (
    <div className="mt-5 rounded-2xl bg-sand-100 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-forest-900"><Film className="size-4" /> Secuencia de varios planos (opcional)</p>
      <p className="mt-1 text-xs text-earth-700">Hasta {max} planos, cada uno con su prompt (≤ 512 caracteres) y duración (1–15 s). La duración total es la suma de los planos.</p>
      {shots.map((s, i) => (
        <div key={i} className="mt-2 flex gap-2">
          <span className="mt-2 text-xs font-bold text-earth-700">{i + 1}</span>
          <textarea rows={2} maxLength={512} value={s.prompt} onChange={(e) => onChange(shots.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))}
            className="flex-1 rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm" aria-label={`Prompt del plano ${i + 1}`} />
          <input type="number" min={1} max={15} value={s.duration} onChange={(e) => onChange(shots.map((x, j) => (j === i ? { ...x, duration: parseInt(e.target.value) || 1 } : x)))}
            className="w-16 rounded-xl border border-forest-900/15 bg-white px-2 py-2 text-sm" aria-label={`Duración del plano ${i + 1}`} />
          <button onClick={() => onChange(shots.filter((_, j) => j !== i))} className="px-2 text-red-700" aria-label="Quitar plano"><Trash2 className="size-4" /></button>
        </div>
      ))}
      {shots.length < max && (
        <button onClick={() => onChange([...shots, { prompt: "", duration: 3 }])} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-forest-800">
          <Plus className="size-4" /> Añadir plano
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Selector de fotografía */
function PhotoPicker({ onClose, onPick }: { onClose: () => void; onPick: (m: MediaLite) => void }) {
  const { api } = useSession();
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["picker", q],
    queryFn: () => api<{ items: MediaLite[] }>(`/admin/media?type=photo&limit=60${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Elegir fotografía" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-4xl flex-col rounded-3xl bg-sand-50 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl text-forest-900">Elegir fotografía de referencia</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="ml-auto rounded-xl border border-forest-900/15 bg-white px-3 py-2 text-sm" />
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-forest-900/5" aria-label="Cerrar"><X className="size-5" /></button>
        </div>
        <p className="mt-1 text-xs text-earth-700">Higgsfield acepta JPG, PNG y WebP como referencia. Las fotos AVIF se rechazarán al enviar.</p>
        <ul className="mt-4 grid grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
          {list.data?.items.map((m) => (
            <li key={m.id}>
              <button onClick={() => onPick(m)} className="relative block aspect-square w-full overflow-hidden rounded-xl bg-forest-900/10 focus-visible:outline-3 focus-visible:outline-gold-400" aria-label={m.title ?? "Foto"}>
                <Image src={m.url} alt="" fill sizes="20vw" quality={65} unoptimized={!isOptimizable(m.url)} className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Pasos 7–12: historial */
function Generations() {
  const { api } = useSession();
  const list = useQuery({
    queryKey: ["ai-generations"],
    queryFn: () => api<Generation[]>("/admin/ai/generations"),
    // Seguimiento en vivo mientras haya trabajos activos.
    refetchInterval: (q) => (q.state.data?.some((g) => ACTIVE.has(g.status)) ? 4000 : false),
  });
  return (
    <section className="space-y-3" aria-label="Historial de generaciones">
      <h2 className="font-display text-2xl text-forest-900">Generaciones</h2>
      {list.data?.length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-earth-700 ring-1 ring-forest-900/5">Todavía no hay generaciones.</p>}
      {list.data?.map((g) => <GenerationCard key={g.id} g={g} />)}
    </section>
  );
}

function GenerationCard({ g }: { g: Generation }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const cats = useCategories("es");
  const dests = useQuery({ queryKey: ["destinations-es"], queryFn: () => api<{ slug: string; name: string }[]>("/destinations?lang=es") });
  const [title, setTitle] = useState("");
  const [categories, setCategories] = useState<string[]>(g.category ? [g.category, "videos-promocionales"] : ["videos-promocionales"]);
  const [dest, setDest] = useState("");
  const done = () => {
    qc.invalidateQueries({ queryKey: ["ai-generations"] });
    qc.invalidateQueries({ queryKey: ["gallery"] });
  };
  const review = useMutation({
    mutationFn: (v: { decision: "approve" | "discard"; publish?: boolean }) =>
      api(`/admin/ai/generations/${g.id}/review`, { method: "POST", json: { ...v, title: title || undefined, categories, destinations: dest ? [dest] : [] } }),
    onSuccess: done,
  });
  const cancel = useMutation({ mutationFn: () => api(`/admin/ai/generations/${g.id}/cancel`, { method: "POST" }), onSuccess: done });
  const tone = g.status === "succeeded" ? "bg-forest-800 text-white" : ACTIVE.has(g.status) ? "bg-gold-400 text-forest-950" : "bg-red-600 text-white";

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-forest-900/5">
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${tone}`}>
          {ACTIVE.has(g.status) && <Loader2 className="size-3 animate-spin" />} {STATUS_LABEL[g.status]}
        </span>
        <span className="text-[11px] text-earth-600">{new Date(g.createdAt).toLocaleString("es-PA")}</span>
      </div>
      <p className="line-clamp-3 text-sm text-ink-800">{g.prompt}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-earth-700">
        <dt>Modelo</dt><dd className="truncate" title={g.model}>{g.model}</dd>
        <dt>Estimado</dt><dd>{g.estimatedUsd ? `USD ${g.estimatedUsd}` : "—"}</dd>
        {g.requestId && (<><dt>request_id</dt><dd className="truncate" title={g.requestId}>{g.requestId}</dd></>)}
        {g.reference && (<><dt>Referencia</dt><dd className="truncate">{g.reference.title}</dd></>)}
        <dt>Intentos</dt><dd>{g.attempts}</dd>
        {g.requestedBy && (<><dt>Solicitó</dt><dd className="truncate">{g.requestedBy}</dd></>)}
      </dl>
      {g.error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{g.error}</p>}
      {(g.status === "queued" || g.status === "submitted") && (
        <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="text-xs font-semibold text-red-700 underline">Cancelar</button>
      )}
      {cancel.error && <p className="text-xs text-red-700">{(cancel.error as Error).message}</p>}

      {g.status === "succeeded" && g.result && (
        <>
          <video src={g.result.url} poster={g.result.posterUrl} controls preload="none" className="max-h-80 w-full rounded-xl bg-black" />
          {g.reviewStatus === "pending" ? (
            <div className="space-y-2 rounded-xl bg-sand-100 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-forest-800">Revisión</p>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título para la galería" className="w-full rounded-lg border border-forest-900/15 bg-white px-2.5 py-1.5 text-sm" />
              <div className="flex flex-wrap gap-1">
                {cats.data?.map((c) => (
                  <button key={c.key} onClick={() => setCategories((s) => (s.includes(c.key) ? s.filter((x) => x !== c.key) : [...s, c.key]))}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${categories.includes(c.key) ? "bg-forest-800 text-gold-300" : "bg-white text-forest-900"}`}>{c.name}</button>
                ))}
              </div>
              <select aria-label="Asociar destino" value={dest} onChange={(e) => setDest(e.target.value)} className="w-full rounded-lg border border-forest-900/15 bg-white px-2.5 py-1.5 text-sm">
                <option value="">Sin destino asociado</option>
                {dests.data?.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </select>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => review.mutate({ decision: "approve", publish: true })} disabled={review.isPending} className="inline-flex items-center gap-1 rounded-full bg-forest-800 px-3 py-1.5 text-xs font-bold text-white"><Check className="size-3.5" /> Aprobar y publicar</button>
                <button onClick={() => review.mutate({ decision: "approve", publish: false })} disabled={review.isPending} className="rounded-full border border-forest-800 px-3 py-1.5 text-xs font-bold text-forest-900">Guardar en galería (borrador)</button>
                <button onClick={() => review.mutate({ decision: "discard" })} disabled={review.isPending} className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-700">Descartar</button>
              </div>
              {review.error && <p className="text-xs text-red-700">{(review.error as Error).message}</p>}
            </div>
          ) : (
            <p className="text-xs font-semibold text-forest-800">{g.reviewStatus === "approved" ? `Aprobado · ${g.result.status === "published" ? "publicado en la galería" : "guardado como borrador"}` : "Descartado"}</p>
          )}
          {g.expiresAt && <p className="text-[11px] text-earth-600">La copia en Higgsfield expira el {new Date(g.expiresAt).toLocaleDateString("es-PA")}; el video ya está guardado en el almacenamiento propio.</p>}
        </>
      )}
    </article>
  );
}
