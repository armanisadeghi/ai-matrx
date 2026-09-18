#!/usr/bin/env npx tsx
/**
 * check:surface-approval-render — a value an agent proposes into a person's
 * page reaches a RENDERER, never that person's eyes as JSON.
 *
 * 🚨 WHY THIS FILE EXISTS (cold walk 3, finding 4 — 2026-09-16)
 * -------------------------------------------------------------
 * A first-time Expert on the Masterwork Conductor was shown a card headed
 * "MASTERWORK CONDUCTOR · UPDATE · Rule draft" whose body was a pretty-printed
 * JSON block — `"__kind": "masterwork_rule_draft"`, `"mode"`, `"statement"`,
 * `"severity"` — with Apply / Keep as is underneath. `masterwork_rule_draft` is
 * a REGISTERED, ACTIVE kind with a component, and the write target names it as
 * its `valueKind`. The seam simply never read `valueKind`: its only consumers
 * were the model-facing tool spec and `check:surface-drift`. NO RENDERER READ
 * IT. `check:shapes:components` asserts the inverse (a component names a kind
 * that exists), `render-matrix.test.ts` passes trivially for a kind with no
 * component, and `check:surface-drift` is wire-only — so nothing in the repo
 * was looking at the point where the kind meets a reader.
 *
 * This is that guard. It runs the REAL builder
 * (`buildSurfaceWriteApprovalChange` — the exact function the live thunk calls)
 * over EVERY write target declared in `features/surfaces/manifests/**` and
 * asserts the three things that have to hold for the Expert to see a card
 * instead of a payload.
 *
 * THE FOUR RULES (each proved separately by `--self-test`, with a fixture no
 * other rule can catch — forcing-function-tests §6)
 * ---------------------------------------------------------------------------
 *   R1 NO-DUMP  NO field the card renders carries a serialized object or
 *               array. A `JSON.stringify` at this seam is the defect above,
 *               whatever produced it.
 *   R2 AS-DATA  A structured (object|array) proposed value reaches the card as
 *               DATA (`change.proposedValue`), so something can render it. A
 *               human summary is not a substitute for the value.
 *   R3 ROUTE    A target that declares `valueKind` hands that slug to the card
 *               (`proposedValue.kind`), so `KindInstanceRender` can route the
 *               value to the kind's own component. Dropping the slug silently
 *               downgrades a contracted shape to the generic floor.
 *   R4 RENDERER Every declared `valueKind` is an ACTIVE registered kind
 *               (`GENERATED_KIND_SLUGS`). Active is the strong claim: it can
 *               only be set through `content_ir.set_kind_activation`, whose
 *               dual gate includes the RENDER leg — so a slug in that list has
 *               a component, and one outside it does not.
 *
 * WHAT MAKES IT FAIL (the forcing function)
 * -----------------------------------------
 * Re-introducing stringification at the approval seam, adding a structured
 * write target whose value gets flattened to text, dropping `valueKind` on the
 * way to the card, or naming a kind that is registered but never activated.
 * Run against the pre-fix builder it is RED on R1 and R2 for every structured
 * target in the repo.
 *
 *   pnpm check:surface-approval-render
 *   pnpm check:surface-approval-render --self-test
 *   pnpm check:surface-approval-render --census   # print the full valueKind census
 *
 * Exit codes: 0 pass · 1 finding · 2 unexpected import/runtime error.
 */

import { resolve } from "node:path";

import { buildSurfaceWriteApprovalChange } from "../features/agents/redux/execution-system/thunks/surface-write-approval-change";
import { isGeneratedKindSlug } from "../features/content-ir/kinds/generated/kinds.generated";
import { exitAfterDrain } from "./lib/exit-after-drain";

const SELF_TEST = process.argv.includes("--self-test");
const CENSUS = process.argv.includes("--census");

/** The manifest shape this guard reads. Deliberately structural, not imported
 * as a type: the guard must keep working if the manifest type grows. */
