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
 *      AUTHORITATIVE owner of this leg. It is a PROXY for a DOM render, not a
 *      DOM render. Exactly what it checks, and nothing more:
 *        · the kind has something to render with (`legacyBlockType` or
 *          `component`);
 *        · for BRIDGED kinds, `toLegacyServerData(sample)` returns a plain
 *          object that is SEMANTICALLY non-empty — see
 *          `describeUnrenderableBridgeOutput` for the exact predicate;
 *        · BRIDGELESS kinds pass with a recorded caveat — nothing is verified.
 *
 *      This catches the 2026-07-04 "No flashcards available yet" class: a
 *      bridge that returns `undefined`, `{}`, `{language:"json"}` (the raw
 *      code-region annotation), or an object whose every value is empty.
 *
 *      What it does NOT do — stated plainly, because a gate that overclaims is
 *      worse than no gate: it does not mount the component, and it cannot know
 *      WHICH key carries the payload. `{title:"Cell Biology", cards:[]}` passes
 *      this leg on `title` alone. Proving the payload key is populated needs
 *      per-kind knowledge the gate deliberately does not have; a DOM-level
 *      render check is the deeper leg, deferred to an RTL harness.
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

/**
 * Keys a bridge may emit that carry NO kind content — pure region annotation.
 *
 * `language` is the sole member, and it is here because of a real, shipped bug.
 * `StreamBlockAccumulator.buildBlockData()` emits `data: { language: "json" }`
 * for an UNTYPED code region (a bare ```json fence), and
 * `render-block-to-content-block.ts` maps `rb.data` → `block.serverData`. That
 * annotation therefore arrives downstream as a TRUTHY `serverData` holding zero
 * kind data. On 2026-07-04 it reached the flashcards component in place of
 * `cards` and rendered "No flashcards available yet" (see `react/kind-route.ts`,
 * which now REPLACES or CLEARS it rather than forwarding it).
 *
 * This list only removes keys from the "is anything substantive here?" tally —
 * it never fails a bridge on its own. A kind whose serverData is
 * `{ language: "python", code: "..." }` still passes, on `code`. Only a bridge
 * whose ENTIRE output is annotation has produced nothing renderable.
 *
 * Add a key here only with evidence that the region-annotation path emits it and
 * that it can never itself be kind content.
 */
const SERVER_DATA_ANNOTATION_KEYS: ReadonlySet<string> = new Set(["language"]);

/** serverData is JSON-shaped; this only guards pathological/cyclic nesting. */
const SUBSTANCE_DEPTH_LIMIT = 8;

/**
 * Is `value` real content that a component could render?
 *
 *   string  → non-empty after trim    ("" and "   " are not content)
 *   number  → any finite number       (0 IS content: `completedItems: 0`)
 *   boolean → always                  (false IS content: `isComplete: false`)
 *   array   → ≥1 substantive ELEMENT  ([] and [""] are not content)
 *   object  → ≥1 substantive VALUE    ({} and {a:""} are not content)
 *   null | undefined | NaN | function | symbol | bigint → never content
 *
 * Recursive by design: `{ data: { items: [] } }` is structurally present and
 * semantically empty, and telling those two apart is this leg's entire job.
 */
function isSubstantiveValue(value: unknown, depth = 0): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  // Deep AND present — stop descending rather than claim it is empty.
  if (depth >= SUBSTANCE_DEPTH_LIMIT) return true;
  if (Array.isArray(value)) {
    return value.some((entry) => isSubstantiveValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) =>
      isSubstantiveValue(entry, depth + 1),
    );
  }
  return false;
}

/**
 * The render leg's real predicate: why is this bridge output NOT renderable?
 * Returns a specific reason, or `null` when the output is genuinely renderable.
 *
 * `serverData` is typed `unknown` on purpose — the facet's declared return type
 * is a promise the gate must not take on faith; a bridge is ordinary code that
 * can return anything at runtime.
 *
 * Renderable ⇔ a non-null, non-array object with at least one key that is not
 * pure annotation AND whose value is substantive (see `isSubstantiveValue`).
 */
function describeUnrenderableBridgeOutput(serverData: unknown): string | null {
  if (serverData === undefined || serverData === null) {
    return "bridge returned no serverData (undefined)";
  }
  if (typeof serverData !== "object") {
    return `bridge returned a non-object serverData (${typeof serverData})`;
  }
  if (Array.isArray(serverData)) {
    return "bridge returned an array, not a serverData record";
  }

  const record = serverData as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return "bridge returned an empty object ({})";

  const contentKeys = keys.filter((key) => !SERVER_DATA_ANNOTATION_KEYS.has(key));
  if (contentKeys.length === 0) {
    return `bridge returned only annotation keys [${keys.join(", ")}] — that is the raw code-region annotation, not kind data`;
  }
  if (!contentKeys.some((key) => isSubstantiveValue(record[key]))) {
    return `bridge returned serverData whose every content value is empty (keys: ${contentKeys.join(", ")}) — structurally present, semantically empty`;
  }
  return null;
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
    const problem = describeUnrenderableBridgeOutput(serverData);
    if (problem) {
      return {
        ok: false,
        detail: `${problem} (the "No ${kind} available" failure)`,
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
