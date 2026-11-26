import { expect, test } from "@playwright/test";

test.describe("Mapa de Darién", () => {
  test("muestra los 17 destinos desde la API y abre la ficha al tocar un punto", async ({ page }) => {
    const api = page.waitForResponse((r) => r.url().includes("/map/points") && r.status() === 200);
    await page.goto("/mapa");
    await api;
    const markers = page.locator(".xd-marker");
    await expect(markers).toHaveCount(17);
    await page.locator('.xd-marker[data-slug="playa-muerto"]').click();
    await expect(page).toHaveURL(/lugar=playa-muerto/);
    const reveal = page.getByRole("dialog", { name: "Playa Muerto" });
    await expect(reveal).toBeVisible();
    await expect(reveal.getByRole("link", { name: /Solicitar este viaje/ })).toHaveAttribute("href", "/reservar?destino=playa-muerto");
    await reveal.getByRole("button", { name: /Explorar el lugar/ }).click();
    await expect(reveal).toBeHidden();
    const panel = page.getByRole("article");
    await expect(panel.getByRole("heading", { name: "Playa Muerto" })).toBeVisible();
    await expect(panel.getByText("Qué puedes hacer")).toBeVisible();
    await expect(panel.getByText("Ubicación aproximada")).toBeVisible();
    await panel.getByRole("button", { name: "Cerrar" }).click();
    await expect(page).not.toHaveURL(/lugar=/);
  });

  test("solicitar este viaje lleva a reservas con el destino", async ({ page }) => {
    await page.goto("/mapa");
    await page.locator('.xd-marker[data-slug="cascada-arenal"]').dispatchEvent("click");
    await page.getByRole("dialog").getByRole("link", { name: /Solicitar este viaje/ }).click();
    await expect(page).toHaveURL(/\/reservar\?destino=cascada-arenal/);
  });

  test("un lugar sin fotos verificadas no muestra imágenes ajenas", async ({ page }) => {
    await page.goto("/mapa?lugar=la-palma");
    await expect(page.getByRole("heading", { name: "La Palma" })).toBeVisible();
    await expect(page.getByText("Aún no hay fotografías verificadas de este lugar.")).toBeVisible();
  });

  test("cambia a inglés", async ({ page }) => {
    await page.goto("/mapa");
    await page.getByRole("button", { name: /Cambiar idioma/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Map of Darién");
  });

  test("alterna entre relieve 3D y vista 2D y recuerda la elección", async ({ page }) => {
    await page.goto("/mapa");
    const toggle = page.getByRole("button", { name: /Vista 2D|Relieve 3D/ });
    const initial = await toggle.getAttribute("aria-pressed");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", initial === "true" ? "false" : "true");
    await page.reload();
    await expect(page.getByRole("button", { name: /Vista 2D|Relieve 3D/ })).toHaveAttribute("aria-pressed", initial === "true" ? "false" : "true");
  });
});
