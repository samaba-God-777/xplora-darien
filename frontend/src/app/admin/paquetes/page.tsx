import { PackagesAdmin } from "@/features/admin/PackagesAdmin";

export default function PaquetesAdminPage() {
  return <PackagesAdmin />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