interface WriteTargetLike {
  name: string;
  label: string;
  description: string;
  valueType: string;
  valueKind?: string;
  mode: string;
}
interface ManifestLike {
  surfaceName: string;
  writeTargets?: readonly WriteTargetLike[];
}

type BuildChange = typeof buildSurfaceWriteApprovalChange;
type IsRegistered = (slug: string) => boolean;

const STRUCTURED = new Set(["object", "array"]);

/**
 * A representative value for a target, shaped by its DECLARED valueType — the
 * same discrimination the live builder makes. Structured targets carry the
 * `__kind` marker exactly as a real agent payload does (the marker stays IN the
 * data; `check:kind-marker-law` owns that rule).
 */
function sampleValueFor(target: WriteTargetLike): unknown {
  const marker = target.valueKind ? { __kind: target.valueKind } : {};
  switch (target.valueType) {
    case "object":
      return { ...marker, name: "Sample", statement: "A sample statement." };
    case "array":
      return [{ ...marker, name: "Sample" }];
    case "number":
      return 1;
    case "boolean":
      return true;
    default:
      return "Sample proposed text.";
  }
}

/** True when a string the card would print is really a serialized payload. */
function looksLikeSerializedPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

export interface Finding {
  rule: "R1" | "R2" | "R3" | "R4";
  where: string;
  message: string;
}

/**
 * THE RULES, over the real census. Dependencies are injected so `--self-test`
 * can weaken ONE of them IN MEMORY (never on disk — forcing-function-tests
 * §4a: a peer sweeper commits whatever is on disk the moment a lane dies).
 */
export function runRules(
  manifests: readonly ManifestLike[],
  buildChange: BuildChange,
  isRegistered: IsRegistered,
): Finding[] {
  const findings: Finding[] = [];

  for (const manifest of manifests) {
    for (const target of manifest.writeTargets ?? []) {
      const where = `${manifest.surfaceName}:${target.name}`;
      const value = sampleValueFor(target);
      const change = buildChange({
        surfaceName: manifest.surfaceName,
        // The builder reads name/label/description/mode/valueKind only.
        target: target as never,
        value,
        actorLabel: "Test agent",
      });

      // R1 — nothing the card prints may be a serialized payload.
      for (const field of change.fields) {
        if (typeof field.after === "string" && looksLikeSerializedPayload(field.after)) {
          findings.push({
            rule: "R1",
            where,
            message: `field "${field.label}" carries a serialized ${value === null ? "value" : "payload"} — the approval card would print JSON at a person. Pass the value on \`proposedValue\` instead; the card routes it through the kind pipeline or the structured floor.`,
          });
        }
      }
      // R2 — a structured value must arrive as DATA, with something to render it.
      if (STRUCTURED.has(target.valueType) && !change.proposedValue) {
        findings.push({
          rule: "R2",
          where,
          message: `valueType "${target.valueType}" but the approval change carries no \`proposedValue\` — a structured value with nothing to render it reaches the reader as text or not at all.`,
        });
      }

      // R3 — a declared contract must reach the router. Scoped to a body that
      // EXISTS: a missing body is R2's finding, and one break must not print
      // as two (a fixture caught by someone else's rule is a fake proof).
      if (
        target.valueKind &&
        change.proposedValue &&
        change.proposedValue.kind !== target.valueKind
      ) {
        findings.push({
          rule: "R3",
          where,
          message: `declares valueKind "${target.valueKind}" but the approval change hands the card ${change.proposedValue?.kind ? `"${change.proposedValue.kind}"` : "no kind"} — the value would render through the generic floor instead of its own component.`,
        });
      }

      // R4 — the named kind must actually have a renderer.
      if (target.valueKind && !isRegistered(target.valueKind)) {
        findings.push({
          rule: "R4",
          where,
          message: `declares valueKind "${target.valueKind}", which is not an ACTIVE registered kind, so no component exists for it. Activate the kind through \`content_ir.set_kind_activation\` (its dual gate includes the render leg) and run \`pnpm shape:types\`, or drop the declaration.`,
        });
      }
    }
  }

  return findings;
}

