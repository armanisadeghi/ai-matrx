/**
 * The dual gate — Arman's law as executable code: a kind is only `is_active`
 * when its canonical `sample_data` passes BOTH systems.
 *
 *   1. Structural (Pydantic): the sample validates against the kind's
 *      `emitted_json_schema`. Python's Pydantic is the AUTHORITATIVE owner of
 *      this leg, but it reads the SAME materialized `emitted_json_schema` — so
 *      this TS ajv check and the Python check validate the same sample against
 *      the same schema and agree by construction. A disagreement IS the
 *      screamer (a schema Pydantic can't express, or an ajv/Pydantic gap).
 *   2. Render (UI): the sample lights up the kind's real component. TS is the
 *      AUTHORITATIVE owner of this leg. Proxy: the legacy bridge
 *      (`toLegacyServerData`) must produce real, non-empty serverData from the
 *      sample — the exact failure that produced "No flashcards available yet"
 *      (empty/garbage serverData) is caught here.
 *
 * Both legs necessary, neither sufficient. Fail either → `isActive: false` and
 * the caller reports it loudly (Error Inspector, `content-ir`) and holds the
 * row out of production. This module is PURE (deps injected) so it runs in the
 * harness, in CI, and in a browser author-save alike.
 *
 * Ownership split (KIND_REGISTRY_STORAGE.md §2): the caller writes the outcome
 * to the LIVE `content_ir.kind_definition` row's `is_active`; the canonical
 * `_version_capture` trigger snapshots that state into `history.row_versions`
 * (never a post-hoc history mutation).
 */

import Ajv, { type ValidateFunction } from "ajv";
import type { CanonicalBlockIR } from "../core/ir-types";
import { KIND_KEY } from "../core/kind-schema.types";
import { envelopeFromCompleteValue } from "../core/normalize";

/** The facets the render leg needs — a structural subset of KindDefinition. */
export interface DualGateDefinition {
  legacyBlockType?: string;
  toLegacyServerData?: (
    envelope: CanonicalBlockIR,
  ) => Record<string, unknown> | undefined;
  component?: { load: () => Promise<unknown> };
}

export interface DualGateInput {
  kind: string;
  /** The canonical instance (kind_definition.sample_data). */
  sample: Record<string, unknown>;
  /** The materialized kind_definition.emitted_json_schema (plain, no __kind). */
  emittedJsonSchema: unknown;
  /** The registry definition for the kind (or null when unregistered). */
  definition: DualGateDefinition | null;
}

export interface LegResult {
  ok: boolean;
  detail?: string;
}

export interface DualGateResult {
  /** True only when BOTH legs pass — the value the caller writes to is_active. */
  isActive: boolean;
  structural: LegResult;
  render: LegResult;
}

// ajv authoring-strictness is OFF (tolerate provider schema keywords like the
// recursive "#" root ref); DATA strictness comes from the schema itself
// (additionalProperties:false + required), which ajv enforces during validate.
const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Recursively drop `__kind` from a value. `emitted_json_schema` (and the
 * Pydantic model it mirrors) represent SOURCE data — `__kind` is injected only
 * at emit time — so the sample must be stripped to validate against them. This
 * is what keeps the TS ajv leg and Python's Pydantic leg checking the same
 * thing. (The render leg, by contrast, keeps `__kind` — bridges ignore it.)
 */
function stripKind(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripKind);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === KIND_KEY) continue;
      out[k] = stripKind(v);
    }
    return out;
  }
  return value;
}

/**
 * The structural leg, exported on its own so the shape doctor
 * (`shape-doctor.ts`) RECOMPUTES gate validation with the exact same ajv
 * config + `__kind`-stripping semantics as activation — never a parallel
 * validator. `sample` is `unknown` (not `Record`) because kind examples may
 * legitimately be scalars/arrays (workflow I/O kinds like `text`/`number`).
 */
export function validateStructuralLeg(
  sample: unknown,
  emittedJsonSchema: unknown,
): LegResult {
  let validate: ValidateFunction;
  try {
    validate = ajv.compile(emittedJsonSchema as object);
  } catch (err) {
    return {
      ok: false,
      detail: `emitted_json_schema failed to compile: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  const ok = validate(stripKind(sample));
  if (ok) return { ok: true };
  const errors = (validate.errors ?? [])
    .map((e) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim())
    .slice(0, 8);
  return { ok: false, detail: `sample failed schema: ${errors.join("; ")}` };
}

function validateRender(
  kind: string,
  sample: Record<string, unknown>,
  definition: DualGateDefinition | null,
): LegResult {
  if (!definition || (!definition.legacyBlockType && !definition.component)) {
    return {
      ok: false,
      detail: `kind "${kind}" has no component (no legacyBlockType or component facet) — nothing to render`,
    };
  }

  // Bridged kinds: the bridge MUST derive real serverData from the sample.
  if (definition.toLegacyServerData) {
    let serverData: Record<string, unknown> | undefined;
    try {
      serverData = definition.toLegacyServerData(
        envelopeFromCompleteValue(sample, kind),
      );
    } catch (err) {
      return {
        ok: false,
        detail: `toLegacyServerData threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
    if (
      !serverData ||
      typeof serverData !== "object" ||
      Object.keys(serverData).length === 0
    ) {
      return {
        ok: false,
        detail: `bridge produced empty serverData (the "No ${kind} available" failure)`,
      };
    }
    return { ok: true };
  }

  // Bridgeless kinds parse their own content — the bridge-data proxy can't
  // verify them; a full DOM render check is the deeper leg (deferred to an RTL
  // harness). Pass with a recorded caveat so it's never silently "fully gated".
  return {
    ok: true,
    detail:
      "bridgeless kind — component parses content itself; full DOM render check deferred to an RTL harness",
  };
}

export function runKindDualGate(input: DualGateInput): DualGateResult {
  const structural = validateStructuralLeg(input.sample, input.emittedJsonSchema);
  const render = validateRender(input.kind, input.sample, input.definition);
  return { isActive: structural.ok && render.ok, structural, render };
}

/**
 * One-line, Error-Inspector-ready reason for a failed gate (empty string when
 * it passed). The caller feeds this to `captureError({ source: "content-ir" })`
 * and sets `is_active=false`.
 */
export function describeDualGateFailure(
  kind: string,
  result: DualGateResult,
): string {
  if (result.isActive) return "";
  const parts: string[] = [];
  if (!result.structural.ok) {
    parts.push(`structural(Pydantic): ${result.structural.detail ?? "failed"}`);
  }
  if (!result.render.ok) {
    parts.push(`render(UI): ${result.render.detail ?? "failed"}`);
  }
  return `kind "${kind}" failed the dual gate — ${parts.join(" | ")}`;
}
