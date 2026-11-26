"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { useSession } from "./session";
import { BOOKING_STATUS, Drawer, Empty, ErrorText, NEXT_STATUS, PAY_METHOD, PageHeader, STAFF_ROLE, StatusBadge, btnGhost, btnPrimary, field, fieldInline, label, money } from "./ui";

interface Row {
  id: string; code: string; status: string; travelDate: string; adults: number; children: number; total: string; currency: string;
  package: string; customer: string; email: string; phone: string; paidTotal: string; staff: number; createdAt: string;
}
interface Detail {
  id: string; code: string; status: string; travel_date: string; adults: number; children: number; total: string; currency: string; notes: string | null;
  customer: { first_name: string; last_name: string; email: string; phone: string; country: string };
  package: { name: string; code: string };
  services: { description: string; quantity: number }[];
  history: { to_status: string; note: string | null; changed_at: string }[];
  payments: { id: string; amount: string; method: string; date: string; reference: string | null }[];
  paidTotal: string;
  staffAssignments: { id: string; name: string; role: string; date: string; days: number; amount: string; paid: boolean }[];
}
interface StaffLite { id: string; full_name: string; role: string; is_active: boolean; pay_type: string; payRate: string }

/** Número para wa.me: solo dígitos; a los números panameños de 7–8 dígitos se les agrega el 507. */
const waNumber = (phone: string, country: string) => {
  const d = phone.replace(/\D/g, "");
  return country === "PA" && d.length <= 8 ? `507${d}` : d;
};

