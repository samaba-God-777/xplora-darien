import { expect, test } from "@playwright/test";

test.describe("Idioma y fechas disponibles", () => {
  test("el sitio cambia a inglés y lo recuerda entre páginas", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Cambiar idioma/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Explore the");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/paquetes");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tour packages");
    await page.goto("/terminos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms and conditions");
    await expect(page.getByText(/By requesting a booking/)).toBeVisible();
  });

  test("elegir una fecha de la ficha la lleva a reservas con paquete y fecha", async ({ page, request }) => {
    const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
    const pkgs: { slug: string; availableDates: { date: string }[] }[] = await (await request.get(`${api}/packages`)).json();
    const pkg = pkgs.find((p) => p.availableDates.length > 0);
    test.skip(!pkg, "No hay paquetes con fechas abiertas");
    const date = pkg!.availableDates[0].date;
    await page.goto(`/paquetes/${pkg!.slug}`);
    await page.locator(`a[href="/reservar?paquete=${pkg!.slug}&fecha=${date}"]`).click();
    await expect(page).toHaveURL(new RegExp(`fecha=${date}`));
    await expect(page.locator("#package")).toHaveValue(pkg!.slug);
    await expect(page.locator("#date")).toHaveValue(date);
    await expect(page.getByRole("button", { pressed: true })).toBeVisible();
  });
});
