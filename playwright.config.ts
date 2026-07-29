import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.FIELDOPS_TEST_PORT ?? 8080);
const BASE_URL = process.env.FIELDOPS_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * The scene is WebGL, so headless Chromium needs SwiftShader to rasterize
 * anything at all. Deterministic seeds + an analytic heightfield mean the same
 * deep link always renders the same frame, which is what makes the golden
 * screenshot suite in tests/visual.spec.ts viable.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Shader/driver noise between machines is real; catch layout and colour
      // regressions, not single-pixel dithering.
      maxDiffPixelRatio: 0.02,
      threshold: 0.25,
    },
  },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-swiftshader",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--force-device-scale-factor=1",
          ],
        },
      },
    },
  ],
  // Builds its own preset-free bundle: the Vercel output is one serverless
  // function with no static HTML, so `vite preview` cannot serve it.
  webServer: process.env.FIELDOPS_BASE_URL
    ? undefined
    : {
        command: `npm run build:preview && npm run preview -- --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
