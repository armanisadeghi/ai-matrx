/**
 * THE SERVED RUN FORM — the pure half.
 *
 * `GET /workflows/{id}/run-form` serves `inputs[]`: the workflow's ONE
 * compiled input surface (common-docs `systems/workflows/INPUT-SURFACE.md`).
 * Name-unique, kind-addressed, one sourcing rule each, provenance-stamped on
 * landing. THIS MODULE NEVER DERIVES A FORM FROM A DEFINITION — the surface
 * is served, not guessed; `deriveRunForm` (the legacy client-side derivation)
 * has no part in this path and dies with the 2.1 client migration.
 *
 * Pure: no React, no Redux, no Supabase — so the gate law, the provenance
 * stamping law and the submit payload are unit-testable without a browser.
 *
 * THE THREE LAWS THIS FILE ENCODES
 *
 * 1. **Sourcing gates** (`unsatisfiedServedInputs`) mirror the server's
 *    `unsatisfied_inputs` exactly:
 *      · `require` — satisfied by a value from ANY source, a declared default
 *        included.
 *      · `ask` — a human answers EVERY time; only a human-entered value
 *        satisfies it. A default never does.
 *      · `optional` — never blocks.
 *    A pinned input is satisfied by its pinned value and can never be typed.
 *
 * 2. **Provenance stamping** (`buildSubmission`) obeys THE source=human
 *    INVARIANT: this form IS the human path, so exactly the values a person
 *    typed here travel with `input_sources[name] = "human"`. Values the
 *    person never touched are NOT sent — the server re-seeds its own
 *    declared default and stamps it `default`. Re-sending a seeded default as
 *    `human` would be the form lying about who spoke.
 *
 * 3. **Pinned is read-only, never submitted.** A mandate-pinned value is the
 *    strongest precedence rung and is stamped server-side; echoing it back
 *    would be a client claiming a source it may not claim.
 */

/** Sourcing rule — INPUT-SURFACE.md §"Sourcing rules". */
export type SourcingRule = "ask" | "require" | "optional";

/** Provenance stamp — INPUT-SURFACE.md §"Provenance". */
export type InputSource = "pinned" | "human" | "caller" | "mandate" | "default";

/** Sources a client may claim. The rest are server-stamped, never claimable. */
export type ClaimableSource = "human" | "caller";

/** One entry of the SERVED compiled input surface (server `ServedInput`). */
export interface ServedInput {
  name: string;
  /** content_ir kind slug — every input IS a kind. */
  kind: string;
  sourcing: SourcingRule;
  /** Named presentation variant registered ON the kind, selected by name. */
  variant: string | null;
  default: unknown;
  label: string;
  help: string;
  placeholder: string;
  options: string[];
  origin: "field" | "variable";
  nodeId: string | null;
  /** The input's own value contract (drives the derived-default component). */
  jsonSchema: Record<string, unknown>;
  required: boolean;
  /** A mandate binding locked this value: visible, never editable. */
  pinned: boolean;
  readOnly: boolean;
  pinnedValue: unknown;
}

