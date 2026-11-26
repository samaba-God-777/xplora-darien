import { Suspense } from "react";
import { PackageDetail } from "@/features/packages/PackageDetail";

export default function PaquetePage() {
  return (
    <Suspense fallback={<div className="min-h-svh animate-pulse bg-forest-950" />}>
      <PackageDetail />
    </Suspense>
  );
}
