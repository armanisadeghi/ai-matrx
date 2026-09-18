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

import { scanCarrierTypes, scanSource } from "@/scripts/check-mandate-keys";

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

describe("check:mandate-keys — the typed doors are walked THROUGH, not around", () => {
  // `dbAuthoredMandateKey("…")` / `storedMandateKey(row.mandate_key)` exist so a
  // key the generated union cannot carry still reaches a typed carrier. If the
  // scan stopped at the call, the door would launder a hand-typed literal past
  // the guard AND silently strand its allowlist entry as "stale" — which is
  // exactly what happened when the doors were introduced (3 live entries went
  // unmatched until this case was written).
  it("still reports a literal wrapped in a typed door", () => {
    expect(keysFound(`const A_MANDATE_KEY = dbAuthoredMandateKey("${REAL_KEY}");`)).toEqual([
      REAL_KEY,
    ]);
    expect(keysFound(`resolveMandate(storedMandateKey("${REAL_KEY}"));`)).toEqual([REAL_KEY]);
  });
});

describe("check:mandate-keys RULE 2 — RED: a carrier that declares its key `string`", () => {
  // V-L6a (2026-09-17): the repo had adopted the vocabulary in 178 files and
  // STILL had no compile-time guard, because every carrier said `string`. These
  // cases are the shape of that defect.
  const carriers = (src: string, file = "features/mandates/useMandate.ts") =>
    scanCarrierTypes(file, src)
      .filter((c) => c.enforced)
      .map((c) => `${c.owner} ${c.member}: ${c.declared}`);

  it("flags the real V-L6a signature — useMandate(mandateKey: string)", () => {
    expect(carriers(`export function useMandate(mandateKey: string) {}`)).toEqual([
      "useMandate() mandateKey: string",
    ]);
  });

  it("flags a nullable, an array and a readonly array of keys", () => {
    expect(carriers(`export function useMandateGoal(mandateKey: string | null) {}`)).toEqual([
      "useMandateGoal() mandateKey: string | null",
    ]);
    expect(carriers(`export function useMandateSet(mandateKeys: readonly string[]) {}`)).toEqual([
      "useMandateSet() mandateKeys: readonly string[]",
    ]);
    expect(carriers(`export function runMandate(mandateKeys: Array<string>) {}`)).toEqual([
      "runMandate() mandateKeys: Array<string>",
    ]);
  });

  it("flags a carrier declared as an interface method signature, not a function", () => {
    // `useAgentLauncher`'s ImperativeMethods shape — how launchMandate hid.
    const src = `interface ImperativeMethods {
      launchMandate: (mandateKey: string, options?: Opts) => Promise<Result>;
    }`;
    expect(carriers(src)).toEqual(["launchMandate() mandateKey: string"]);
  });

  it("flags a `string` still admitted by a union — a partial fix is not a fix", () => {
    expect(carriers(`export function resolveMandate(mandateKey: MandateKey | string) {}`)).toEqual([
      "resolveMandate() mandateKey: MandateKey | string",
    ]);
  });

  it("flags the ambient ladder's own chain fields", () => {
    const src = `export interface AmbientAssistantMandateChain {
      system: MandateKey;
      pageMandateKey: string;
    }`;
    expect(carriers(src, "features/agents/components/ambient-assistant/x.ts")).toEqual([
      "AmbientAssistantMandateChain pageMandateKey: string",
    ]);
  });
});

describe("check:mandate-keys RULE 2 — GREEN: the fix, and what is honestly a string", () => {
  const enforced = (src: string, file = "features/mandates/useMandate.ts") =>
    scanCarrierTypes(file, src).filter((c) => c.enforced);
  const all = (src: string, file = "features/mandates/useMandate.ts") =>
    scanCarrierTypes(file, src);

  it("does NOT flag a typed carrier — that IS the fix", () => {
    for (const t of [
      "MandateKey",
      "AnyMandateKey",
      "DynamicMandateKey",
      "AnyMandateKey | null",
      'AnyMandateKey | ""',
      "readonly AnyMandateKey[]",
    ]) {
      expect(enforced(`export function useMandate(mandateKey: ${t}) {}`)).toEqual([]);
    }
  });

  it("does NOT flag a narrowing or parsing door — answering IS its job", () => {
    for (const src of [
      `export function isMandateKey(mandateKey: string): mandateKey is MandateKey { return true; }`,
      `export function assertMandateKey(mandateKey: string): void {}`,
      `export function splitMandateKey(mandateKey: string) {}`,
    ]) {
      expect(all(src)).toEqual([]);
    }
  });

  it("does NOT flag a snake_case DB column mirror — the ROW is the authority there", () => {
    expect(all(`interface MandateRow { mandate_key: string; }`)).toEqual([]);
  });

  it("reports a non-carrier member as CENSUS, never as a failure", () => {
    // An admin console row and a `[mandateKey]` route param are honestly
    // unknown strings; they are counted and listable, and they never fail.
    const src = `interface MandateSearchRow { mandateKey: string; }`;
    const sites = all(src, "features/mandates/admin/mandate-console-discovery.ts");
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ enforced: false, member: "mandateKey" });
  });

  it("does NOT read a file with no mandate-key member in it at all", () => {
    expect(all(`export function useThing(key: string) {}`)).toEqual([]);
  });
});
