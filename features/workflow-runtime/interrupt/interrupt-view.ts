/**
 * THE INTERRUPT CONTRACT — the pure half.
 *
 * SPEC-workflow-ui-contract §4: "a question part-way through a run is
 * presented with the same vocabulary as a deliverable." The server now ships
 * that vocabulary on `RunInterruptedEvent.payload`
 * (`matrx_graph/nodes/control/human_input.py`): beside today's
 * `prompt` / `schema_hint` / `context` / `default_answer` / `escalation` it
 * carries `preset`, `title`, `presentation`, `component_ref` and `surface` —
 * every one defaulting to today's behavior, so an existing node's payload
 * GAINS keys and never changes values.
 *
 * Pure: no React, no Redux, no network. The presentation split, the answer
 * field derivation, the deadline copy and the provenance sentence are all
 * unit-testable without a browser.
 *
 * THE THREE RULES THIS FILE ENCODES
 *
 * 1. **The answer control is never a bespoke form.** `answerFieldsOf` turns
 *    the schema hint into fields carrying only a VALUE CONTRACT (value type +
 *    enum) and a named variant; the component is then resolved by the ONE
 *    ladder (`resolveVariantComponent`) exactly as the served run form does.
 *    A null schema hint yields ONE `answer` string field — free text is a
 *    degenerate form, not a second renderer.
 *
 * 2. **The approval preset is sugar, not a second path.** `approval` derives
 *    Approve/Reject + an optional note and POSTs the identical resume body.
 *    Nothing here talks to a different endpoint, because there isn't one.
 *
 * 3. **Provenance is never optional on a settled decision.** `decisionLine`
 *    refuses to render a bare "Approved" — an escalated decision that reads as
 *    a human's is the exact failure `matrx_decision` exists to prevent. A
 *    settled decision with NO stamp says so out loud rather than implying a
 *    person.
 */

import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";
import { valueTypeFromJsonSchema } from "../served-form/kind-source";

/** The presets a decision point may be authored as (`HumanInputPreset`). */
export type InterruptPreset = "free_text" | "form" | "approval";

/** How the question asked to be shown (`EmitPresentation`). */
export type InterruptPresentation = "panel" | "showcase";

