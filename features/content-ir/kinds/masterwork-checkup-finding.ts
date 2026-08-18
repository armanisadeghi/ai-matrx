/**
 * `masterwork_checkup_finding` — ONE thing the Final Checkup believes the
 * system got wrong or missed, shaped as the sentence the Expert actually reads.
 *
 * ## The order IS the shape
 *
 * Arman, 2026-08-18, on the first Final Checkup he ran:
 *
 *   "The content is presented in a very confusing way and there is absolutely
 *   no information telling the user what this is. What is messing this up is
 *   the order and the structure. The order needs to be: You said this → They
 *   created this → Here is what is missing or wrong → Here is the version
 *   recommended. Notice how that actually flows."
 *
 * So the four steps are four fields, named after the steps, and the component
 * renders them in exactly that order:
 *
 *   1. `you_said`         — his verbatim words (+ `said_where`, the door back)
 *   2. `current_rule`     — the rule the system made; ABSENT means nothing was
 *                           made for this, which the component says out loud
 *   3. `gap`              — what is missing or wrong, in plain language
 *   4. `recommended_rule` — the version he acts on
 *
 * ## Why it is a registered kind at all
 *
 * Because the alternative was a bespoke renderer, and because the findings must
 * arrive LIVE. aidream now scans each producer agent's own token stream and
 * releases each finding the moment it is written and has passed the evidence
 * gate (`aidream/services/masterwork_checkup/streaming_producer.py`), attaching
 * this value to the typed `masterwork_checkup_finding` event. `processStream`
 * promotes `data.content_ir` into a real render block at the ONE chokepoint, so
 * the canonical pipeline draws each finding as it lands — the checkup surface
 * parses nothing and owns no renderer.
 *
 * The Python mirror is `aidream/services/masterwork_checkup/finding_ir.py`;
 * changing either contract means changing both.
 *
 * COMPLETE bridge, deliberately, not a streaming one: the server gates a whole
 * finding before emitting it, so a half-written finding never exists on the
 * wire. Findings stream — fields within one do not.
 */

import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

/** The verb the Expert is being asked to approve. */
export type CheckupChange = "add" | "modify" | "retire";

/** The registered kind slug — named once, never spelled by hand elsewhere. */
export const CHECKUP_FINDING_KIND = "masterwork_checkup_finding";

/** The write target the rendered finding's four verbs act through. */
export const CHECKUP_DECISION_WRITE_TARGET = "checkup_decision";

/** The UI-state key the Final Checkup publishes so the verbs light up. */
export const CHECKUP_DECISION_UI_STATE_KEY = "masterwork_checkup_decisions";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const masterworkCheckupRuleKindSchema: KindSchema = {
  kind: "masterwork_checkup_rule",
  fields: {
    name: {
      type: "string",
      required: true,
      description: "The rule's short name, as it reads in the Rulebook.",
    },
    statement: {
      type: "string",
      required: true,
      description: "The rule itself, in one or two sentences.",
    },
    rationale: { type: "string", description: "Why the rule matters." },
    detection: {
      type: "string",
      description: "How you would catch someone breaking it.",
    },
    severity: {
      type: "enum",
      values: ["critical", "major", "minor"],
      required: true,
      description: "How bad breaking this rule is.",
    },
    section: {
      type: "string",
      description: "The Rulebook section code this rule files under.",
    },
    rule_id: {
      type: "string",
      description:
        "The live Rulebook rule id, when this is a rule that already exists. Audits cite it and it never changes.",
    },
  },
};

