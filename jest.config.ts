/**
 * Jest configuration.
 *
 * Phase 1 D1.1: testEnvironment is `jsdom` so sync-engine tests that touch
 * DOM/localStorage/matchMedia can run (pre-paint, persistence, channel).
 * Node-only tests continue to pass under jsdom.
 *
 * Phase 2: `setupFiles` polyfills `structuredClone` — Dexie needs it and
 * jsdom scrubs the Node global from the test environment.
 *
 * The previously-present `jest.config.js.ts` was a misnomed file that Jest
 * never picked up (Jest looks for `jest.config.{js,ts,mjs,cjs,json}`) —
 * effectively the repo had no Jest config. PR 1.A replaces it with this.
 */
import type { Config } from "jest";

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "jsdom",
    // TypeScript 5.9 (TS5011) demands an explicit compiler rootDir when the
    // inferred common source directory collapses to a single test folder.
    // The repo tsconfig only sets rootDir inside its ts-node section, which
    // ts-jest never reads — without this override EVERY suite fails to
    // compile before a single test runs.
    // `[tj]sx?` + allowJs: plain .js modules (the un-ignored ESM-only `uuid`
    // package below) must ALSO be transpiled to CJS — the previous
    // tsx?-only mapping left .js files with no transformer at all, so
    // "transform uuid" could never actually work.
    transform: {
        "^.+\\.[tj]sx?$": [
            "ts-jest",
            { tsconfig: { rootDir: ".", allowJs: true } },
        ],
    },
    setupFiles: ["<rootDir>/jest.setup.ts"],
    // CSS / static assets have no Jest loader. Without these, a side-effect
    // import like `@xyflow/react/dist/style.css` reaches ts-jest, gets parsed
    // as TypeScript, and dies with `SyntaxError: Unexpected token '.'` —
    // failing every suite that transitively imports the module (it killed the
    // whole `features/files` barrel chain, and with it process-stream's suites).
    // Listed BEFORE the `@/` alias so asset requests never fall through to it.
    moduleNameMapper: {
        "\\.(css|less|sass|scss)$": "<rootDir>/test-utils/style-mock.ts",
        "\\.(gif|ttf|eot|otf|woff|woff2|png|jpe?g|webp|avif|mp4|webm|wav|mp3|m4a|aac|oga)$":
            "<rootDir>/test-utils/style-mock.ts",
        "^@/(.*)$": "<rootDir>/$1",
    },
    // Transform ESM-only `uuid` instead of ignoring it. The lookahead must
    // also skip pnpm's virtual-store prefix: real paths look like
    // `node_modules/.pnpm/uuid@13.0.0/node_modules/uuid/dist-node/index.js`,
    // so a bare `(?!uuid)` matches at the FIRST `/node_modules/` (followed by
    // `.pnpm`) and the file stays untransformed — the "Unexpected token
    // 'export'" failure for any suite that transitively imports uuid.
    // The lookahead must ALSO name the ESM-only unified/unist/hast/mdast/
    // micromark ecosystem: pnpm nests real packages a second level deep
    // (`.pnpm/unist-util-visit@5/node_modules/unist-util-visit/index.js`), so a
    // bare `(?!\.pnpm/)` only clears the FIRST `/node_modules/` — the nested
    // `/node_modules/unist-util-visit/` position still matches and the file
    // stays untransformed ("Unexpected token 'export'"). Listing the package
    // prefixes makes that nested position fail the ignore, so ESM markdown
    // deps (needed by rehypeSafeRawHtml et al.) get transpiled to CJS.
    transformIgnorePatterns: [
      "/node_modules/(?!\\.pnpm/|uuid|unist|hast|mdast|micromark|remark|rehype|unified|vfile|property-information|space-separated-tokens|comma-separated-tokens|web-namespaces|zwitch|html-void-elements|html-url-attributes|ccount|character-entities|character-reference-invalid|decode-named-character-reference|stringify-entities|parse-entities|trim-lines|bail|trough|devlop|longest-streak|markdown-table|estree|mathml-tag-names|parse5).+\\.js$",
    ],
    testPathIgnorePatterns: ["/node_modules/", "/.next/", "/.claude/"],
    // Restrict to *.test.ts(x) / *.spec.ts(x). Jest's default `testMatch`
    // also globs everything under `**/__tests__/**`, which picked up our
    // handrolled tsx-runnable `*.script.ts` files (extract-json.script.ts,
    // scope-mapping.script.ts) and reported them as failed suites because
    // they have no `describe`/`it` blocks. Restricting `testMatch` makes
    // the file extension authoritative — Jest only runs real Jest tests.
    testMatch: ["**/?(*.)+(test|spec).[jt]s?(x)"],
};

export default config;
