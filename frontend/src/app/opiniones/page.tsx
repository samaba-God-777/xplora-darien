import type { Metadata } from "next";
import { ReviewsPage } from "@/features/site/pages";

export const metadata: Metadata = {
  title: "Opiniones de viajeros",
  description: "Lo que dicen quienes viajaron a Darién con XPLORA DARIÉN. Deja tu propia opinión.",
  alternates: { canonical: "/opiniones" },
};

export default function Page() {
  return <ReviewsPage />;
}