export const masterworkCheckupFindingKindSchema: KindSchema = {
  kind: "masterwork_checkup_finding",
  fields: {
    finding_id: {
      type: "string",
      required: true,
      description: "Identifies this finding for the whole checkup run.",
    },
    change: {
      type: "enum",
      values: ["add", "modify", "retire"],
      required: true,
      description: "What the Expert is being asked to do.",
    },
    you_said: {
      type: "string",
      required: true,
      description:
        "STEP 1 — the Expert's own verbatim words. Never paraphrased; a finding without them never reaches the Expert.",
    },
    said_where: {
      type: "inline_object",
      open: true,
      fields: {
        conversation_id: { type: "string" },
        message_id: { type: "string" },
        file_id: { type: "string" },
      },
      description: "STEP 1's door — where the Expert said it.",
    },
    current_rule: {
      type: "object",
      kind: "masterwork_checkup_rule",
      description:
        "STEP 2 — the rule the system actually made. Absent means nothing was made for this.",
    },
    gap: {
      type: "string",
      required: true,
      description:
        "STEP 3 — what is missing or wrong, in the Expert's own terms, never model jargon.",
    },
    recommended_rule: {
      type: "object",
      kind: "masterwork_checkup_rule",
      description: "STEP 4 — the version recommended. This is the thing acted on.",
    },
    alternatives: {
      type: "array",
      itemKinds: ["masterwork_checkup_rule"],
      description:
        "Other wordings the checkup genuinely saw. The Expert picks one; recommended_rule stays the recommendation.",
    },
    belongs_in: {
      type: "string",
      description: "The Rulebook section this would live in, by its label.",
    },
    confidence: {
      type: "number",
      min: 0,
      max: 1,
      description: "How sure the checkup is. Rendered honestly.",
    },
    found_by: {
      type: "string",
      description: "Which checkup pass found it.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const MASTERWORK_CHECKUP_KIND_SCHEMAS: KindSchema[] = [
  masterworkCheckupFindingKindSchema,
  masterworkCheckupRuleKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge
// ---------------------------------------------------------------------------

export interface CheckupRuleData {
  name: string;
  statement: string;
  rationale: string | null;
  detection: string | null;
  severity: "critical" | "major" | "minor";
  section: string | null;
  ruleId: string | null;
}

export interface CheckupWhere {
  conversationId: string | null;
  messageId: string | null;
  fileId: string | null;
}

export interface CheckupFindingData {
  findingId: string;
  change: CheckupChange;
  youSaid: string;
  saidWhere: CheckupWhere | null;
  currentRule: CheckupRuleData | null;
  gap: string;
  recommendedRule: CheckupRuleData | null;
  alternatives: CheckupRuleData[];
  belongsIn: string | null;
  confidence: number;
  foundBy: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRule(value: unknown): CheckupRuleData | null {
  if (!isRecordValue(value)) return null;
  const statement = text(value.statement);
  const name = text(value.name);
  if (!statement && !name) return null;
  const rawSeverity = text(value.severity);
  const severity =
    rawSeverity === "critical" || rawSeverity === "minor" ? rawSeverity : "major";
  return {
    name: name ?? "Untitled rule",
    statement: statement ?? "",
    rationale: text(value.rationale),
    detection: text(value.detection),
    severity,
    section: text(value.section),
    ruleId: text(value.rule_id),
  };
}

function readWhere(value: unknown): CheckupWhere | null {
  if (!isRecordValue(value)) return null;
  const where: CheckupWhere = {
    conversationId: text(value.conversation_id),
    messageId: text(value.message_id),
    fileId: text(value.file_id),
  };
  return where.conversationId || where.fileId ? where : null;
}

export const masterworkCheckupFindingServerData = makeCompleteEnvelopeBridge<
  CheckupFindingData & Record<string, unknown>
>("masterwork_checkup_finding", (value) => {
  const findingId = text(value.finding_id);
  const youSaid = text(value.you_said);
  // A finding with no id cannot be decided on, and one with no quote is the
  // exact thing the evidence gate exists to refuse. Render nothing rather than
  // an undecidable card.
  if (!findingId || !youSaid) return undefined;

  const rawChange = text(value.change);
  const change: CheckupChange =
    rawChange === "modify" || rawChange === "retire" ? rawChange : "add";

  const alternatives = Array.isArray(value.alternatives)
    ? value.alternatives
        .map(readRule)
        .filter((rule): rule is CheckupRuleData => rule !== null)
    : [];

  const confidence = typeof value.confidence === "number" ? value.confidence : 0;

  return {
    findingId,
    change,
    youSaid,
    saidWhere: readWhere(value.said_where),
    currentRule: readRule(value.current_rule),
    gap: text(value.gap) ?? "",
    recommendedRule: readRule(value.recommended_rule),
    alternatives,
    belongsIn: text(value.belongs_in),
    confidence: Math.min(1, Math.max(0, confidence)),
    foundBy: text(value.found_by),
  };
});

// ---------------------------------------------------------------------------
// toMarkdown — the same four steps, in prose
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "finding_id",
  "change",
  "you_said",
  "said_where",
  "current_rule",
  "gap",
  "recommended_rule",
  "alternatives",
  "belongs_in",
  "confidence",
  "found_by",
];

const CHANGE_HEADINGS: Record<CheckupChange, string> = {
  add: "A rule you never wrote down",
  modify: "A rule that says less than you meant",
  retire: "A rule that no longer holds",
};

function ruleMarkdown(heading: string, rule: CheckupRuleData | null): string | null {
  if (!rule) return null;
  return joinBlocks([
    `### ${heading}`,
    `**${rule.name}** (${rule.severity})`,
    rule.statement,
    rule.rationale ? `*Why it matters:* ${rule.rationale}` : null,
    rule.detection ? `*How to spot a violation:* ${rule.detection}` : null,
  ]);
}

export function masterworkCheckupFindingMarkdown(
  value: Record<string, unknown>,
): string {
  const rawChange = text(value.change);
  const change: CheckupChange =
    rawChange === "modify" || rawChange === "retire" ? rawChange : "add";
  const current = readRule(value.current_rule);

  return joinBlocks([
    `## ${CHANGE_HEADINGS[change]}`,
    `### You said this`,
    `> ${text(value.you_said) ?? ""}`,
    current
      ? ruleMarkdown("They created this", current)
      : "### They created this\n\nNothing was created for this.",
    `### What's missing or wrong`,
    text(value.gap),
    ruleMarkdown("The recommended version", readRule(value.recommended_rule)),
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions
// ---------------------------------------------------------------------------

export const MASTERWORK_CHECKUP_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "masterwork_checkup_finding",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "masterwork_checkup_finding",
    toLegacyServerData: masterworkCheckupFindingServerData,
    toMarkdown: masterworkCheckupFindingMarkdown,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: masterworkCheckupFindingKindSchema,
  },
  {
    kind: "masterwork_checkup_rule",
    schemaSource: "system",
    tier: "eager",
    schema: masterworkCheckupRuleKindSchema,
  },
];
