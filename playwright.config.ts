import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "off",
    // Optional: point at a preinstalled Chromium (e.g. CI images) instead of `playwright install`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "iphone-375", use: { ...devices["iPhone SE"], browserName: "chromium" } },
    { name: "iphone-430", use: { ...devices["iPhone 15 Pro Max"], browserName: "chromium" } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
});
