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
        // Syntax highlighting is never what a test asserts, and the real
        // package's ESM `refractor` chain kills the suite at import — see the
        // stub's header. Mapped before the `@/` alias like the asset mocks.
        "^react-syntax-highlighter(/.*)?$":
            "<rootDir>/test-utils/syntax-highlighter-mock.tsx",
        // Our own published `@ai-matrx/*` packages ship an `exports` subpath
        // map. Jest's default resolver does NOT honour `exports`, so a shipped
        // import like `@ai-matrx/agents/stream/ndjson` resolves to nothing and
        // the suite dies at import — 74 suites repo-wide the day the frontend
        // started consuming the published stream runtime. Map the subpaths to
        // dist directly (they are also listed in transformIgnorePatterns below,
        // because the published files are ESM).
        "^@ai-matrx/([^/]+)/package\\.json$":
            "<rootDir>/node_modules/@ai-matrx/$1/package.json",
        // Some `@ai-matrx/agents` subpaths have a DIRECTORY dist target
        // (dist/<name>/index.js), so they must be mapped BEFORE the generic
        // subpath rule below — which would resolve `./mandates` to
        // dist/mandates.js and fail with "Could not locate module". Every new
        // directory subpath the package publishes belongs in this alternation:
        //   ./matrx     the shared matrx client
        //   ./catalog   the ONE agent picker (+ ./catalog/react)
        //   ./mandates  the published mandate-key vocabulary (0.10.0)
        "^@ai-matrx/agents/(matrx|catalog|mandates)$":
            "<rootDir>/node_modules/@ai-matrx/agents/dist/$1/index.js",
        "^@ai-matrx/agents/catalog/react$":
            "<rootDir>/node_modules/@ai-matrx/agents/dist/catalog/react/index.js",
        // @ai-matrx/associations subpaths are DIRECTORIES too
        // (dist/core/index.js, dist/react/index.js) — map before the generic
        // rule, same reason as agents/matrx above.
        "^@ai-matrx/associations/(core|react)$":
            "<rootDir>/node_modules/@ai-matrx/associations/dist/$1/index.js",
        // design-system's data-table public entry is likewise a directory
        // target in dist, while its leaf subpaths remain files.
        "^@ai-matrx/design-system/data-table$":
            "<rootDir>/node_modules/@ai-matrx/design-system/dist/data-table/index.js",
        "^@ai-matrx/([^/]+)/(.+)$":
            "<rootDir>/node_modules/@ai-matrx/$1/dist/$2.js",
        // BARE specifiers for the packages that ship `exports` but NO `main`
        // (@ai-matrx/design-system, @ai-matrx/agents). Jest's resolver ignores
        // `exports`, so `import { Separator } from "@ai-matrx/design-system"`
        // resolved to nothing and killed every suite that transitively reached
        // components/ui/separator.tsx — which is the whole block-dispatch tree.
        // Packages that DO declare `main` (content-ir, content-ir-react) resolve
        // on their own to the CJS build and are deliberately not listed.
        "^@ai-matrx/(design-system|agents)$":
            "<rootDir>/node_modules/@ai-matrx/$1/dist/index.js",
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
    // XML rendering tests use the real MarkdownCore, including react-markdown
    // and unified/GFM's is-plain-obj + escape-string-regexp dependencies.
    transformIgnorePatterns: [
      "/node_modules/(?!\\.pnpm/|@ai-matrx|human-id|uuid|unist|hast|mdast|micromark|react-markdown|is-plain-obj|escape-string-regexp|remark|rehype|unified|vfile|property-information|space-separated-tokens|comma-separated-tokens|web-namespaces|zwitch|html-void-elements|html-url-attributes|ccount|character-entities|character-reference-invalid|decode-named-character-reference|stringify-entities|parse-entities|trim-lines|bail|trough|devlop|longest-streak|markdown-table|estree|mathml-tag-names|parse5).+\\.js$",
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
