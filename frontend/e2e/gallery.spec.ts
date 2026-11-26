import { expect, test } from "@playwright/test";

test.describe("Cinematic Gallery", () => {
  test("hero cinematográfico con título, subtítulo y botones funcionales", async ({ page }) => {
    await page.goto("/galeria");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Darién, una aventura\s*sin límites/i);
    await expect(page.getByText("Explora la naturaleza, descubre su cultura y vive experiencias extraordinarias.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Explorar paquetes/i })).toHaveAttribute("href", "/paquetes");
    await page.getByRole("link", { name: /Descubrir galería/i }).click();
    await expect(page).toHaveURL(/#galeria$/);
    await expect(page.getByRole("heading", { name: "Cada lugar, su propia galería" })).toBeInViewport();
  });

  test("12 categorías editoriales con portada y enlace propio", async ({ page }) => {
    await page.goto("/galeria");
    const cards = page.locator('main a[href^="/galeria/"]:not([href^="/galeria/destino/"])');
    await expect(cards).toHaveCount(12);
    await expect(cards.first()).toHaveAttribute("href", /^\/galeria\/[a-z-]+$/);
    await cards.filter({ hasText: "Ríos y cascadas" }).click();
    await expect(page).toHaveURL(/\/galeria\/rios-cascadas$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ríos y cascadas");
    await expect(page.getByText(/\d+ fotografías · \d+ videos/)).toBeVisible();
  });

  test("galería organizada por pueblo o destino", async ({ page }) => {
    await page.goto("/galeria");
    const dests = page.locator('#destinos a[href^="/galeria/destino/"]');
    await expect(dests.first()).toBeVisible();
    expect(await dests.count()).toBeGreaterThanOrEqual(10);
    await expect(page.locator('#destinos a[href="/galeria/destino/la-palma"]')).toHaveCount(0); // solo fotos sin verificar
    await dests.filter({ hasText: "Parque Nacional Darién" }).click();
    await expect(page).toHaveURL(/\/galeria\/destino\/parque-nacional-darien$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Parque Nacional Darién");
    await expect(page.getByRole("link", { name: /Conoce este destino/i })).toHaveAttribute("href", "/mapa?lugar=parque-nacional-darien");
    await expect(page.getByRole("button", { name: /^Ver / }).first()).toBeVisible();
  });

  test("la portada da acceso a la galería, paquetes y administración", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Ver galería/i })).toHaveAttribute("href", "/galeria");
    await expect(page.getByRole("link", { name: /Administración/i })).toHaveAttribute("href", "/admin");
    await expect(page.getByRole("link", { name: /Ver paquetes turísticos/i })).toHaveAttribute("href", "/paquetes");
  });

  test("masonry con carga bajo demanda", async ({ page }) => {
    await page.goto("/galeria/destinos-turisticos");
    const tiles = page.getByRole("button", { name: /^Ver / });
    await expect(tiles).toHaveCount(24);
    await page.getByRole("button", { name: "Cargar más fotografías" }).click();
    // El scroll infinito puede sumar otra página por su cuenta: basta con que cargue más.
    await expect.poll(() => tiles.count()).toBeGreaterThanOrEqual(48);
  });

  test("lightbox: abrir, navegar con teclado, zoom, CTA y cerrar", async ({ page }) => {
    await page.goto("/galeria/rios-cascadas");
    await page.getByRole("button", { name: "Ver Cascada Arenal" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^1 \/ \d+$/)).toBeVisible();
    // Procedencia visible y botón que lleva al destino en el mapa
    await expect(dialog.getByText(/Lugar indicado por el autor/)).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Conoce este destino/i })).toHaveAttribute("href", "/mapa?lugar=cascada-arenal");
    await expect(dialog.getByRole("link", { name: /Solicitar reserva/i })).toHaveAttribute("href", /\/reservar\?/);

    await dialog.getByRole("button", { name: "Acercar" }).click();
    await expect(dialog.getByText("150%")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByText(/^2 \/ \d+$/)).toBeVisible();
    await expect(dialog.getByText("100%")).toBeVisible(); // zoom se reinicia por foto
    await page.keyboard.press("ArrowLeft");
    await expect(dialog.getByText(/^1 \/ \d+$/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("las fotos sin lugar verificado no se atribuyen a un destino", async ({ page, request }) => {
    const api = process.env.E2E_API_URL ?? "http://localhost:8080/api/v1";
    const list = await (await request.get(`${api}/gallery/media?type=photo&limit=60&category=playas-costas`)).json();
    const coast = list.items.find((m: { title: string }) => m.title === "Costa del Pacífico panameño");
    test.skip(!coast, "sin fotos de la costa no identificada");
    const detail = await (await request.get(`${api}/gallery/media/${coast.id}`)).json();
    expect(detail.destinations).toEqual([]);
    await page.goto("/galeria/playas-costas");
    await page.getByRole("button", { name: "Ver Costa del Pacífico panameño" }).first().click();
    await expect(page.getByRole("dialog").getByText(/no lo atribuimos a un destino/)).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("link", { name: /Conoce este destino/i })).toHaveCount(0);
  });

  test("videos: solo pósters al cargar; el video se descarga al reproducir", async ({ page }) => {
    const mp4: string[] = [];
    page.on("request", (r) => r.url().endsWith(".mp4") && mp4.push(r.url()));
    await page.goto("/galeria/rios-cascadas");
    const cards = page.getByRole("button", { name: /^Reproducir / });
    await expect(cards.first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(mp4, "no se descargan videos antes de reproducir").toHaveLength(0);

    await cards.first().click();
    const dialog = page.getByRole("dialog");
    const video = dialog.locator("video");
    await expect(video).toHaveAttribute("controls", "");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
    expect(mp4.length).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("filtro de formato de video (verticales)", async ({ page }) => {
    await page.goto("/galeria/videos-promocionales");
    await page.getByRole("tab", { name: "Verticales" }).click();
    await expect(page.getByRole("tab", { name: "Verticales" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /^Reproducir / }).first()).toBeVisible();
  });

  test("imágenes optimizadas en formatos modernos", async ({ page }) => {
    const formats = new Set<string>();
    page.on("response", (r) => r.url().includes("/_next/image") && formats.add(r.headers()["content-type"] ?? ""));
    await page.goto("/galeria");
    await page.waitForLoadState("networkidle");
    expect([...formats].some((f) => f === "image/avif" || f === "image/webp")).toBeTruthy();
  });
});
