import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingForm } from "@/features/packages/BookingForm";

export const metadata: Metadata = {
  title: "Solicitar reserva",
  description: "Solicita tu reserva en Darién. El equipo verificará la disponibilidad antes de confirmarla.",
  robots: { index: false },
};

export default function ReservarPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-sand-50" />}>
      <BookingForm />
    </Suspense>
  );
}
