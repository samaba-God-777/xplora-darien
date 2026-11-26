"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, MessageCircle } from "lucide-react";
import { useSession } from "./session";
import { ErrorText, PageHeader, btnPrimary, field, label } from "./ui";

interface Data {
  settings: Record<string, string>;
  mail: { configured: boolean; counts: Record<string, number> };
}
const CONTACT: [string, string, string][] = [
  ["contact.name", "Persona de contacto", "Aparece en el pie del sitio y en los correos a clientes."],
  ["contact.whatsapp", "WhatsApp del negocio", "Solo dígitos con código de país, p. ej. 50760000000. El botón de WhatsApp del sitio aparece al guardarlo."],
  ["contact.phone", "Teléfono público", ""],
  ["contact.email", "Correo público", "Aparece en el pie del sitio y como respuesta de los correos a clientes."],
  ["contact.address", "Base de operaciones", "Por ejemplo: Metetí, Darién."],
  ["notify.email", "Correo que recibe las nuevas solicitudes", "Privado: no se muestra en el sitio."],
];
const PAGES: [string, string][] = [
  ["page.about", "Quiénes somos"], ["page.cancellation", "Cancelaciones"], ["page.privacy", "Privacidad"], ["page.terms", "Términos"],
];

export function SiteSettings() {
  const { api } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-site"], queryFn: () => api<Data>("/admin/site") });
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copia inicial editable de los ajustes cargados
    if (q.data) setF(q.data.settings);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api("/admin/site", { method: "PUT", json: f }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["admin-site"] }), qc.invalidateQueries({ queryKey: ["site"] })),
  });
  const mail = q.data?.mail;

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración del sitio" subtitle="Datos de contacto, avisos por correo y textos de las páginas de confianza." />
      {mail && (
        <div className={`flex gap-3 rounded-2xl p-4 text-sm ${mail.configured ? "bg-forest-50 text-forest-900" : "bg-gold-100 text-earth-800"}`}>
          <Mail className="size-5 shrink-0" />
          <p>
            {mail.configured ? (
              <>Envío de correos activo. Enviados: <strong>{mail.counts.sent ?? 0}</strong> · pendientes: {mail.counts.pending ?? 0} · fallidos: {mail.counts.failed ?? 0}.</>
            ) : (
              <><strong>El envío de correos no está configurado.</strong> Los avisos quedan en cola ({mail.counts.pending ?? 0} pendientes) hasta definir <code>MAIL_URL</code> (SMTP de tu proveedor de correo) en el backend.</>
            )}
          </p>
        </div>
      )}
      <form className="space-y-8" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <section className="grid gap-4 rounded-3xl bg-white p-5 ring-1 ring-forest-900/5 md:grid-cols-2">
          <h2 className="flex items-center gap-2 font-display text-2xl text-forest-900 md:col-span-2"><MessageCircle className="size-5" /> Contacto</h2>
          {CONTACT.map(([k, l, hint]) => (
            <div key={k}>
              <label className={label} htmlFor={k}>{l}</label>
              <input id={k} className={field} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode={k === "contact.whatsapp" ? "numeric" : undefined} />
              {hint && <p className="mt-1 text-xs text-earth-600">{hint}</p>}
            </div>
          ))}
        </section>
        <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-forest-900/5">
          <h2 className="font-display text-2xl text-forest-900">Páginas de confianza</h2>
          <p className="text-xs text-earth-600">Texto simple: líneas en blanco separan párrafos, <code>**negrita**</code> y listas con “- ”. Conviene que un asesor legal revise privacidad y términos.</p>
          {/* Cada página tiene su versión en inglés (clave ".en"), que ve quien navega el sitio en inglés. */}
          {PAGES.map(([k, l]) => (
            <div key={k} className="grid gap-3 lg:grid-cols-2">
              {[[k, `${l} · español`], [`${k}.en`, `${l} · inglés`]].map(([key, lab]) => (
                <div key={key}>
                  <label className={label} htmlFor={key}>{lab}</label>
                  <textarea id={key} rows={7} className={`${field} font-mono text-xs`} value={f[key] ?? ""} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
                </div>
              ))}
            </div>
          ))}
        </section>
        <ErrorText error={save.error} />
        <div className="flex items-center gap-3">
          <button className={btnPrimary} disabled={save.isPending || !q.data}>Guardar configuración</button>
          {save.isSuccess && <span className="inline-flex items-center gap-1 text-sm text-forest-800"><CheckCircle2 className="size-4" /> Guardado</span>}
        </div>
      </form>
    </div>
  );
}
