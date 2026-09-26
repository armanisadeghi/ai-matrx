import { defineConfig } from "@playwright/test";

/**
 * Real-browser hit-testing gate for EntityRef's hover-revealed doors. jsdom
 * cannot measure opacity, media queries, or elementFromPoint, which are the
 * three failure boundaries this gate protects.
 */
export default defineConfig({
  testDir: "./components/official/entity-ref/__tests__/browser",
  testMatch: /.*\.spec\.ts$/,
  reporter: [["list"]],
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 720 } } },
    {
      name: "phone-390",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
