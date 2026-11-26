import { BookingsAdmin } from "@/features/admin/BookingsAdmin";

export default function Page() {
  return <BookingsAdmin />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
