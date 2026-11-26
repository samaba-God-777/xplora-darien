import { AiStudio } from "@/features/admin/AiStudio";

export default function EstudioIaPage() {
  return <AiStudio />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