const PRESETS: ReadonlySet<string> = new Set(["free_text", "form", "approval"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// ---------------------------------------------------------------------------
// The parsed question
// ---------------------------------------------------------------------------

/** The frozen escalation block (`build_escalation_payload`). */
export interface InterruptEscalation {
  /** Absolute ISO instant the fallback may decide at. */
  deadlineAt: string;
  waitingSince: string | null;
  /** Who decides on timeout. */
  fallback: "agent" | "default_answer";
  agentId: string | null;
}

export interface InterruptQuestionView {
  prompt: string;
  /** The author's label for this question on screen. Null → use the prompt. */
  title: string | null;
  presentation: InterruptPresentation;
  preset: InterruptPreset;
  /** Custom renderer for the CONTEXT (never for the answer control). */
  componentRef: string | null;
  surface: string | null;
  defaultAnswer: string;
  /** The derived hint — identical to the author's when they wrote one. */
  schemaHint: Record<string, unknown> | null;
  /** Whatever the node handed the UI to help the person answer. */
  context: Record<string, unknown> | null;
  escalation: InterruptEscalation | null;
}

/** Parse `RunInterruptedEvent.payload`. Tolerant: every field has a floor that
 * reproduces the pre-§4 screen, so a server predating the block still renders. */
export function parseInterruptPayload(
  payload: Record<string, unknown> | null | undefined,
): InterruptQuestionView {
  const raw = isRecord(payload) ? payload : {};
  const presetRaw = str(raw.preset);
  const title = str(raw.title).trim();
  return {
    prompt:
      str(raw.prompt).trim() || "This workflow is waiting for your answer.",
    title: title || null,
    presentation: raw.presentation === "showcase" ? "showcase" : "panel",
    preset: PRESETS.has(presetRaw) ? (presetRaw as InterruptPreset) : "free_text",
    componentRef: str(raw.component_ref).trim() || null,
    surface: str(raw.surface).trim() || null,
    defaultAnswer: str(raw.default_answer),
    schemaHint: isRecord(raw.schema_hint) ? raw.schema_hint : null,
    context: isRecord(raw.context) && Object.keys(raw.context).length > 0
      ? raw.context
      : null,
    escalation: parseEscalation(raw.escalation),
  };
}

function parseEscalation(value: unknown): InterruptEscalation | null {
  if (!isRecord(value)) return null;
  const deadlineAt = str(value.deadline_at).trim();
  if (!deadlineAt) return null;
  return {
    deadlineAt,
    waitingSince: str(value.waiting_since).trim() || null,
    fallback:
      value.fallback === "default_answer" ? "default_answer" : "agent",
    agentId: str(value.agent_id).trim() || null,
  };
}

// ---------------------------------------------------------------------------
// The kind-carrying context value (§4.1: "§3's rule applied to the question")
// ---------------------------------------------------------------------------

/**
 * The context value that names its own kind, if there is one.
 *
 * §4.1: "A `context` value carrying a `__kind` renders via its kind component
 * above the answer control." The context is a free `dict[str, JsonValue]`, so
 * the marker may sit on the map ITSELF (a single kind instance handed straight
 * across) or on one of its values (a named slot). Both are checked, the map
 * first. Nothing is ever stripped on the way out — the whole value travels,
 * `__kind` included (THE KIND MARKER LAW).
 */
export function kindContextValue(
  context: Record<string, unknown> | null,
): { name: string | null; kind: string; value: unknown } | null {
  if (!context) return null;
  const own = str(context.__kind).trim();
  if (own) return { name: null, kind: own, value: context };
  for (const [name, value] of Object.entries(context)) {
    if (!isRecord(value)) continue;
    const kind = str(value.__kind).trim();
    if (kind) return { name, kind, value };
  }
  return null;
}

/** Context entries that are NOT the kind-carrying value — shown as plain facts. */
export function plainContextEntries(
  context: Record<string, unknown> | null,
  kindName: string | null,
): Array<{ name: string; value: unknown }> {
  if (!context) return [];
  // The whole map WAS the kind instance — it has no leftover plain entries.
  if (kindName === null && str(context.__kind).trim()) return [];
  return Object.entries(context)
    .filter(([name]) => name !== kindName && name !== "__kind")
    .map(([name, value]) => ({ name, value }));
}

// ---------------------------------------------------------------------------
// The answer fields — a VALUE CONTRACT, never a component choice
// ---------------------------------------------------------------------------

/**
 * One field of the answer control. It carries what the SCHEMA says (the value
 * type, the admissible values, whether it is required) plus the NAME of a
 * presentation variant when the author selected one. It deliberately carries
 * no component: choosing that is `resolveVariantComponent`'s job, on the kind.
 */
export interface InterruptAnswerField {
  name: string;
  label: string;
  description: string;
  required: boolean;
  valueType: ContextValueType;
  /** JSON Schema `enum` — the closed set of admissible values, if any. */
  options: string[];
  /** A registered content-IR kind the property declares, if any. */
  kind: string | null;
  /** A named variant registered ON that kind, selected by name. */
  variant: string | null;
}

/** The free-text field a question with no schema hint collects. THE key is
 * `answer` because that is what `HumanInputOutput.answer` is populated from. */
export const FREE_TEXT_FIELD: InterruptAnswerField = {
  name: "answer",
  label: "Your answer",
  description: "",
  required: true,
  valueType: "string",
  options: [],
  kind: null,
  variant: null,
};

function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function enumOptions(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.enum)
    ? schema.enum.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * The fields the answer control collects, from the DERIVED schema hint.
 *
 * A hint that is not an object schema with properties (a bare `{"type":
 * "string"}`, an array schema, a malformed blob) yields the single free-text
 * field rather than an unanswerable form — the same call the flat parser made,
 * kept because a form that cannot express the answer is worse than a box.
 */
export function answerFieldsOf(
  schemaHint: Record<string, unknown> | null | undefined,
): InterruptAnswerField[] {
  if (!isRecord(schemaHint)) return [FREE_TEXT_FIELD];
  const properties = schemaHint.properties;
  if (!isRecord(properties) || Object.keys(properties).length === 0) {
    return [FREE_TEXT_FIELD];
  }
  const required = new Set(
    Array.isArray(schemaHint.required)
      ? schemaHint.required.filter((v): v is string => typeof v === "string")
      : [],
  );
  const fields: InterruptAnswerField[] = [];
  for (const [name, rawSchema] of Object.entries(properties)) {
    const schema = isRecord(rawSchema) ? rawSchema : {};
    fields.push({
      name,
      label: str(schema.title).trim() || humanizeKey(name),
      description: str(schema.description).trim(),
      required: required.has(name),
      valueType: valueTypeFromJsonSchema(schema),
      options: enumOptions(schema),
      // A property may name the kind its value IS, and select one of that
      // kind's registered variants BY NAME. Never an ad-hoc component.
      kind: str(schema.kind).trim() || str(schema.__kind).trim() || null,
      variant: str(schema.variant).trim() || null,
    });
  }
  return fields.length > 0 ? fields : [FREE_TEXT_FIELD];
}

/** THE one definition of "no value entered" — mirrors the run form's. */
export function missingAnswer(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Which required fields still block the send. */
export function unansweredFields(
  fields: readonly InterruptAnswerField[],
  values: Record<string, unknown>,
): InterruptAnswerField[] {
  return fields.filter((f) => f.required && missingAnswer(values[f.name]));
}

// ---------------------------------------------------------------------------
// The approval preset (§4.2)
// ---------------------------------------------------------------------------

/** The resume body an Approve / Reject click posts — the SAME shape a form
 * posts, to the SAME `/runs/{id}/resume` endpoint. No second path exists. */
export function approvalResumeValue(
  approved: boolean,
  note: string,
): Record<string, unknown> {
  const trimmed = note.trim();
  return trimmed ? { approved, note: trimmed } : { approved };
}

/**
 * True when this question is an approval. The preset is authoritative; a
 * question whose derived schema happens to be `{approved, note}` counts too,
 * so an author who hand-wrote that schema before the preset existed still gets
 * the buttons rather than a raw boolean field.
 */
export function isApprovalQuestion(view: InterruptQuestionView): boolean {
  if (view.preset === "approval") return true;
  const properties = isRecord(view.schemaHint)
    ? view.schemaHint.properties
    : null;
  if (!isRecord(properties)) return false;
  const keys = Object.keys(properties);
  return (
    keys.includes("approved") &&
    keys.every((k) => k === "approved" || k === "note")
  );
}

// ---------------------------------------------------------------------------
// The deadline, while the question is still waiting
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * "auto-continues in 12 min" — the whole line, tight, or null when this
 * question has no deadline (the wait-forever default, which must not grow a
 * countdown it does not have).
 *
 * Past the deadline the copy stops promising a future: the fallback is
 * entitled to decide from that instant, and pretending otherwise is the lie
 * this line exists to avoid.
 */
export function escalationLine(
  escalation: InterruptEscalation | null,
  now: number = Date.now(),
): string | null {
  if (!escalation) return null;
  const deadline = Date.parse(escalation.deadlineAt);
  if (Number.isNaN(deadline)) return null;
  const remaining = deadline - now;
  const who =
    escalation.fallback === "default_answer" ? "the default answer" : "an agent";
  if (remaining <= 0) return `Past the deadline — ${who} may decide now`;
  return `Auto-continues in ${humanRemaining(remaining)} — ${who} decides`;
}

/** Tight duration copy: "45 sec", "12 min", "3 hr", "2 days". */
export function humanRemaining(ms: number): string {
  if (ms < MINUTE_MS) return `${Math.max(1, Math.round(ms / 1000))} sec`;
  if (ms < HOUR_MS) return `${Math.round(ms / MINUTE_MS)} min`;
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)} hr`;
  const days = Math.round(ms / DAY_MS);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

// ---------------------------------------------------------------------------
// Provenance on a SETTLED decision (§4.2: "surfaced, always")
// ---------------------------------------------------------------------------

export type DecisionAuthority = "human" | "agent" | "default";

/** `HumanInputOutput.matrx_decision` — the engine's audit record of WHO. */
export interface DecisionProvenanceView {
  authority: DecisionAuthority;
  actorLabel: string | null;
  actorId: string | null;
  escalated: boolean;
  decidedAt: string | null;
  reason: string | null;
}

export function parseDecisionProvenance(
  value: unknown,
): DecisionProvenanceView | null {
  if (!isRecord(value)) return null;
  const authority = str(value.authority);
  if (authority !== "human" && authority !== "agent" && authority !== "default") {
    return null;
  }
  return {
    authority,
    actorLabel: str(value.actor_label).trim() || null,
    actorId: str(value.actor_id).trim() || null,
    escalated: value.escalated === true,
    decidedAt: str(value.decided_at).trim() || null,
    reason: str(value.reason).trim() || null,
  };
}

/** One settled `control.human_input` decision, as a surface reads it. */
export interface SettledDecision {
  nodeId: string;
  /** True/false for an approval; null when the answer was not an approval. */
  approved: boolean | null;
  /** The free-text / structured answer, for a non-approval decision. */
  answer: unknown;
  note: string | null;
  provenance: DecisionProvenanceView | null;
}

/**
 * Read one `control.human_input` settled output.
 *
 * The engine folds keys the node did not declare into `extras`
 * (`matrx_graph.executor.client_payload`), so an approval's `approved`/`note`
 * land THERE, not at the root — both places are read, root first, because an
 * author who declared them keeps them at the root.
 */
export function readSettledDecision(
  nodeId: string,
  output: Record<string, unknown> | null | undefined,
): SettledDecision | null {
  if (!isRecord(output)) return null;
  const extras = isRecord(output.extras) ? output.extras : {};
  const approvedRaw =
    typeof output.approved === "boolean"
      ? output.approved
      : typeof extras.approved === "boolean"
        ? extras.approved
        : null;
  const note = str(output.note).trim() || str(extras.note).trim() || null;
  return {
    nodeId,
    approved: approvedRaw,
    answer: output.answer ?? null,
    note,
    provenance: parseDecisionProvenance(output.matrx_decision),
  };
}

/**
 * THE provenance sentence. Never "Approved" on its own.
 *
 * "Approved by Dana Reyes" · "Auto-approved by Decision Fallback after the
 * deadline" · "Auto-approved by the default answer after the deadline". A
 * decision with no stamp at all reads "Approved — decider not recorded",
 * which is the honest answer and a visible defect, not a silent implication
 * that a person did it.
 */
export function decisionLine(decision: SettledDecision): string {
  const verb =
    decision.approved === true
      ? "Approved"
      : decision.approved === false
        ? "Rejected"
        : "Decided";
  const provenance = decision.provenance;
  if (!provenance) return `${verb} — decider not recorded`;
  if (provenance.authority === "human") {
    return `${verb} by ${provenance.actorLabel ?? "a person"}`;
  }
  const auto = decision.approved === null ? "Auto-decided" : `Auto-${verb.toLowerCase()}`;
  const who =
    provenance.authority === "default"
      ? "the default answer"
      : (provenance.actorLabel ?? "an agent");
  return `${auto} by ${who} after the deadline`;
}
