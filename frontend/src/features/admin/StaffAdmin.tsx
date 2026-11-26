"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Plus, UserRound } from "lucide-react";
import { useSession } from "./session";
import { Drawer, Empty, ErrorText, PAY_TYPE, PageHeader, STAFF_ROLE, btnPrimary, field, label, money } from "./ui";

interface Staff {
  id: string; full_name: string; role: string; phone: string | null; email: string | null; community: string | null;
  pay_type: string; payRate: string; languages: string[]; notes: string | null; is_active: boolean; hired_on: string | null;
  upcoming: { id: string; date: string; days: number; booking: string; package: string; amount: string; paid: boolean }[];
  unpaid: string; trips: number;
}
type Form = { full_name: string; role: string; phone: string; email: string; document_id: string; community: string; pay_type: string; pay_rate: string; languages: string; notes: string; hired_on: string; is_active: boolean };
const blank: Form = { full_name: "", role: "guide", phone: "", email: "", document_id: "", community: "", pay_type: "per_day", pay_rate: "", languages: "es", notes: "", hired_on: "", is_active: true };

export function StaffAdmin() {
  const { api } = useSession();
  const list = useQuery({ queryKey: ["staff"], queryFn: () => api<Staff[]>("/admin/staff") });
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const totalUnpaid = list.data?.reduce((a, s) => a + Number(s.unpaid), 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personal"
        subtitle={`Guías, boteros, conductores y equipo. Se asignan a reservas desde “Reservas” y su pago cuenta como costo. Pendiente de pago: ${money(totalUnpaid)}.`}
        action={<button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" /> Nuevo trabajador</button>}
      />
      <ErrorText error={list.error} />
      {list.data?.length === 0 && <Empty>Aún no hay trabajadores registrados.</Empty>}
      <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {list.data?.map((s) => (
          <li key={s.id}>
            <button onClick={() => setEditing(s)} className={`w-full rounded-2xl bg-white p-4 text-left ring-1 ring-forest-900/5 hover:shadow-md ${s.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-forest-800 text-gold-300"><UserRound className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-forest-900">{s.full_name} {!s.is_active && <span className="text-xs font-normal">(inactivo)</span>}</p>
                  <p className="text-xs text-earth-700">{STAFF_ROLE[s.role]}{s.community ? ` · ${s.community}` : ""} · {money(s.payRate)} {PAY_TYPE[s.pay_type]}</p>
                  {s.phone && <p className="mt-1 flex items-center gap-1 text-xs text-earth-700"><Phone className="size-3" /> {s.phone}</p>}
                </div>
                {Number(s.unpaid) > 0 && <span className="text-xs font-semibold text-red-700">Debe {money(s.unpaid)}</span>}
              </div>
              <p className="mt-3 text-xs text-earth-700">{s.trips} viajes{s.upcoming.filter((u) => u.date >= new Date().toISOString().slice(0, 10)).length > 0 ? ` · próximo: ${s.upcoming.find((u) => u.date >= new Date().toISOString().slice(0, 10))?.date}` : ""}</p>
            </button>
          </li>
        ))}
      </ul>
      {editing && <StaffDrawer key={editing === "new" ? "new" : editing.id} staff={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffDrawer({ staff, onClose }: { staff: Staff | null; onClose: () => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(
    staff
      ? { ...blank, full_name: staff.full_name, role: staff.role, phone: staff.phone ?? "", email: staff.email ?? "", community: staff.community ?? "",
          pay_type: staff.pay_type, pay_rate: staff.payRate, languages: staff.languages.join(", "), notes: staff.notes ?? "", hired_on: staff.hired_on ?? "", is_active: staff.is_active }
      : blank,
  );
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        languages: f.languages.split(",").map((l) => l.trim()).filter(Boolean),
        pay_rate: f.pay_rate || undefined, hired_on: f.hired_on || undefined, document_id: f.document_id || undefined,
        email: f.email || undefined, phone: f.phone || undefined,
      };
      return staff ? api(`/admin/staff/${staff.id}`, { method: "PATCH", json: body }) : api("/admin/staff", { method: "POST", json: body });
    },
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["staff"] }), qc.invalidateQueries({ queryKey: ["dashboard"] }), onClose()),
  });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Drawer title={staff ? staff.full_name : "Nuevo trabajador"} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <div><label className={label} htmlFor="sn">Nombre completo</label><input id="sn" required className={field} value={f.full_name} onChange={set("full_name")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="sr">Rol</label><select id="sr" className={field} value={f.role} onChange={set("role")}>{Object.entries(STAFF_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className={label} htmlFor="sc">Pueblo / comunidad</label><input id="sc" className={field} value={f.community} onChange={set("community")} /></div>
          <div><label className={label} htmlFor="sp">Teléfono</label><input id="sp" type="tel" className={field} value={f.phone} onChange={set("phone")} /></div>
          <div><label className={label} htmlFor="se">Correo</label><input id="se" type="email" className={field} value={f.email} onChange={set("email")} /></div>
          <div><label className={label} htmlFor="spt">Tipo de pago</label><select id="spt" className={field} value={f.pay_type} onChange={set("pay_type")}>{Object.entries(PAY_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className={label} htmlFor="spr">Tarifa (USD)</label><input id="spr" inputMode="decimal" className={field} value={f.pay_rate} onChange={(e) => setF({ ...f, pay_rate: e.target.value.replace(",", ".") })} /></div>
          <div><label className={label} htmlFor="sl">Idiomas</label><input id="sl" className={field} value={f.languages} onChange={set("languages")} placeholder="es, en, emberá" /></div>
          <div><label className={label} htmlFor="sh">Ingreso</label><input id="sh" type="date" className={field} value={f.hired_on} onChange={set("hired_on")} /></div>
        </div>
        {!staff && <div><label className={label} htmlFor="sd">Cédula / pasaporte (solo panel)</label><input id="sd" className={field} value={f.document_id} onChange={set("document_id")} /></div>}
        <div><label className={label} htmlFor="sno">Notas</label><textarea id="sno" rows={3} className={field} value={f.notes} onChange={set("notes")} /></div>
        {staff && (
          <label className="flex items-center gap-2 text-sm font-semibold text-forest-900">
            <input type="checkbox" className="size-4 accent-forest-800" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Activo
          </label>
        )}
        <ErrorText error={save.error} />
        <button className={btnPrimary} disabled={save.isPending}>Guardar</button>
      </form>
      {staff && staff.upcoming.length > 0 && (
        <section className="mt-8">
          <h3 className={label}>Asignaciones recientes y por pagar</h3>
          <ul className="space-y-1 text-sm">
            {staff.upcoming.map((u) => (
              <li key={u.id} className="flex justify-between gap-2"><span>{u.date} · {u.booking} · {u.package}</span><span className={u.paid ? "text-forest-800" : "font-semibold text-red-700"}>{money(u.amount)} {u.paid ? "✓" : ""}</span></li>
            ))}
          </ul>
        </section>
      )}
    </Drawer>
  );
}
