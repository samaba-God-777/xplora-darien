import { InventoryAdmin } from "@/features/admin/InventoryAdmin";

export default function Page() {
  return <InventoryAdmin />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
