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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY `@ai-matrx/*` SUBPATH, READ FROM THE PACKAGE'S OWN `exports` MAP.
 *
 * Jest's resolver ignores `exports`, so each directory subpath (dist/<name>/index.js) used to be
 * listed by hand below, and the generic rule sent every other one to dist/<name>.js. The day a
 * package added one nobody listed, every suite that reached it died at import: 2026-09-24,
 * records-ui 0.85.6 imported `@ai-matrx/design-system/field-formats` (a directory) and every
 * suite touching records-ui failed with "Could not locate module". The map is now built from the
 * installed packages' own `exports`, so a new subpath resolves the day it is published. The
 * hand entries below stay as the fallback for a package whose `exports` is absent.
 */
function aiMatrxExportsMap(): Record<string, string> {
    // Jest loads this file as an ES module (no `__dirname`) and runs from the repo root.
    const scope = join(process.cwd(), "node_modules", "@ai-matrx");
    if (!existsSync(scope)) return {};
    const out: Record<string, string> = {};
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const name of readdirSync(scope)) {
        let manifest: { exports?: unknown };
        try {
            manifest = JSON.parse(readFileSync(join(scope, name, "package.json"), "utf8"));
        } catch {
            continue;
        }
        if (!manifest.exports || typeof manifest.exports !== "object") continue;
        for (const [subpath, target] of Object.entries(manifest.exports as Record<string, unknown>)) {
            if (subpath === "." || subpath === "./package.json" || subpath.includes("*")) continue;
            const pick = (t: unknown): string | null => {
                if (typeof t === "string") return t;
                if (!t || typeof t !== "object") return null;
                const o = t as Record<string, unknown>;
                return pick(o.import) ?? pick(o.default) ?? pick(o.require) ?? null;
            };
            const file = pick(target);
            if (!file || !/\.(c|m)?js$/.test(file)) continue;
            out[`^@ai-matrx/${escape(name)}/${escape(subpath.slice(2))}$`] = `<rootDir>/node_modules/@ai-matrx/${name}/${file.replace(/^\.\//, "")}`;
        }
    }
    return out;
}

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
        // Shiki (the ONE code highlighter) and its @shikijs/* packages ship
        // ESM-only `.mjs`; compile them like any other dependency JS so code
        // view tests run the real highlighter instead of a stub.
        "^.+\\.mjs$": [
            "ts-jest",
            { tsconfig: { rootDir: ".", allowJs: true, module: "commonjs" } },
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
        // Shiki's subpath `exports` (import-only) — Jest's resolver does not
        // read `exports`, so each subpath the code imports maps to its file.
        "^shiki/(core|langs|themes)$": "<rootDir>/node_modules/shiki/dist/$1.mjs",
        "^shiki/engine/javascript$":
            "<rootDir>/node_modules/shiki/dist/engine-javascript.mjs",
        "^@shikijs/(themes|langs)/(.+)$":
            "<rootDir>/node_modules/@shikijs/$1/dist/$2.mjs",
        // `remend` (the streaming markdown healer) ships an import-only
        // `exports` map, which Jest's resolver does not read.
        "^remend$": "<rootDir>/node_modules/remend/dist/index.js",
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
        "^@ai-matrx/agents/(matrx|catalog|mandates|content-transfer)$":
            "<rootDir>/node_modules/@ai-matrx/agents/dist/$1/index.js",
        "^@ai-matrx/agents/catalog/react$":
            "<rootDir>/node_modules/@ai-matrx/agents/dist/catalog/react/index.js",
        "^@ai-matrx/agents/content-transfer/react$":
            "<rootDir>/node_modules/@ai-matrx/agents/dist/content-transfer/react/index.js",
        // @ai-matrx/associations subpaths are DIRECTORIES too
        // (dist/core/index.js, dist/react/index.js) — map before the generic
        // rule, same reason as agents/matrx above.
        "^@ai-matrx/associations/(core|react)$":
            "<rootDir>/node_modules/@ai-matrx/associations/dist/$1/index.js",
        // @ai-matrx/records subpaths are DIRECTORIES too (dist/core/index.js,
        // dist/react/index.js, dist/use-cases/index.js) — map before the generic rule, same reason as
        // agents/matrx and associations above. First consumer: 2026-09-19,
        // features/list-change-proposals/applyListChange.ts's `kind:"table"`
        // branch (`@ai-matrx/records/core`'s `createRecordsClient`).
        "^@ai-matrx/records/(core|react|use-cases)$":
            "<rootDir>/node_modules/@ai-matrx/records/dist/$1/index.js",
        // design-system's data-table public entry is likewise a directory
        // target in dist, while its leaf subpaths remain files.
        "^@ai-matrx/design-system/data-table$":
            "<rootDir>/node_modules/@ai-matrx/design-system/dist/data-table/index.js",
        ...aiMatrxExportsMap(),
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
    // Babel 8 publishes ESM, including the AST helpers exercised by the
    // viewport-breakpoint migration tests. Transform it with the same loader.
    transformIgnorePatterns: [
      "/node_modules/(?!\\.pnpm/|@ai-matrx|shiki|@shikijs|@babel|human-id|uuid|unist|hast|mdast|micromark|remend|marked|react-markdown|is-plain-obj|escape-string-regexp|remark|rehype|unified|vfile|property-information|space-separated-tokens|comma-separated-tokens|web-namespaces|zwitch|html-void-elements|html-url-attributes|ccount|character-entities|character-reference-invalid|decode-named-character-reference|stringify-entities|parse-entities|trim-lines|bail|trough|devlop|longest-streak|markdown-table|estree|mathml-tag-names|parse5|gemoji|github-slugger|smol-toml|fault|format|is-decimal|is-hexadecimal|is-alphanumerical|is-alphabetical).+\\.js$",
    ],
    testPathIgnorePatterns: [
        "/node_modules/",
        "/.next/",
        "/.claude/",
        // Other lanes park whole checkouts under .wt/ and .matrx/*/checkout/
        // (and cold-walk scratch under .coldwalk*/); without this every suite
        // ran once per copy — seven times on 2026-09-18.
        "/.wt/",
        "/.matrx/",
        "/.coldwalk",
        // This is an explicit Playwright gate that requires a running app and
        // Chromium; Jest owns the unit suite and must not attempt to load it.
        "/features/content-ir/sandbox/browser/",
        // The shell layout gate (`pnpm test:shell-layout`,
        // playwright.shell-layout.config.ts) measures real layout rects in
        // Chromium; under Jest its `@playwright/test` import dies with
        // "Class extends value undefined" before a single test runs.
        "/features/shell/layout-gate/",
        // Same class: the mobile rule-row-squeeze gate
        // (`pnpm test:rule-row-squeeze`, playwright.rule-row-squeeze.config.ts)
        // measures real rendered layout in Chromium via its own Playwright
        // config and `globalSetup`; Jest must not load its `.spec.ts` either.
        "/features/masterwork/components/detail/__tests__/rule-row-squeeze/",
        // Same class: the Library table reachability gate
        // (`pnpm test:library-table-reachable`,
        // playwright.library-table-reachable.config.ts) measures real
        // rendered layout in Chromium via its own Playwright config and
        // `globalSetup`; Jest must not load its `.spec.ts` either.
        "/features/source-library/__tests__/library-table-reachable/",
        // RED TWINS. A `*.red.test.tsx` is a suite that MUST fail: it runs the
        // same assertions against the defect, so a green suite cannot be green
        // on the mere fact that something rendered. They are run BY NAME
        // (`npx jest <path>`) and would otherwise make `pnpm test` red for ever.
        "\\.red\\.test\\.tsx?$",
        // Parked aidream clones under work/ (4.4 GB on 2026-09-22) carry their
        // own test files; never run them as this repo's suites. ANCHORED to
        // <rootDir>: a bare "/work/" also matches CI's checkout path
        // (/home/runner/work/ai-matrx/...) and ignored every suite there.
        "<rootDir>/work/",
    ],
    // Parked checkouts must not enter the HASTE MAP either: two aidream clones
    // under work/ (2026-09-22) each carry apps/shared/*/package.json, and a
    // duplicate `@ai-matrx/realtime` name fails EVERY suite that imports the
    // store before a single test runs.
    modulePathIgnorePatterns: [
        "<rootDir>/work/",
        "<rootDir>/.wt/",
        "<rootDir>/.matrx/",
        "<rootDir>/.coldwalk",
    ],
    // Restrict to *.test.ts(x) / *.spec.ts(x). Jest's default `testMatch`
    // also globs everything under `**/__tests__/**`, which picked up our
    // handrolled tsx-runnable `*.script.ts` files (extract-json.script.ts,
    // scope-mapping.script.ts) and reported them as failed suites because
    // they have no `describe`/`it` blocks. Restricting `testMatch` makes
    // the file extension authoritative — Jest only runs real Jest tests.
    testMatch: ["**/?(*.)+(test|spec).[jt]s?(x)"],
    // 🚨 NOT JEST'S 5s. A per-test deadline is not an assertion — it is the
    // wall the slowest machine has to clear — and at 5s it made every heavy
    // jsdom render suite a coin flip on load. Two suites failed the 2026-09-19
    // whole-battery run purely on it (`verify-owner-claims`,
    // `finishing-lands-in-the-room-never-a-bare-chat`) and both passed alone;
    // the second takes 10s for five tests on an IDLE machine, so the first test
    // had no margin at all under 40 workers. 30s still fails a hung test — the
    // whole battery is ~340s over 2,218 suites — and it stops the deadline
    // deciding whether an assertion gets to run. A suite that NEEDS more than
    // this is telling you something and should say so with its own
    // `jest.setTimeout`.
    testTimeout: 30_000,
};

export default config;
