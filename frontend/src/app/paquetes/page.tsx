import type { Metadata } from "next";
import { PackageList } from "@/features/packages/PackageList";

export const metadata: Metadata = {
  title: "Paquetes turísticos en Darién",
  description: "Paquetes turísticos verificados por XPLORA DARIÉN: aventura, naturaleza y cultura en Darién, Panamá.",
  alternates: { canonical: "/paquetes" },
};

export default function PaquetesPage() {
  return <PackageList />;
}
