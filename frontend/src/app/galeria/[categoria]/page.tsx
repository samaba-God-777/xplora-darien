import type { Metadata } from "next";
import { CategoryView } from "@/features/gallery/CategoryView";

// Las 12 categorías editoriales (ver migración 0008).
const KEYS = [
  "selva-naturaleza", "rios-cascadas", "montanas-paisajes", "playas-costas", "cultura-tradiciones", "comunidades",
  "fauna-biodiversidad", "aventuras-exploracion", "destinos-turisticos", "paquetes-turisticos", "experiencias", "videos-promocionales",
];

export function generateStaticParams() {
  return KEYS.map((categoria) => ({ categoria }));
}

export async function generateMetadata({ params }: PageProps<"/galeria/[categoria]">): Promise<Metadata> {
  const { categoria } = await params;
  const name = categoria.replace(/-/g, " ");
  return {
    title: `${name.charAt(0).toUpperCase()}${name.slice(1)} · Galería`,
    description: `Fotografías y videos de Darién, Panamá: ${name}.`,
    alternates: { canonical: `/galeria/${categoria}` },
  };
}

export default async function CategoriaPage({ params }: PageProps<"/galeria/[categoria]">) {
  const { categoria } = await params;
  return <CategoryView categoryKey={categoria} />;
}
