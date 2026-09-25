// Census/proof config: runs ONLY matrx/no-navigation-for-query-state over the
// tree, fast. `node_modules/.bin/eslint -c scripts/lint-rules/no-navigation-for-query-state.census.config.mjs features app lib hooks components providers`
// Set URL_STATE_CENSUS_PUSH=1 to extend the router check to router.push.
import tseslint from "typescript-eslint";
import { noNavigationForQueryState } from "./no-navigation-for-query-state.mjs";

export default [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/*.md"] },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: { matrx: { rules: { "no-navigation-for-query-state": noNavigationForQueryState } } },
    rules: {
      "matrx/no-navigation-for-query-state": [
        "error",
        { push: process.env.URL_STATE_CENSUS_PUSH === "1" },
      ],
    },
  },
];
