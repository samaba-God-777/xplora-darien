"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { useSession } from "./session";
import { Drawer, Empty, ErrorText, INV_CATEGORY, MOVEMENT, PageHeader, Stat, btnPrimary, field, label, money } from "./ui";

interface Item {
  id: string; name: string; category: string; sku: string | null; unit: string; quantity: number; in_use: number; in_repair: number;
  min_stock: number; unitCost: string | null; condition: string; location: string | null; notes: string | null;
  total: number; low: boolean; value: string;
  movements: { type: string; quantity: number; note: string | null; booking: string | null; at: string }[];
}

export function InventoryAdmin() {
  const { api } = useSession();
  const list = useQuery({ queryKey: ["inventory"], queryFn: () => api<Item[]>("/admin/inventory") });
  const [open, setOpen] = useState<Item | "new" | null>(null);
  const [cat, setCat] = useState("");
  const items = useMemo(() => (list.data ?? []).filter((i) => !cat || i.category === cat), [list.data, cat]);
  const totals = useMemo(() => ({
    value: (list.data ?? []).reduce((a, i) => a + Number(i.value), 0),
    low: (list.data ?? []).filter((i) => i.low).length,
    inUse: (list.data ?? []).reduce((a, i) => a + i.in_use, 0),
  }), [list.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario"
        subtitle="Equipo de la operación: chalecos, carpas, botiquines, botes… Registra compras, salidas a viajes, devoluciones y bajas; las existencias nunca quedan negativas."
        action={<button onClick={() => setOpen("new")} className={btnPrimary}><Plus className="size-4" /> Nuevo artículo</button>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Artículos" value={list.data?.length ?? 0} />
        <Stat label="En viajes ahora" value={totals.inUse} />
        <Stat label="Bajo el mínimo" value={totals.low} tone={totals.low > 0 ? "bad" : undefined} />
        <Stat label="Valor del inventario" value={money(totals.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["", ...Object.keys(INV_CATEGORY)].map((c) => (
          <button key={c || "all"} onClick={() => setCat(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${cat === c ? "bg-forest-800 text-gold-300" : "bg-white text-forest-900 ring-1 ring-forest-900/10"}`}>
            {c ? INV_CATEGORY[c] : "Todo"}
          </button>
        ))}
      </div>
      <ErrorText error={list.error} />
      {list.data?.length === 0 && <Empty>El inventario está vacío. Crea un artículo y registra una compra para cargar existencias.</Empty>}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-forest-900/5">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-earth-700"><tr><th className="p-3">Artículo</th><th>Categoría</th><th>Disponible</th><th>En viaje</th><th>Reparación</th><th>Mínimo</th><th>Valor</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} onClick={() => setOpen(i)} className="cursor-pointer border-t border-forest-900/5 hover:bg-forest-50/60">
                  <td className="p-3 font-semibold text-forest-900"><button className="text-left">{i.name}</button>{i.location && <span className="block text-xs font-normal text-earth-600">{i.location}</span>}</td>
                  <td>{INV_CATEGORY[i.category]}</td>
                  <td className={`tabular-nums ${i.low ? "font-bold text-red-700" : ""}`}>{i.quantity} {i.low && <AlertTriangle className="inline size-3.5" aria-label="bajo el mínimo" />}</td>
                  <td className="tabular-nums">{i.in_use}</td>
                  <td className="tabular-nums">{i.in_repair}</td>
                  <td className="tabular-nums">{i.min_stock}</td>
                  <td className="tabular-nums">{money(i.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <ItemDrawer key={open === "new" ? "new" : open.id} item={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ItemDrawer({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { api, can } = useSession();
  const qc = useQueryClient();
  const refresh = () => (qc.invalidateQueries({ queryKey: ["inventory"] }), qc.invalidateQueries({ queryKey: ["dashboard"] }), qc.invalidateQueries({ queryKey: ["finance"] }));
  const [f, setF] = useState({
    name: item?.name ?? "", category: item?.category ?? "safety", unit: item?.unit ?? "unidad", min_stock: String(item?.min_stock ?? 0),
    location: item?.location ?? "", notes: item?.notes ?? "", sku: item?.sku ?? "",
  });
  const [mv, setMv] = useState({ type: "purchase", quantity: "", unit_cost: "", note: "" });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, min_stock: Number(f.min_stock) || 0, sku: f.sku || undefined, location: f.location || undefined, notes: f.notes || undefined };
      return item ? api(`/admin/inventory/${item.id}`, { method: "PATCH", json: body }) : api("/admin/inventory", { method: "POST", json: body });
    },
    onSuccess: () => (refresh(), onClose()),
  });
  const move = useMutation({
    mutationFn: () => api(`/admin/inventory/${item!.id}/movements`, {
      method: "POST", json: { type: mv.type, quantity: Number(mv.quantity), unit_cost: mv.type === "purchase" && mv.unit_cost ? mv.unit_cost : undefined, note: mv.note || undefined },
    }),
    onSuccess: () => (setMv({ type: "purchase", quantity: "", unit_cost: "", note: "" }), refresh(), onClose()),
  });
  const retire = useMutation({ mutationFn: () => api(`/admin/inventory/${item!.id}`, { method: "PATCH", json: { is_active: false } }), onSuccess: () => (refresh(), onClose()) });

  return (
    <Drawer title={item ? item.name : "Nuevo artículo"} onClose={onClose}>
      {item && (
        <section className="mb-8 rounded-2xl bg-white p-4 ring-1 ring-forest-900/5">
          <p className="text-sm">Disponible <strong>{item.quantity}</strong> · en viaje <strong>{item.in_use}</strong> · en reparación <strong>{item.in_repair}</strong> {item.unitCost && `· costo ${money(item.unitCost)}`}</p>
          <form className="mt-3 grid grid-cols-2 gap-2" onSubmit={(e) => (e.preventDefault(), move.mutate())}>
            <select aria-label="Tipo de movimiento" className={`${field} col-span-2`} value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })}>
              {Object.entries(MOVEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input aria-label="Cantidad" required inputMode="numeric" placeholder={mv.type === "adjustment" ? "Cantidad (+/−)" : "Cantidad"} className={field} value={mv.quantity} onChange={(e) => setMv({ ...mv, quantity: e.target.value })} />
            {mv.type === "purchase" ? (
              <input aria-label="Costo unitario" inputMode="decimal" placeholder="Costo unitario (USD)" className={field} value={mv.unit_cost} onChange={(e) => setMv({ ...mv, unit_cost: e.target.value.replace(",", ".") })} />
            ) : <span />}
            <input aria-label="Nota" placeholder="Nota (opcional)" className={`${field} col-span-2`} value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} />
            {mv.type === "purchase" && can("finance.write") && <p className="col-span-2 text-xs text-earth-600">Con costo unitario, la compra se registra también como gasto de equipo.</p>}
            <button className={`${btnPrimary} col-span-2`} disabled={!mv.quantity || move.isPending}>Registrar movimiento</button>
          </form>
          <div className="mt-2"><ErrorText error={move.error} /></div>
          {item.movements.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-earth-700">
              {item.movements.map((m, i) => <li key={i}>{new Date(m.at).toLocaleDateString("es-PA")} · {MOVEMENT[m.type]} {m.quantity > 0 && m.type === "adjustment" ? "+" : ""}{m.quantity}{m.booking ? ` · ${m.booking}` : ""}{m.note ? ` · ${m.note}` : ""}</li>)}
            </ul>
          )}
        </section>
      )}
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <div><label className={label} htmlFor="in">Nombre</label><input id="in" required className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="ic">Categoría</label><select id="ic" className={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(INV_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className={label} htmlFor="iu">Unidad</label><input id="iu" className={field} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></div>
          <div><label className={label} htmlFor="im">Existencia mínima</label><input id="im" inputMode="numeric" className={field} value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: e.target.value })} /></div>
          <div><label className={label} htmlFor="is">Código / SKU</label><input id="is" className={field} value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></div>
        </div>
        <div><label className={label} htmlFor="il">Ubicación</label><input id="il" className={field} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Bodega Metetí, bote 1…" /></div>
        <div><label className={label} htmlFor="ino">Notas</label><textarea id="ino" rows={2} className={field} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <ErrorText error={save.error} />
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={save.isPending}>{item ? "Guardar cambios" : "Crear artículo"}</button>
          {item && <button type="button" onClick={() => retire.mutate()} className="ml-auto rounded-full px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Retirar del inventario</button>}
        </div>
      </form>
    </Drawer>
  );
}