/** The served run-form payload, as much of it as the served form consumes. */
export interface ServedRunFormSchema {
  definitionId: string;
  version: number;
  inputs: ServedInput[];
  /**
   * LOUD: the server answered without an `inputs` array. That means the
   * reachable backend predates the input surface (W2-D) — the form must say
   * so rather than render an empty "needs nothing from you" lie.
   */
  surfaceServed: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

const SOURCING: ReadonlySet<string> = new Set(["ask", "require", "optional"]);

/**
 * Parse ONE served input. Tolerant about presentation (labels, help), strict
 * about identity: an entry with no `name` or no `kind` is not an input and is
 * dropped — it cannot be addressed, and a guessed kind would pick a renderer
 * at random.
 */
export function parseServedInput(raw: unknown): ServedInput | null {
  if (!isRecord(raw)) return null;
  const name = str(raw.name);
  const kind = str(raw.kind);
  if (!name || !kind) return null;
  const sourcing = SOURCING.has(str(raw.sourcing))
    ? (raw.sourcing as SourcingRule)
    : "optional";
  return {
    name,
    kind,
    sourcing,
    variant: typeof raw.variant === "string" && raw.variant ? raw.variant : null,
    default: raw.default ?? null,
    label: str(raw.label) || name,
    help: str(raw.help),
    placeholder: str(raw.placeholder),
    options: Array.isArray(raw.options)
      ? raw.options.filter((o): o is string => typeof o === "string")
      : [],
    origin: raw.origin === "variable" ? "variable" : "field",
    nodeId: typeof raw.node_id === "string" ? raw.node_id : null,
    jsonSchema: isRecord(raw.json_schema) ? raw.json_schema : {},
    required: raw.required === true || sourcing !== "optional",
    pinned: raw.pinned === true,
    readOnly: raw.read_only === true || raw.pinned === true,
    pinnedValue: raw.pinned_value ?? null,
  };
}

/** Parse the whole served run-form body. */
export function parseServedRunForm(raw: unknown): ServedRunFormSchema {
  const body = isRecord(raw) ? raw : {};
  const rawInputs = body.inputs;
  const served = Array.isArray(rawInputs);
  return {
    definitionId: str(body.definition_id),
    version: typeof body.version === "number" ? body.version : 0,
    inputs: served
      ? rawInputs
          .map(parseServedInput)
          .filter((i): i is ServedInput => i !== null)
      : [],
    surfaceServed: served,
  };
}

/**
 * THE one definition of "no value landed" — identical to the server's
 * `missing_value`. `false`, `0` and `[]` are real values; `null` and `""`
 * are not.
 */
export function missingValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Seed the draft from declared defaults (and pinned values, which win). */
export function seedServedValues(
  inputs: readonly ServedInput[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const input of inputs) {
    if (input.pinned && !missingValue(input.pinnedValue)) {
      values[input.name] = input.pinnedValue;
    } else if (!missingValue(input.default)) {
      values[input.name] = input.default;
    }
  }
  return values;
}

/**
 * The inputs that BLOCK a start, per their sourcing rules — the client-side
 * twin of the server's `unsatisfied_inputs`. `touched` is the set of names a
 * person has actually entered a value for in THIS form; only those can
 * satisfy an `ask`.
 */
export function unsatisfiedServedInputs(
  inputs: readonly ServedInput[],
  values: Record<string, unknown>,
  touched: ReadonlySet<string>,
): ServedInput[] {
  const gaps: ServedInput[] = [];
  for (const input of inputs) {
    if (input.sourcing === "optional") continue;
    if (input.pinned && !missingValue(input.pinnedValue)) continue;
    const value = values[input.name];
    if (input.sourcing === "require") {
      if (missingValue(value) && missingValue(input.default)) gaps.push(input);
    } else if (input.sourcing === "ask") {
      // A human answers every time: a default the person never touched is
      // not an answer.
      if (missingValue(value) || !touched.has(input.name)) gaps.push(input);
    }
  }
  return gaps;
}

export interface ServedSubmission {
  /** name → value, against the compiled surface. */
  inputs: Record<string, unknown>;
  /** Per-input provenance claims. This form only ever claims `human`. */
  inputSources: Record<string, ClaimableSource>;
}

/**
 * Build the run-start payload.
 *
 * ONLY what the person typed travels — each name stamped `human`, because
 * this form is the human-facing path and nothing else here may claim it.
 * A seeded default the person left alone is deliberately omitted: the server
 * lands its own declared default and stamps it `default`. A pinned value is
 * never echoed back — pinned is server-stamped and unclaimable.
 */
export function buildSubmission(
  inputs: readonly ServedInput[],
  values: Record<string, unknown>,
  touched: ReadonlySet<string>,
): ServedSubmission {
  const submission: ServedSubmission = { inputs: {}, inputSources: {} };
  for (const input of inputs) {
    if (input.readOnly || input.pinned) continue;
    if (!touched.has(input.name)) continue;
    const value = values[input.name];
    if (missingValue(value)) continue;
    submission.inputs[input.name] = value;
    submission.inputSources[input.name] = "human";
  }
  return submission;
}

/** Human-readable provenance for a value the person cannot edit. */
export function provenanceLabel(input: ServedInput): string {
  if (input.pinned) return "Pinned by a mandate — locked, not editable here.";
  if (input.readOnly) return "Supplied for you — not editable here.";
  return "";
}

/** The three sourcing rules, in the order the form presents them. */
export function partitionBySourcing(inputs: readonly ServedInput[]): {
  ask: ServedInput[];
  require: ServedInput[];
  optional: ServedInput[];
} {
  return {
    ask: inputs.filter((i) => i.sourcing === "ask"),
    require: inputs.filter((i) => i.sourcing === "require"),
    optional: inputs.filter((i) => i.sourcing === "optional"),
  };
}

// ---------------------------------------------------------------------------
// The 409 gap list — a start refused for want of input is never a dead end
// ---------------------------------------------------------------------------

/** One entry of the server's `inputs_required` 409 gap list. */
export interface ServedInputGap {
  name: string;
  kind: string;
  sourcing: SourcingRule;
  label: string;
  help: string;
}

/**
 * Read the gap list out of a refused start. The server answers a
 * human-attached start missing require/ask inputs with
 * `409 {detail: {error: "inputs_required", missing: [...]}}` — the form
 * renders those gaps instead of a dead end. Returns null when the failure is
 * anything else, so a real error is never mistaken for a gap.
 */
export function readInputsRequiredGaps(
  serverDetail: unknown,
): ServedInputGap[] | null {
  if (!isRecord(serverDetail)) return null;
  // callApi hands back the raw body; FastAPI wraps HTTPException detail.
  const detail = isRecord(serverDetail.detail)
    ? serverDetail.detail
    : serverDetail;
  if (str(detail.error) !== "inputs_required") return null;
  const missing = Array.isArray(detail.missing) ? detail.missing : [];
  return missing.filter(isRecord).map((raw) => ({
    name: str(raw.name),
    kind: str(raw.kind),
    sourcing: SOURCING.has(str(raw.sourcing))
      ? (raw.sourcing as SourcingRule)
      : "require",
    label: str(raw.label) || str(raw.name),
    help: str(raw.help),
  }));
}
