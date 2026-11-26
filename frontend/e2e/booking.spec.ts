import { expect, test } from "@playwright/test";

test.describe("Paquetes y reservas", () => {
  test("paquetes: lista o estado vacío honesto", async ({ page, request }) => {
    const api = process.env.E2E_API_URL ?? "http://localhost:8080/api/v1";
    const pkgs = await (await request.get(`${api}/packages`)).json();
    await page.goto("/paquetes");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paquetes turísticos");
    if (pkgs.length === 0) {
      await expect(page.getByText("Todavía no hay paquetes publicados.", { exact: false })).toBeVisible();
    } else {
      await expect(page.getByRole("link", { name: new RegExp(pkgs[0].name) })).toBeVisible();
    }
  });

  test("reservar desde un destino sin paquetes ofrece contacto, no un formulario vacío", async ({ page, request }) => {
    const api = process.env.E2E_API_URL ?? "http://localhost:8080/api/v1";
    const pkgs = await (await request.get(`${api}/packages`)).json();
    test.skip(pkgs.some((p: { destinations: { slug: string }[] }) => p.destinations.some((d) => d.slug === "cascada-arenal")), "ya hay paquete para el destino");
    await page.goto("/reservar?destino=cascada-arenal");
    await expect(page.getByText("Aún no hay paquetes publicados para este destino.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "@xplore_darien" })).toHaveAttribute("href", "https://www.instagram.com/xplore_darien/");
  });
});
