import { Dashboard } from "@/features/admin/Dashboard";

export default function AdminHome() {
  return <Dashboard />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
