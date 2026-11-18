import { expect, test } from "@playwright/test";

/**
 * Core loop happy path against a REAL Supabase project (BACKLOG M0-01 / CLAUDE.md rule 9).
 * Requires: E2E_BASE_URL, E2E_EMAIL, and a way to read the OTP. With Supabase local dev
 * (`supabase start`) set E2E_MAILPIT_URL (e.g. http://127.0.0.1:54324) so the test can read the code.
 * Skipped when not configured — NOT run in the build session (no Supabase available there).
 */
const ready = !!(process.env.E2E_BASE_URL && process.env.E2E_EMAIL && process.env.E2E_MAILPIT_URL);

test.skip(!ready, "Set E2E_BASE_URL, E2E_EMAIL, E2E_MAILPIT_URL to run against Supabase");

async function latestCode(request: import("@playwright/test").APIRequestContext): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = await (await request.get(`${process.env.E2E_MAILPIT_URL}/api/v1/messages`)).json();
    const msg = list.messages?.find((m: { To: { Address: string }[] }) => m.To.some((t) => t.Address === process.env.E2E_EMAIL));
    if (msg) {
      const full = await (await request.get(`${process.env.E2E_MAILPIT_URL}/api/v1/message/${msg.ID}`)).json();
      const code = String(full.Text).match(/\b(\d{6,10})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("No OTP email arrived");
}

test("sign in → onboard → log a manual meal → see it on the dashboard", async ({ page, request }) => {
  await page.goto(process.env.E2E_INVITE ? `/invite/${process.env.E2E_INVITE}` : "/login");
  await page.getByLabel("Your email").fill(process.env.E2E_EMAIL!);
  await page.getByRole("button", { name: /Send me a code/ }).click();
  await page.getByLabel("Code").fill(await latestCode(request));
  await page.getByRole("button", { name: "Sign in" }).click();

  if (page.url().includes("/onboarding")) {
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next" }).click();
    await page.getByText("Store my health details").click();
    await page.getByText(/It is not medical advice/).click();
    await page.getByRole("button", { name: /Let's cook/ }).click();
  }
  await expect(page).toHaveURL(/\/today/);
  await page.goto("/log");
  await page.getByLabel("Dish").fill("Egg podimas");
  await page.getByLabel("Calories (kcal)").fill("320");
  await page.getByLabel("Protein (g)").fill("21");
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page).toHaveURL(/\/today/);
  await page.goto("/dashboard");
  await expect(page.getByText("Egg podimas")).toBeVisible();
});
