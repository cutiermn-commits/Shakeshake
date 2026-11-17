import { expect, test } from "@playwright/test";

test("landing, privacy and login render without horizontal scroll", async ({ page }) => {
  for (const path of ["/", "/privacy", "/login", "/invite/ABCD2345", "/offline"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
  await page.goto("/invite/abcd2345");
  await expect(page.getByLabel(/Invite code/)).toHaveValue("ABCD2345");
});

test("disclaimer and AI data-use disclosure are visible (M6-02)", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText("It is not medical advice")).toBeVisible();
  await expect(page.getByText(/may be used to improve its products/)).toBeVisible();
});

test("PWA manifest is installable-shaped (M0-03)", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBe("Shake Shake");
  expect(m.display).toBe("standalone");
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect((await request.get("/sw.js")).ok()).toBeTruthy();
  expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBeTruthy();
});

test("tap targets on login are ≥ 44 px (WCAG/iOS)", async ({ page }) => {
  await page.goto("/login");
  for (const el of await page.locator("button, input").all()) {
    const box = await el.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test("cron endpoint rejects calls without the secret", async ({ request }) => {
  expect((await request.post("/api/cron/dispatch")).status()).toBe(401);
});
