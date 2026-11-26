import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pruebas E2E de XPLORA DARIÉN (frontend/e2e).
 * Requiere la API Rust en marcha (http://localhost:8080) con las semillas cargadas.
 * El frontend se reutiliza si ya corre en :3000; si no, se arranca `npm run dev`.
 *
 * Credenciales del panel: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD, o el usuario de prueba
 * local definido en backend/.env (ADMIN_EMAIL / ADMIN_PASSWORD). Nunca credenciales reales.
 */
function localAdmin() {
  try {
    const env = readFileSync(join(__dirname, "../backend/.env"), "utf8");
    const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
    return { email: get("ADMIN_EMAIL"), password: get("ADMIN_PASSWORD") };
  } catch {
    return {};
  }
}
const admin = localAdmin();
process.env.E2E_ADMIN_EMAIL ??= admin.email ?? "";
process.env.E2E_ADMIN_PASSWORD ??= admin.password ?? "";

// Usa el Chrome instalado (más rápido que descargar Chromium); E2E_CHANNEL=chromium para el incluido.
const channel = process.env.E2E_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "./e2e-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // El sitio detecta el idioma del navegador; las pruebas parten en español.
    locale: "es-PA",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel }, testMatch: /(gallery|map)\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
