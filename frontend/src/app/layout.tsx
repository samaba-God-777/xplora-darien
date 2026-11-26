import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PublicChrome } from "@/features/site/site";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz", "SOFT"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "XPLORA DARIÉN · Explora lo extraordinario",
    template: "%s · XPLORA DARIÉN",
  },
  description:
    "Descubre Darién, Panamá: cascadas, selva, playas, comunidades y paquetes turísticos con guías locales.",
  openGraph: {
    siteName: "XPLORA DARIÉN",
    locale: "es_PA",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f4d2b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>
          {children}
          {/* Lee la URL (oculta el pie en el panel): va dentro de Suspense para no bloquear el prerender. */}
          <Suspense fallback={null}>
            <PublicChrome />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
