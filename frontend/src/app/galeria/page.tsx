import type { Metadata } from "next";
import { GalleryHero } from "@/features/gallery/GalleryHero";
import { CategoryBento } from "@/features/gallery/CategoryBento";
import { DestinationGrid } from "@/features/gallery/DestinationGrid";
import { MasonryGallery } from "@/features/gallery/MasonryGallery";
import { VideoGallery } from "@/features/gallery/VideoGallery";
import { ExpandShowcase } from "@/features/gallery/ExpandShowcase";
import { ScrollHeadline } from "@/features/gallery/fx";
import { T } from "@/i18n/locale";

export const metadata: Metadata = {
  title: "Galería cinematográfica de Darién",
  description:
    "Fotografías y videos de la selva, ríos, cascadas, playas, montañas y comunidades de Darién, Panamá. Una aventura sin límites.",
  alternates: { canonical: "/galeria" },
  openGraph: { title: "Darién, una aventura sin límites · XPLORA DARIÉN", images: ["/media/imagen/img3.webp"] },
};

export default function GaleriaPage() {
  return (
    <main>
      <GalleryHero />

      <section id="galeria" className="scroll-mt-4 bg-sand-50 px-5 pt-20 sm:px-10">
        <div id="destinos" className="mx-auto max-w-7xl scroll-mt-4">
          <header className="mb-10 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600"><T es="Por pueblo y destino" en="By town and destination" /></p>
            <ScrollHeadline text="Cada lugar, su propia galería" en="Every place, its own gallery" className="mt-2 font-display text-4xl text-forest-900 sm:text-5xl" />
          </header>
          <DestinationGrid />
        </div>
      </section>

      <ExpandShowcase />

      <section className="bg-sand-50 px-5 py-20 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-10 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600"><T es="Colecciones" en="Collections" /></p>
            <ScrollHeadline text="Doce maneras de mirar Darién" en="Twelve ways to see Darién" className="mt-2 font-display text-4xl text-forest-900 sm:text-5xl" />
          </header>
          <CategoryBento />
        </div>
      </section>

      <section className="bg-forest-950 px-5 py-20 sm:px-10" aria-labelledby="videos-title">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold-300"><T es="Darién en movimiento" en="Darién in motion" /></p>
          <h2 id="videos-title" className="sr-only">Videos</h2>
          <div className="mt-2">
            <VideoGallery filter={{}} />
          </div>
        </div>
      </section>

      <section className="bg-sand-50 px-5 py-20 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600"><T es="Fotografía" en="Photography" /></p>
              <ScrollHeadline text="Toda la galería" en="The full gallery" className="mt-2 font-display text-4xl text-forest-900 sm:text-5xl" />
            </div>
            <p className="max-w-sm text-sm text-earth-700">
              <T
                es="Fotografías originales del equipo y la comunidad de XPLORA DARIÉN. Toca una imagen para verla en pantalla completa."
                en="Original photos by the XPLORA DARIÉN team and community. Tap an image to view it full screen."
              />
            </p>
          </header>
          <MasonryGallery filter={{}} />
        </div>
      </section>
    </main>
  );
}
