import { SiteSettings } from "@/features/admin/SiteSettings";

export default function Page() {
  return <SiteSettings />;
}

// El contenido depende de la sesión del navegador: sin validación de navegación instantánea.
export const instant = false;
