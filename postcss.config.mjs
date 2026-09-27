/** @type {import('postcss-load-config').Config} */
import { fileURLToPath } from "node:url";

// LAST: never hand Turbopack a dependency outside the project root. While pnpm
// relinks a package, Tailwind registers "/" and every ancestor as a
// dir-dependency; the Turbopack loader throws on those and every route 500'd
// until a restart (scripts/postcss/keep-dependencies-in-root.cjs). Keyed by an
// ABSOLUTE path: Turbopack loads PostCSS plugins from its own build-chunk
// directory, where a "./scripts/..." key does not resolve.
const keepDependenciesInRoot = fileURLToPath(new URL("./scripts/postcss/keep-dependencies-in-root.cjs", import.meta.url));

const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
    [keepDependenciesInRoot]: {},
  },
};
export default config;
