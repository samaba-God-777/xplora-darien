import { FinanceAdmin } from "@/features/admin/FinanceAdmin";

export default function Page() {
  return <FinanceAdmin />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
