import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Tamaños responsive generados por el optimizador (sharp). Solo WebP: las fotos HD (hasta 2560 px)
    // tardan demasiado en codificarse a AVIF y saturan el servidor.
    formats: ["image/webp"],
    deviceSizes: [640, 828, 1080, 1440, 1920, 2560],
    imageSizes: [96, 160, 256, 384],
    qualities: [65, 70, 75, 80, 85],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // En desarrollo la API vive en localhost; en producción /files está en un dominio público.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    remotePatterns: [
      // Archivos propios servidos por la API (subidas, videos generados, pósters).
      new URL(`${(process.env.NEXT_PUBLIC_FILES_URL ?? "http://localhost:8080/files").replace(/\/$/, "")}/**`),
    ],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