function printCensus(manifests: readonly ManifestLike[]): void {
  const rows: Array<[string, string, string, string]> = [];
  for (const manifest of manifests) {
    for (const target of manifest.writeTargets ?? []) {
      if (!target.valueKind) continue;
      rows.push([
        manifest.surfaceName,
        target.name,
        target.valueKind,
        isGeneratedKindSlug(target.valueKind) ? "resolves" : "NO RENDERER",
      ]);
    }
  }
  rows.sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`));
  console.log("");
  console.log(`VALUE-KIND CENSUS — ${rows.length} write target(s) declare a valueKind:`);
  for (const [surface, target, kind, verdict] of rows) {
    console.log(`  ${verdict === "resolves" ? "✓" : "✗"} ${surface}:${target} → ${kind} (${verdict})`);
  }
  console.log("");
}

/**
 * Per-rule sabotage. Each plant is caught ONLY by its own rule — verified by
 * deleting the rule and watching the self-test go red for THAT rule
 * (forcing-function-tests §6). All of it is in memory; no file on disk is
 * touched (§4a: on a shared checkout a peer sweeper commits whatever is on
 * disk the moment a lane dies).
 */
function selfTest(manifests: readonly ManifestLike[]): number {
  let failures = 0;

  const ok = (label: string, condition: boolean, detail: string): void => {
    if (condition) {
      console.log(`  ✓ ${label}`);
    } else {
      failures += 1;
      console.error(`  ✗ ${label} — ${detail}`);
    }
  };

  /** A plant must trip its OWN rule and NOTHING else, or the proof is fake. */
  const provesOnly = (rule: Finding["rule"], found: Finding[], label: string, detail: string): void => {
    ok(`${rule} ${label}`, found.some((f) => f.rule === rule), detail);
    ok(
      `${rule} plant is caught by ${rule} alone`,
      found.length > 0 && found.every((f) => f.rule === rule),
      `it also tripped ${[...new Set(found.map((f) => f.rule))].filter((r) => r !== rule).join(", ") || "nothing"} — the fixture is not specific to its rule`,
    );
  };

  console.log("SELF-TEST — each rule proved separately, in memory.");

  const real = buildSurfaceWriteApprovalChange;

  // R1 — a builder that ALSO carries the value as data (so R2/R3 stay silent)
  // but still prints the payload in a field. Only the no-dump rule sees it.
  const dumpingBuilder = ((proposal: Parameters<BuildChange>[0]) => {
    const change = real(proposal);
    if (!change.proposedValue) return change;
    return {
      ...change,
      fields: [
        ...change.fields,
        {
          label: "Proposed value",
          after: JSON.stringify(change.proposedValue.value, null, 2),
          block: true,
        },
      ],
    };
  }) as BuildChange;
  provesOnly(
    "R1",
    runRules(manifests, dumpingBuilder, isGeneratedKindSlug),
    "NO-DUMP catches a payload printed into a card field",
    "a builder that JSON.stringify's the value into a field produced no R1 finding",
  );

  // R2 — the PRE-FIX seam's other half: the value never arrives as data, and
  // the field it leaves behind is plain English, so the no-dump rule is silent.
  const summaryOnlyBuilder = ((proposal: Parameters<BuildChange>[0]) => {
    const change = real(proposal);
    if (!change.proposedValue) return change;
    const { proposedValue: _dropped, ...rest } = change;
    return {
      ...rest,
      fields: [{ label: "Proposed value", after: "a structured value", block: true }],
    };
  }) as BuildChange;
  provesOnly(
    "R2",
    runRules(manifests, summaryOnlyBuilder, isGeneratedKindSlug),
    "AS-DATA catches a structured value that never reaches a renderer",
    "dropping proposedValue entirely produced no R2 finding",
  );

  // R3 — the value arrives as data, but the declared contract is dropped on the
  // way, so it would render through the generic floor instead of its component.
  const kindDroppingBuilder = ((proposal: Parameters<BuildChange>[0]) => {
    const change = real(proposal);
    if (!change.proposedValue) return change;
    return { ...change, proposedValue: { value: change.proposedValue.value } };
  }) as BuildChange;
  provesOnly(
    "R3",
    runRules(manifests, kindDroppingBuilder, isGeneratedKindSlug),
    "ROUTE catches a declared valueKind that never reaches the card",
    "dropping proposedValue.kind produced no R3 finding",
  );

  // R4 — a planted target naming a kind nothing activated. The real builder
  // routes it faithfully, so R1–R3 are all silent; only the renderer rule sees
  // that no component exists on the other end.
  const planted: ManifestLike[] = [
    {
      surfaceName: "selftest/planted",
      writeTargets: [
        {
          name: "planted_target",
          label: "Planted target",
          description: "A deliberately bad target planted by --self-test.",
          valueType: "object",
          valueKind: "mx_self_test_kind_that_is_not_registered",
          mode: "draft",
        },
      ],
    },
  ];
  provesOnly(
    "R4",
    runRules(planted, real, isGeneratedKindSlug),
    "RENDERER catches a target naming a kind with no component",
    "an unregistered valueKind produced no R4 finding",
  );

  // And the real census must be clean, or the sabotage is measuring noise.
  const live = runRules(manifests, real, isGeneratedKindSlug);
  ok(
    "the live census is clean with nothing planted",
    live.length === 0,
    `${live.length} real finding(s) — fix them before trusting the sabotage`,
  );

  return failures;
}

async function main(): Promise<void> {
  const mod: { ALL_MANIFESTS: readonly ManifestLike[] } = await import(
    resolve(__dirname, "..", "features/surfaces/manifests/registry")
  );
  const manifests = mod.ALL_MANIFESTS;

  if (SELF_TEST) {
    const failures = selfTest(manifests);
    if (failures > 0) {
      console.error(`\nSELF-TEST FAILED: ${failures} rule(s) could not be proved.`);
      exitAfterDrain(1);
    }
    console.log("\nSELF-TEST PASSED — every rule fails for its own reason.");
    exitAfterDrain(0);
  }

  if (CENSUS) printCensus(manifests);

  const findings = runRules(
    manifests,
    buildSurfaceWriteApprovalChange,
    isGeneratedKindSlug,
  );

  const targetCount = manifests.reduce(
    (n, m) => n + (m.writeTargets?.length ?? 0),
    0,
  );
  const kindCount = manifests.reduce(
    (n, m) => n + (m.writeTargets ?? []).filter((t) => t.valueKind).length,
    0,
  );

  if (findings.length === 0) {
    console.log(
      `Approval render OK: ${targetCount} surface write target${targetCount === 1 ? "" : "s"} across ${manifests.length} surface${manifests.length === 1 ? "" : "s"} reach a renderer on the approval seam (${kindCount} declare a valueKind; none print JSON at a reader).`,
    );
    exitAfterDrain(0);
  }

  console.error(
    `\nFAIL — ${findings.length} surface write target${findings.length === 1 ? "" : "s"} would show a person something no renderer drew:\n`,
  );
  for (const f of findings) {
    console.error(`  [${f.rule}] ${f.where}: ${f.message}`);
  }
  console.error(
    "\nThe seam is `buildSurfaceWriteApprovalChange` (features/agents/redux/execution-system/thunks/). A structured value travels as data and the card renders it through the kind pipeline; it is never stringified.",
  );
  exitAfterDrain(1);
}

main().catch((err: unknown) => {
  console.error("check:surface-approval-render failed to run:", err);
  exitAfterDrain(2);
});
