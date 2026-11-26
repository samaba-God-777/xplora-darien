/**
 * Resuelve rutas de recursos originales a URLs públicas.
 * `frontend/public/media/imagen` y `frontend/public/media/instagram` son enlaces
 * simbólicos a `pageWeb/imagen` y `pageWeb/review/instagram` (sin copias).
 */
const FILES_URL = (process.env.NEXT_PUBLIC_FILES_URL ?? "http://localhost:8080/files").replace(/\/$/, "");
const encode = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/**
 * Archivos propios (subidas, generados, pósters) → API /files.
 * Fotos de imagen/ e instagram/ → su versión HD (Real-ESRGAN, storage/media-hd, mismo nombre); videos → /media.
 */
const HD_PHOTO = /^(imagen|instagram)\/.+\.(jpe?g|png|webp)$/i;

export function mediaUrl(path: string): string {
  if (/^(uploads|generated|posters)\//.test(path)) return `${FILES_URL}/${encode(path)}`;
  return `/${HD_PHOTO.test(path) ? "media-hd" : "media"}/${encode(path)}`;
}

/** URL del archivo original (sin mejorar), por ejemplo para comparar. */
export const originalMediaUrl = (path: string) => `/media/${encode(path)}`;

export const BRAND_LOGO = mediaUrl("instagram/profile/xplore_darien_avatar.jpg");

/** Portada de un destino; si no tiene fotografía verificada se usa el logotipo. */
export const coverOf = (photos: string[]) => (photos[0] ? mediaUrl(photos[0]) : BRAND_LOGO);

/** Anchos que acepta el optimizador de imágenes (deviceSizes + imageSizes en next.config.ts). */
type OptWidth = 96 | 160 | 256 | 384 | 640 | 828 | 1080 | 1440 | 1920 | 2560;

/**
 * Versión redimensionada (AVIF/WebP) de una imagen local para usar en <img> o texturas WebGL,
 * así una miniatura no descarga la foto HD completa.
 */
export function sized(url: string, w: OptWidth, q: 65 | 70 | 75 | 80 | 85 = 75): string {
  if (!url.startsWith("/") || url.startsWith("/_next/")) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${q}`;
}
