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
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: { rootDir: "." } }],
    },
    setupFiles: ["<rootDir>/jest.setup.ts"],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
    },
    transformIgnorePatterns: ["/node_modules/(?!uuid).+\\.js$"],
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
