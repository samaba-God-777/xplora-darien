import { MediaStudio } from "@/features/admin/MediaStudio";

export default function MediosPage() {
  return <MediaStudio />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
