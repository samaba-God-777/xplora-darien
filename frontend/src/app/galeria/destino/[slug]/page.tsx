import type { Metadata } from "next";
import { destinations } from "@/data/destinations";
import { DestinationGallery } from "@/features/gallery/DestinationGallery";

export function generateStaticParams() {
  return destinations.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/galeria/destino/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const d = destinations.find((x) => x.slug === slug);
  return {
    title: d ? `${d.name} · Galería` : "Galería",
    description: d ? `Fotografías y videos de ${d.name}, Darién, Panamá. ${d.summary.es}` : undefined,
    alternates: { canonical: `/galeria/destino/${slug}` },
  };
}

export default async function DestinoGaleriaPage({ params }: PageProps<"/galeria/destino/[slug]">) {
  const { slug } = await params;
  return <DestinationGallery slug={slug} />;
}
