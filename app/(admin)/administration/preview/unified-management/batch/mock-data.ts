/**
 * THE BATCH STUDIO — mock model (preview only).
 *
 * This is the shortcut batch grid ELEVATED to the whole platform: instead of
 * "one shortcut × many surfaces", it authors **any set of jobs × any set of
 * places** in one pass — bindings AND treatments riding the same cascade:
 *
 *   Template value  →  "Set for all"  →  Per-cell override
 *
 * Nothing is ever locked. Every field can be flipped to per-cell; every
 * auto-resolution can be overridden by hand.
 *
 * All data here is fabricated for the preview. No network, no Redux, no writes.
 */

import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Known values — UUID-identified, kind-typed, key-labeled slots.
// IDENTITY RESOLVES; KEYS DESCRIBE. Two orgs can both have a `case_number`
// and they are NOT the same value.
// ─────────────────────────────────────────────────────────────────────────────

export interface KnownValue {
  /** The identity. Bindings reference THIS, never the key. */
  id: string;
  /** The description. A bare key never resolves anything. */
  key: string;
  label: string;
  scope: "system-interaction" | "system-context" | "org" | "user";
  /** Which owner's vocabulary this belongs to — shown in re-match chips. */
  owner: string;
}

export const KNOWN_VALUES = {
  selection: {
    id: "kv-4f0a1b32",
    key: "selection",
    label: "Selection",
    scope: "system-interaction",
    owner: "Platform",
  },
  content: {
    id: "kv-9c22d740",
    key: "content",
    label: "Content",
    scope: "system-interaction",
    owner: "Platform",
  },
  currentDate: {
    id: "kv-2a7e6011",
    key: "current_date",
    label: "Current date",
    scope: "system-context",
    owner: "Platform",
  },
  uiLanguage: {
    id: "kv-b1d95c84",
    key: "system.ui_language",
    label: "UI language",
    scope: "system-context",
    owner: "Platform",
  },
  caseNumberOurs: {
    id: "kv-6e30ff12",
    key: "case_number",
    label: "Case number",
    scope: "org",
    owner: "Cases",
  },
  caseNumberTheirs: {
    id: "kv-c8471aa9",
    key: "case_number",
    label: "Case number",
    scope: "org",
    owner: "their Cases",
  },
  clientName: {
    id: "kv-31b0e5cd",
    key: "client_name",
    label: "Client name",
    scope: "org",
    owner: "Cases",
  },
  statusSummary: {
    id: "kv-77af0b6e",
    key: "status_summary",
    label: "Status summary",
    scope: "org",
    owner: "Cases",
  },
} as const satisfies Record<string, KnownValue>;

// ─────────────────────────────────────────────────────────────────────────────
// Jobs — one mandate record, referenced or discovered.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsumedKey {
  /** The key this job consumes. */
  key: string;
  label: string;
  required: boolean;
  /** The known value the TEMPLATE bound, by identity. Null = template prompts. */
  templateValueId: string | null;
}

export type JobHolder = "agent" | "user_agent" | "workflow";

export interface MandateJob {
  key: string;
  label: string;
  goal: string;
  outputKind: string;
  /** Referenced by a place, or discovered at it. */
  meeting: "referenced" | "discovered";
  holder: JobHolder;
  holderLabel: string;
  consumes: readonly ConsumedKey[];
}

