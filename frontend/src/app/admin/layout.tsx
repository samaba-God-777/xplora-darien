import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/AdminShell";

export const metadata: Metadata = { title: "Panel", robots: { index: false, follow: false } };

// El panel depende de la sesión del navegador (JWT): se excluye de la validación de navegación instantánea,
// como recomienda la guía de autenticación con Cache Components.
export const instant = false;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
