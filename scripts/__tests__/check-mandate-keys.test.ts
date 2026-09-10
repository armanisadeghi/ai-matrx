/**
 * The guard's own RED/GREEN self-test.
 *
 * A guard you cannot demonstrate FAILING is not a guard (CLAUDE.md, "fix the
 * class"). Every case below states the rule in its own words and drives
 * `scanSource` — the same function the CLI walks the repo with — over a source
 * fixture, so a change that makes the guard blind turns one of these red.
 *
 * The live proof that accompanied this file: run against the pre-adoption tree
 * (`pnpm check:mandate-keys --root <worktree at the pre-fix commit>`) the guard
 * reported 200 literals across 76 files and exited 1; against the adopted tree
 * it reports 0 and exits 0.
 */
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

import { scanSource } from "@/scripts/check-mandate-keys";

/** A real member of the published vocabulary, and its literal spelling. */
const REAL_KEY = MANDATE_KEYS.seo__keyword_classifier;
const REAL_MEMBER = "MANDATE_KEYS.seo__keyword_classifier";

const keysFound = (src: string, file = "features/x/thing.ts") =>
  scanSource(file, src).map((s) => s.key);

describe("check:mandate-keys — RED: a hand-typed key in a mandate-key position is found", () => {
  it("flags a literal assigned to a mandate-named constant", () => {
    expect(keysFound(`const THING_MANDATE_KEY = "${REAL_KEY}";`)).toEqual([REAL_KEY]);
  });

  it("flags a literal in a mandate-named property", () => {
    expect(keysFound(`run({ mandateKey: "${REAL_KEY}" });`)).toEqual([REAL_KEY]);
  });

  it("flags every value of a mandate-named record, not just the first", () => {
    const src = `const FC_MANDATES = {
      a: "${MANDATE_KEYS.seo__keyword_classifier}",
      b: "${MANDATE_KEYS.seo__topic_assigner}",
    };`;
    expect(keysFound(src)).toEqual([
      MANDATE_KEYS.seo__keyword_classifier,
      MANDATE_KEYS.seo__topic_assigner,
    ]);
  });

  it("flags the key argument of every mandate entry point", () => {
    for (const call of [
      `resolveMandate("${REAL_KEY}")`,
      `resolveMandateServer("${REAL_KEY}")`,
      `useMandate("${REAL_KEY}")`,
      `launchMandate("${REAL_KEY}")`,
      `adminMandateHref("${REAL_KEY}")`,
      `useMandateSet({ keys: ["${REAL_KEY}"] })`,
    ]) {
      expect(keysFound(`${call};`)).toEqual([REAL_KEY]);
    }
  });

  it("flags a literal inside an array, a ternary and an `as const` cast", () => {
    expect(keysFound(`const MANDATE_KEY_LIST = ["${REAL_KEY}"] as const;`)).toEqual([REAL_KEY]);
    expect(keysFound(`const MANDATE_X = flag ? "${REAL_KEY}" : "${REAL_KEY}";`)).toEqual([
      REAL_KEY,
      REAL_KEY,
    ]);
  });

  it("flags a JSX mandate attribute", () => {
    expect(keysFound(`<Panel mandateKey="${REAL_KEY}" />;`, "features/x/Thing.tsx")).toEqual([
      REAL_KEY,
    ]);
  });

  it("REPORTS a key that is not in the vocabulary, and says so", () => {
    const [site] = scanSource("features/x/thing.ts", `const A_MANDATE_KEY = "zzz.not_declared";`);
    expect(site).toMatchObject({ key: "zzz.not_declared", declared: false });
  });
});

describe("check:mandate-keys — GREEN: the fix and the deliberate blind spots", () => {
  it("does NOT flag the vocabulary member — that IS the fix", () => {
    expect(keysFound(`const THING_MANDATE_KEY = ${REAL_MEMBER};`)).toEqual([]);
    expect(keysFound(`resolveMandate(${REAL_MEMBER});`)).toEqual([]);
    expect(keysFound(`const FC_MANDATES = { a: ${REAL_MEMBER} };`)).toEqual([]);
  });

  it("does NOT flag a key-shaped literal outside a mandate-key position", () => {
    // `education.spoken_practice` is BOTH a mandate key and an entitlement
    // meter id (features/entitlements/registry.ts). Position is the test.
    const src = `const METERS = { practice: "education.spoken_practice" };
      type MeterId = "education.spoken_practice";
      track("education.spoken_practice");`;
    expect(keysFound(src)).toEqual([]);
  });

  it("does NOT flag a mandate-named holder carrying something that is not a key", () => {
    const src = `const mandateLabel = "Keyword Classifier";
      const mandateId = "3f0c8e42-2b7d-4a91-9b0e-7c1d5a8e2f34";
      const mandateHrefBase = "/mandates";`;
    expect(keysFound(src)).toEqual([]);
  });

  it("does NOT read a file with no mandate vocabulary in it at all", () => {
    expect(keysFound(`const METERS = { a: "seo.keyword_classifier" };`)).toEqual([]);
  });
});
