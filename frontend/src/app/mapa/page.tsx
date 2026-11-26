import type { Metadata } from "next";
import { MapExplorer } from "@/features/map/MapExplorer";
import { destinations } from "@/data/destinations";

export const metadata: Metadata = {
  title: "Mapa interactivo de Darién",
  description:
    "Explora en el mapa las cascadas, ríos, playas, montañas y comunidades de Darién, Panamá, y descubre qué actividades puedes hacer en cada lugar.",
  alternates: { canonical: "/mapa" },
};

export default function MapaPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Destinos turísticos de Darién",
    itemListElement: destinations.map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "TouristAttraction",
        name: d.name,
        description: d.summary.es,
        geo: { "@type": "GeoCoordinates", latitude: d.coords[0], longitude: d.coords[1] },
        address: { "@type": "PostalAddress", addressRegion: "Darién", addressCountry: "PA" },
      },
    })),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MapExplorer />
    </main>
  );
}
