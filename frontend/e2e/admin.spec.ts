import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? "";

async function login(page: Page) {
  await page.goto("/admin/medios");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Media Management Studio" })).toBeVisible();
}

test.describe("Panel administrativo", () => {
  test.skip(!email || !password, "define E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (usuario de prueba local)");

  test("login incorrecto muestra error", async ({ page }) => {
    await page.goto("/admin/medios");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill("contraseña-incorrecta");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Correo o contraseña incorrectos");
  });

  test("Media Studio: estadísticas, filtros y edición con guardado", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Fotos publicadas")).toBeVisible();
    await page.getByLabel("Tipo").selectOption("video");
    await expect(page.getByText(/^\d+ recursos$/)).toHaveText(/^1[0-9] recursos$/);
    await page.getByLabel("Tipo").selectOption("");

    await page.getByPlaceholder("Buscar título, descripción o archivo").fill("arenal.jpg");
    await page.locator("main ul li button").filter({ hasText: "Cascada Arenal" }).first().click();
    const drawer = page.getByRole("dialog");
    const tags = drawer.getByLabel("Etiquetas (separadas por coma)");
    const previous = await tags.inputValue();
    await tags.fill([previous, "e2e"].filter(Boolean).join(", "));
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/admin/media/"));
    await drawer.getByRole("button", { name: "Guardar", exact: true }).click();
    expect((await saved).status()).toBe(204);
    await expect(drawer).toBeHidden();

    // Restaurar el estado original
    await page.locator("main ul li button").filter({ hasText: "Cascada Arenal" }).first().click();
    await page.getByRole("dialog").getByLabel("Etiquetas (separadas por coma)").fill(previous);
    await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("eliminar exige escribir ELIMINAR", async ({ page }) => {
    await login(page);
    await page.locator("main ul li button").first().click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Eliminar" }).click();
    const confirm = drawer.getByRole("alertdialog");
    await expect(confirm.getByRole("button", { name: "Eliminar" })).toBeDisabled();
    await confirm.getByLabel("Escribe ELIMINAR").fill("eliminar");
    await expect(confirm.getByRole("button", { name: "Eliminar" })).toBeDisabled();
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    await drawer.getByRole("button", { name: "Cerrar" }).click();
  });

  test("AI Video Studio: plantillas, modelos según el modo y formatos admitidos", async ({ page, request }) => {
    await login(page);
    await page.getByRole("link", { name: /AI Video Studio/ }).click();
    await expect(page.getByRole("heading", { name: "XPLORA AI Video Studio" })).toBeVisible();

    // Estado honesto de la configuración de Higgsfield
    const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem("xd.session") ?? "{}").token);
    const api = process.env.E2E_API_URL ?? "http://localhost:8080/api/v1";
    const status = await (await request.get(`${api}/admin/ai/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (!status.configured) await expect(page.getByText("Higgsfield no está configurado.")).toBeVisible();

    // Plantilla → prompt editable
    await page.getByRole("button", { name: "Selva de Darién" }).click();
    await expect(page.getByLabel("Prompt (editable antes de enviar)")).toHaveValue(/rainforest of Darién/);

    // Texto a video: un modelo con aspect_ratio habilita solo los formatos documentados
    await page.getByLabel("Modelo").selectOption("kling-video/v3.0/pro/text-to-video");
    await expect(page.getByRole("button", { name: /Vertical · 9:16/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /Horizontal · 16:9/ })).toBeEnabled();
    await expect(page.getByText("Secuencia de varios planos (opcional)")).toBeVisible();

    // Modelo sin aspect_ratio documentado
    await page.getByLabel("Modelo").selectOption("minimax/hailuo-2.3/standard/text-to-video");
    await expect(page.getByText("no se puede elegir el formato")).toBeVisible();

    // Imagen a video: solo modelos image-to-video
    await page.getByRole("tab", { name: /Animar una fotografía/ }).click();
    const options = await page.getByLabel("Modelo").locator("option").allTextContents();
    expect(options.slice(1).every((o) => /image to video|Image to video|imagen/i.test(o))).toBeTruthy();

    // Sin credenciales no se puede estimar ni generar
    if (!status.configured) {
      await page.getByLabel("Modelo").selectOption("kling-video/v2.5-turbo/pro/image-to-video");
      await expect(page.getByRole("button", { name: "Estimar costo" })).toBeDisabled();
    }
  });
});
