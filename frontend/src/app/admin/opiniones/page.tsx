import { ReviewsAdmin } from "@/features/admin/ReviewsAdmin";

export default function Page() {
  return <ReviewsAdmin />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
