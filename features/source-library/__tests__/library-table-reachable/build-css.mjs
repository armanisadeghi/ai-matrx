// build-css.mjs — compile REAL Tailwind CSS for fixture.html, not a guess.
//
// Same recipe as
// features/masterwork/components/detail/__tests__/rule-row-squeeze/build-css.mjs:
// runs the project's own PostCSS pipeline (`@tailwindcss/postcss`, the same
// plugin `postcss.config.mjs` wires into `next dev`/`next build`) against
// `app/globals.css`, so the guard measures against the actual utility
// definitions and design tokens this repo ships — never a hand-copied
// approximation. Tailwind v4's automatic content detection scans the project
// tree for class candidates, and `fixture.html` sits inside it, so both the
// pre-fix and post-fix class sets it carries are picked up with no `@source`
// line needed.
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const GLOBALS = path.join(ROOT, "app/globals.css");
const OUT = path.join(HERE, "compiled.css");

async function main() {
  const css = readFileSync(GLOBALS, "utf8");
  const result = await postcss([tailwindcss(), autoprefixer()]).process(css, {
    from: GLOBALS,
    to: OUT,
  });
  writeFileSync(OUT, result.css);
  // eslint-disable-next-line no-console
  console.log(`[library-table-reachable] compiled ${result.css.length} bytes -> ${OUT}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[library-table-reachable] CSS compile failed:", err);
  process.exit(1);
});
