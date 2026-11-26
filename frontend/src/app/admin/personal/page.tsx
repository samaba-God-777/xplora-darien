import { StaffAdmin } from "@/features/admin/StaffAdmin";

export default function Page() {
  return <StaffAdmin />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