export function BookingsAdmin() {
  const { api } = useSession();
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin-bookings", status], queryFn: () => api<Row[]>(`/admin/bookings?limit=200${status ? `&status=${status}` : ""}`) });

  return (
    <div className="space-y-6">
      <PageHeader title="Reservas" subtitle="Revisa solicitudes, confirma con disponibilidad verificada, registra cobros y asigna personal." />
      <div className="flex flex-wrap gap-1.5">
        {["", ...Object.keys(BOOKING_STATUS)].map((s) => (
          <button key={s || "all"} onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? "bg-forest-800 text-gold-300" : "bg-white text-forest-900 ring-1 ring-forest-900/10"}`}>
            {s ? BOOKING_STATUS[s] : "Todas"}
          </button>
        ))}
      </div>
      <ErrorText error={list.error} />
      {list.data?.length === 0 && <Empty>No hay reservas {status ? `en estado “${BOOKING_STATUS[status]}”` : "todavía"}. Las solicitudes llegan desde /reservar.</Empty>}
      {list.data && list.data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-forest-900/5">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-earth-700">
              <tr><th className="p-3">Código</th><th>Viaje</th><th>Cliente</th><th>Paquete</th><th>Pers.</th><th>Total</th><th>Cobrado</th><th>Personal</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r.id)} className="cursor-pointer border-t border-forest-900/5 hover:bg-forest-50/60">
                  <td className="p-3 font-semibold text-forest-900"><button className="underline-offset-2 hover:underline">{r.code}</button></td>
                  <td className="tabular-nums">{r.travelDate}</td>
                  <td>{r.customer}</td>
                  <td>{r.package}</td>
                  <td className="tabular-nums">{r.adults + r.children}</td>
                  <td className="tabular-nums">{money(r.total, r.currency)}</td>
                  <td className={`tabular-nums ${Number(r.paidTotal) >= Number(r.total) && Number(r.total) > 0 ? "text-forest-800" : ""}`}>{money(r.paidTotal, r.currency)}</td>
                  <td>{r.staff || <span className="text-red-700">—</span>}</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <BookingDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BookingDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, can } = useSession();
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["admin-booking", id], queryFn: () => api<Detail>(`/admin/bookings/${id}`) });
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => api<StaffLite[]>("/admin/staff"), enabled: can("staff.manage") });
  const refresh = () => ["admin-booking", "admin-bookings", "dashboard", "staff", "finance"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const [note, setNote] = useState("");
  const [pay, setPay] = useState({ amount: "", method: "transfer", reference: "" });
  const [assign, setAssign] = useState({ staff_id: "", amount: "" });

  const status = useMutation({ mutationFn: (s: string) => api(`/admin/bookings/${id}/status`, { method: "POST", json: { status: s, note: note || undefined } }), onSuccess: () => (setNote(""), refresh()) });
  const payment = useMutation({
    mutationFn: () => api(`/admin/bookings/${id}/payments`, { method: "POST", json: { amount: pay.amount, method: pay.method, reference: pay.reference || undefined } }),
    onSuccess: () => (setPay({ amount: "", method: "transfer", reference: "" }), refresh()),
  });
  const addStaff = useMutation({
    mutationFn: () => api(`/admin/bookings/${id}/staff`, { method: "POST", json: { staff_id: assign.staff_id, amount: assign.amount || undefined } }),
    onSuccess: () => (setAssign({ staff_id: "", amount: "" }), refresh()),
  });
  const markPaid = useMutation({ mutationFn: (aid: string) => api(`/admin/staff-assignments/${aid}`, { method: "PATCH", json: { paid: true } }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (aid: string) => api(`/admin/staff-assignments/${aid}`, { method: "DELETE" }), onSuccess: refresh });

  const b = d.data;
  const balance = b ? Number(b.total) - Number(b.paidTotal) : 0;
  return (
    <Drawer title={b ? `Reserva ${b.code}` : "Reserva"} onClose={onClose}>
      {!b ? <div className="h-40 animate-pulse rounded-2xl bg-forest-900/10" /> : (
        <div className="space-y-6 text-sm">
          <div className="flex items-center justify-between"><StatusBadge status={b.status} /><span className="text-earth-700">{b.package.name}</span></div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl bg-white p-4 ring-1 ring-forest-900/5">
            <dt className="text-earth-600">Cliente</dt><dd>{b.customer.first_name} {b.customer.last_name} ({b.customer.country})</dd>
            <dt className="text-earth-600">Contacto</dt><dd className="break-all"><a className="underline" href={`mailto:${b.customer.email}`}>{b.customer.email}</a> · <a className="underline" href={`tel:${b.customer.phone}`}>{b.customer.phone}</a>{" "}
              <a className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#25D366] px-2 py-0.5 text-xs font-bold text-white" target="_blank" rel="noopener noreferrer"
                href={`https://wa.me/${waNumber(b.customer.phone, b.customer.country)}?text=${encodeURIComponent(`Hola ${b.customer.first_name}, te escribimos de XPLORA DARIÉN sobre tu reserva ${b.code}.`)}`}>WhatsApp</a></dd>
            <dt className="text-earth-600">Fecha</dt><dd>{b.travel_date}</dd>
            <dt className="text-earth-600">Participantes</dt><dd>{b.adults} adultos, {b.children} niños</dd>
            <dt className="text-earth-600">Total</dt><dd className="font-semibold">{money(b.total, b.currency)}</dd>
            <dt className="text-earth-600">Cobrado</dt><dd>{money(b.paidTotal, b.currency)}</dd>
            <dt className="text-earth-600">Saldo</dt><dd className={balance > 0 ? "font-semibold text-red-700" : "text-forest-800"}>{money(balance, b.currency)}</dd>
          </dl>
          {b.notes && <p className="rounded-xl bg-sand-100 p-3">“{b.notes}”</p>}
          {b.services.length > 0 && <p className="text-earth-700">Servicios adicionales: {b.services.map((s) => `${s.description} ×${s.quantity}`).join(", ")}</p>}

          {can("bookings.manage") && (NEXT_STATUS[b.status]?.length ?? 0) > 0 && (
            <section>
              <h3 className={label}>Cambiar estado</h3>
              <input className={field} placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mt-2 flex flex-wrap gap-2">
                {NEXT_STATUS[b.status].map((s) => (
                  <button key={s} onClick={() => status.mutate(s)} disabled={status.isPending} className={s === "cancelled" ? `${btnGhost} text-red-700` : btnGhost}>{BOOKING_STATUS[s]}</button>
                ))}
              </div>
              <p className="mt-1 text-xs text-earth-600">Confirmar exige disponibilidad registrada para la fecha (o una salida con cupo).</p>
              <div className="mt-2"><ErrorText error={status.error} /></div>
            </section>
          )}

          <section>
            <h3 className={label}>Cobros</h3>
            {b.payments.length === 0 ? <p className="text-earth-700">Sin cobros.</p> : (
              <ul className="space-y-1">{b.payments.map((p) => <li key={p.id} className="flex justify-between"><span>{p.date} · {PAY_METHOD[p.method]} {p.reference && `· ${p.reference}`}</span><strong className="tabular-nums">{money(p.amount, b.currency)}</strong></li>)}</ul>
            )}
            {can("finance.write") && ["confirmed", "paid", "completed", "cancelled"].includes(b.status) && (
              <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), payment.mutate())}>
                <input aria-label="Monto" required inputMode="decimal" placeholder={balance > 0 ? balance.toFixed(2) : "Monto"} className={`${fieldInline} w-28`} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(",", ".") })} />
                <select aria-label="Método" className={`${fieldInline} w-36`} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  {Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input aria-label="Referencia" placeholder="Referencia" className={`${fieldInline} w-36 flex-1`} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                <button className={btnPrimary} disabled={payment.isPending || !pay.amount}>Registrar cobro</button>
                <p className="w-full text-xs text-earth-600">Para un reembolso usa un monto negativo.</p>
              </form>
            )}
            {["received", "pending", "quoting"].includes(b.status) && <p className="mt-1 text-xs text-earth-600">Los cobros se registran una vez confirmada la reserva.</p>}
            <div className="mt-2"><ErrorText error={payment.error} /></div>
          </section>

          <section>
            <h3 className={label}>Personal asignado</h3>
            {b.staffAssignments.length === 0 ? <p className="text-earth-700">Nadie asignado.</p> : (
              <ul className="space-y-1.5">
                {b.staffAssignments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span className="flex-1">{a.name} · {STAFF_ROLE[a.role]} · {a.days} d</span>
                    <span className="tabular-nums">{money(a.amount)}</span>
                    {a.paid ? <span className="text-xs font-semibold text-forest-800">Pagado</span> : can("staff.manage") && (
                      <>
                        <button onClick={() => markPaid.mutate(a.id)} className="rounded-full p-1 text-forest-800 hover:bg-forest-50" aria-label={`Marcar pagado a ${a.name}`}><Check className="size-4" /></button>
                        <button onClick={() => remove.mutate(a.id)} className="rounded-full p-1 text-red-700 hover:bg-red-50" aria-label={`Quitar a ${a.name}`}><Trash2 className="size-4" /></button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {can("staff.manage") && b.status !== "cancelled" && (
              <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), addStaff.mutate())}>
                <select aria-label="Trabajador" required className={`${field} flex-1`} value={assign.staff_id} onChange={(e) => setAssign({ ...assign, staff_id: e.target.value })}>
                  <option value="">Asignar trabajador…</option>
                  {staff.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.full_name} · {STAFF_ROLE[s.role]} ({money(s.payRate)})</option>)}
                </select>
                <input aria-label="Pago acordado" inputMode="decimal" placeholder="Pago (auto)" className={`${fieldInline} w-28`} value={assign.amount} onChange={(e) => setAssign({ ...assign, amount: e.target.value.replace(",", ".") })} />
                <button className={btnPrimary} disabled={!assign.staff_id || addStaff.isPending}>Asignar</button>
              </form>
            )}
            {staff.data?.length === 0 && <p className="mt-1 text-xs text-earth-600">Registra trabajadores en “Personal”.</p>}
            <div className="mt-2"><ErrorText error={addStaff.error || remove.error} /></div>
          </section>

          <section>
            <h3 className={label}>Historial</h3>
            <ul className="space-y-1 text-xs text-earth-700">
              {b.history.map((h, i) => <li key={i}>{new Date(h.changed_at).toLocaleString("es-PA")} · {BOOKING_STATUS[h.to_status]}{h.note && h.note !== "created" ? ` · ${h.note}` : ""}</li>)}
            </ul>
          </section>
        </div>
      )}
    </Drawer>
  );
}