export const JOBS: readonly MandateJob[] = [
  {
    key: "utility.translate_selection",
    label: "Translate selection",
    goal: "Translate the selection, keep tone",
    outputKind: "markdown",
    meeting: "discovered",
    holder: "agent",
    holderLabel: "Linguist · floating",
    consumes: [
      {
        key: "selection",
        label: "Selection",
        required: true,
        templateValueId: KNOWN_VALUES.selection.id,
      },
      {
        key: "system.ui_language",
        label: "UI language",
        required: false,
        templateValueId: KNOWN_VALUES.uiLanguage.id,
      },
    ],
  },
  {
    key: "case.draft_status_email",
    label: "Draft status email",
    goal: "Draft the client status email",
    outputKind: "markdown",
    meeting: "discovered",
    holder: "user_agent",
    holderLabel: "Arman's own agent",
    consumes: [
      {
        key: "case_number",
        label: "Case number",
        required: true,
        templateValueId: KNOWN_VALUES.caseNumberOurs.id,
      },
      {
        key: "client_name",
        label: "Client name",
        required: true,
        templateValueId: KNOWN_VALUES.clientName.id,
      },
      {
        key: "status_summary",
        label: "Status summary",
        required: false,
        templateValueId: KNOWN_VALUES.statusSummary.id,
      },
    ],
  },
  {
    key: "content.summarize_page",
    label: "Summarize this page",
    goal: "Three-bullet summary of what is on screen",
    outputKind: "markdown",
    meeting: "discovered",
    holder: "agent",
    holderLabel: "Summarizer · floating",
    consumes: [
      {
        key: "content",
        label: "Content",
        required: true,
        templateValueId: KNOWN_VALUES.content.id,
      },
    ],
  },
  {
    key: "crm.next_best_action",
    label: "Next best action",
    goal: "The rep's one next action",
    outputKind: "next_best_action",
    meeting: "referenced",
    holder: "agent",
    holderLabel: "CRM coach · pinned",
    consumes: [
      {
        key: "case_number",
        label: "Case number",
        required: true,
        templateValueId: KNOWN_VALUES.caseNumberOurs.id,
      },
      {
        key: "client_name",
        label: "Client name",
        required: false,
        templateValueId: KNOWN_VALUES.clientName.id,
      },
    ],
  },
  {
    key: "ops.daily_digest",
    label: "Daily digest",
    goal: "Roll today's activity into a digest",
    outputKind: "markdown",
    meeting: "discovered",
    holder: "workflow",
    holderLabel: "Digest workflow · v4",
    consumes: [
      {
        key: "current_date",
        label: "Current date",
        required: true,
        templateValueId: KNOWN_VALUES.currentDate.id,
      },
      {
        key: "status_summary",
        label: "Status summary",
        required: false,
        templateValueId: KNOWN_VALUES.statusSummary.id,
      },
    ],
  },
  {
    key: "utility.rewrite_tone",
    label: "Rewrite tone",
    goal: "Rewrite the selection in the chosen tone",
    outputKind: "markdown",
    meeting: "discovered",
    holder: "agent",
    holderLabel: "Editor · floating",
    consumes: [
      {
        key: "selection",
        label: "Selection",
        required: true,
        templateValueId: KNOWN_VALUES.selection.id,
      },
      {
        key: "content",
        label: "Content",
        required: false,
        templateValueId: KNOWN_VALUES.content.id,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Places — surfaces, apps, pages, kind components. Places ACQUIRE discovered
// jobs; they never require them. A place may explicitly exclude one.
// ─────────────────────────────────────────────────────────────────────────────

export interface Place {
  name: string;
  label: string;
  client: string;
  /** The known values this place can read/write, by identity. */
  provides: readonly KnownValue[];
  /** Job keys this place explicitly refuses. */
  excludes?: readonly string[];
  note?: string;
}

export const PLACES: readonly Place[] = [
  {
    name: "editor.rich_text",
    label: "Rich Text Editor",
    client: "matrx-frontend",
    provides: [
      KNOWN_VALUES.selection,
      KNOWN_VALUES.content,
      KNOWN_VALUES.currentDate,
      KNOWN_VALUES.uiLanguage,
    ],
    note: "Satisfies every interaction key",
  },
  {
    name: "crm.case_detail",
    label: "Cases · Detail",
    client: "matrx-frontend",
    provides: [
      KNOWN_VALUES.selection,
      KNOWN_VALUES.content,
      KNOWN_VALUES.currentDate,
      KNOWN_VALUES.uiLanguage,
      KNOWN_VALUES.caseNumberOurs,
      KNOWN_VALUES.clientName,
      KNOWN_VALUES.statusSummary,
    ],
    note: "Our own case vocabulary",
  },
  {
    name: "partner.cases_detail",
    label: "their Cases · Detail",
    client: "partner-portal",
    provides: [
      KNOWN_VALUES.selection,
      KNOWN_VALUES.content,
      KNOWN_VALUES.currentDate,
      KNOWN_VALUES.caseNumberTheirs,
      KNOWN_VALUES.clientName,
    ],
    note: "Same key names, different identities — every one needs confirming",
  },
  {
    name: "chat.thread",
    label: "Chat Thread",
    client: "matrx-frontend",
    provides: [
      KNOWN_VALUES.selection,
      KNOWN_VALUES.content,
      KNOWN_VALUES.currentDate,
    ],
    note: "No case vocabulary at all",
  },
  {
    name: "kiosk.punch",
    label: "Kiosk · Punch",
    client: "matrx-frontend",
    provides: [KNOWN_VALUES.content, KNOWN_VALUES.currentDate],
    excludes: ["utility.translate_selection", "utility.rewrite_tone"],
    note: "Shared tablet — excludes the text utilities by policy",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// The cascade — identical grammar to the shortcut batch grid.
// ─────────────────────────────────────────────────────────────────────────────

/** inherit = take the template's value · all = one value everywhere · cell = a grid column. */
export type CascadeMode = "inherit" | "all" | "cell";

export const CASCADE_MODES: ReadonlyArray<{ id: CascadeMode; label: string }> = [
  { id: "inherit", label: "Inherit" },
  { id: "all", label: "Set for all" },
  { id: "cell", label: "Per-cell" },
];

// ── Bindings ────────────────────────────────────────────────────────────────

export type BindingKind =
  | "known_value" // resolved by identity — quiet, auto-inherited
  | "rematch" // name-based suggestion the user must confirm
  | "direct_value"
  | "prompt_user"
  | "unresolved"; // nothing works — RED

export type Binding =
  | { kind: "known_value"; valueId: string }
  | { kind: "rematch"; valueId: string; confirmed: boolean }
  | { kind: "direct_value"; literal: string }
  | { kind: "prompt_user"; prompt: string }
  | { kind: "unresolved" };

/**
 * The three documented rules that make ONE mapping set portable across many
 * places — lifted verbatim from `BatchBindingCell` and generalised past
 * surfaces to any place:
 *
 *   1. the template's bound value exists here (same identity) → keep it, quiet.
 *   2. it does not, but a value with the same KEY does        → re-match by
 *      name, and make the human confirm it (keys are hints).
 *   3. neither                                                → prompt the user
 *      if the key is optional; go RED if it is required.
 */
export function autoResolve(consumed: ConsumedKey, place: Place): Binding {
  const byIdentity = place.provides.find(
    (v) => v.id === consumed.templateValueId,
  );
  if (byIdentity) return { kind: "known_value", valueId: byIdentity.id };

  const byKey = place.provides.find((v) => v.key === consumed.key);
  if (byKey) return { kind: "rematch", valueId: byKey.id, confirmed: false };

  if (!consumed.required)
    return { kind: "prompt_user", prompt: `Enter ${consumed.label}` };
  return { kind: "unresolved" };
}

export function valueById(id: string): KnownValue | undefined {
  return Object.values(KNOWN_VALUES).find((v) => v.id === id);
}

/** A binding is "settled" when it needs nothing further from a human. */
export function isSettled(b: Binding): boolean {
  if (b.kind === "unresolved") return false;
  if (b.kind === "rematch") return b.confirmed;
  return true;
}

// ── Treatments — the SAME cascade, applied to UI instead of data ────────────

export type TreatmentKey =
  | "displayMode"
  | "autoRun"
  | "hideVariables"
  | "iconName"
  | "categoryId";

export type TreatmentControl =
  | { kind: "display-mode" }
  | { kind: "boolean" }
  | { kind: "select"; options: ReadonlyArray<{ value: string; label: string }> };

export interface TreatmentFieldDef {
  key: TreatmentKey;
  label: string;
  group: "Display" | "Behavior" | "Identity";
  control: TreatmentControl;
  hint: string;
}

export const ICON_OPTIONS = [
  { value: "Languages", label: "Languages" },
  { value: "Mail", label: "Mail" },
  { value: "FileText", label: "File text" },
  { value: "Target", label: "Target" },
  { value: "CalendarDays", label: "Calendar" },
  { value: "BrainCircuit", label: "Brain circuit" },
] as const;

export const CATEGORY_OPTIONS = [
  { value: "cat-writing", label: "Writing" },
  { value: "cat-client", label: "Client work" },
  { value: "cat-ops", label: "Operations" },
  { value: "cat-uncategorized", label: "Uncategorized" },
] as const;

export const TREATMENT_FIELDS: readonly TreatmentFieldDef[] = [
  {
    key: "displayMode",
    label: "Display mode",
    group: "Display",
    control: { kind: "display-mode" },
    hint: "How the result meets the person — 13 modes, offered not obliged",
  },
  {
    key: "hideVariables",
    label: "Hide variables",
    group: "Display",
    control: { kind: "boolean" },
    hint: "Suppress the variable panel when every input is already bound",
  },
  {
    key: "autoRun",
    label: "Auto-run",
    group: "Behavior",
    control: { kind: "boolean" },
    hint: "A fully-mapped binding runs with no user input",
  },
  {
    key: "iconName",
    label: "Icon",
    group: "Identity",
    control: { kind: "select", options: ICON_OPTIONS },
    hint: "Lucide icon shown wherever this job is offered",
  },
  {
    key: "categoryId",
    label: "Category",
    group: "Identity",
    control: { kind: "select", options: CATEGORY_OPTIONS },
    hint: "Categories group and curate; they never gate availability",
  },
];

export type TreatmentValue = ResultDisplayMode | boolean | string;

export interface TreatmentValues {
  displayMode: ResultDisplayMode;
  hideVariables: boolean;
  autoRun: boolean;
  iconName: string;
  categoryId: string;
}

/** Level 1 of the cascade — the template every cell starts from. */
export const TEMPLATE_TREATMENT: TreatmentValues = {
  displayMode: "inline",
  hideVariables: true,
  autoRun: true,
  iconName: "BrainCircuit",
  categoryId: "cat-uncategorized",
};

export const TEMPLATE_LABEL = "Translate selection @ Rich Text Editor";

export function treatmentValueOf(
  values: TreatmentValues,
  key: TreatmentKey,
): TreatmentValue {
  return values[key];
}

export function formatTreatment(key: TreatmentKey, value: TreatmentValue): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (key === "categoryId")
    return (
      CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? String(value)
    );
  return String(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell addressing
// ─────────────────────────────────────────────────────────────────────────────

export function cellKey(
  jobKey: string,
  placeName: string,
  consumedKey: string,
): string {
  return `${jobKey}|${placeName}|${consumedKey}`;
}

export function pairKey(jobKey: string, placeName: string): string {
  return `${jobKey}|${placeName}`;
}

export function isExcluded(job: MandateJob, place: Place): boolean {
  return place.excludes?.includes(job.key) === true;
}

/**
 * Availability = capability. A discovered job shows where every key it consumes
 * has a path — but a MISSING key is not a hidden row here: it is a red cell the
 * author has to answer. Exclusion is the only thing that removes a pair.
 */
export function pairIsOffered(job: MandateJob, place: Place): boolean {
  return !isExcluded(job, place);
}

export const DEFAULT_SELECTED_JOBS: readonly string[] = [
  "utility.translate_selection",
  "case.draft_status_email",
  "ops.daily_digest",
];

export const DEFAULT_SELECTED_PLACES: readonly string[] = [
  "editor.rich_text",
  "crm.case_detail",
  "partner.cases_detail",
  "chat.thread",
  "kiosk.punch",
];
