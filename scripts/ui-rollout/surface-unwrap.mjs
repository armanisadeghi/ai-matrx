#!/usr/bin/env node
/**
 * WAVE 2 — put a file's wave-1 `SurfaceButton` sites back in front of the button-door codemod.
 *
 * Wave 1 parked sites it could not convert as `SurfaceButton` (`Button as SurfaceButton` from the
 * package root). The codemod skips that alias, so this rewrites each named file's `<SurfaceButton>`
 * tags to the file's Button: onto the door Button when the file already imports it, otherwise the
 * package-root import becomes plain `Button` (which the codemod then moves to the door). Run the
 * codemod with `--write --derive-labels` on the same files right after; whatever it still cannot
 * convert it parks as `SurfaceButton` again.
 *
 *   node scripts/ui-rollout/surface-unwrap.mjs <files...>
 */
import fs from "node:fs";

const SURFACE_IMPORT = /(import\s*\{[^}]*?)\bButton as SurfaceButton\b\s*,?\s*([^}]*\}\s*from\s*["']@ai-matrx\/design-system["'];?)/;
for (const file of process.argv.slice(2)) {
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("SurfaceButton")) continue;
  const doorButton = /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*["']@\/components\/ui\/button["']/.test(s);
  const pkgPlainButton = /import\s*\{[^}]*(?<!as )\bButton\b(?! as)[^}]*\}\s*from\s*["']@ai-matrx\/design-system["']/.test(s);
  if (doorButton || pkgPlainButton) {
    s = s.replace(SURFACE_IMPORT, (_, a, b) => `${a}${b}`).replace(/import\s*\{\s*\}\s*from\s*["']@ai-matrx\/design-system["'];?\n?/, "");
  } else {
    s = s.replace("Button as SurfaceButton", "Button");
  }
  s = s.replace(/<SurfaceButton\b/g, "<Button").replace(/<\/SurfaceButton>/g, "</Button>");
  if (/\bSurfaceButton\b/.test(s)) {
    console.error(`${file}: non-JSX SurfaceButton reference left as is`);
    continue;
  }
  fs.writeFileSync(file, s);
  console.log(`unwrapped ${file}`);
}
