/**
 * pr_play_menu → PrPlayMenuBlock bridge (+ compiled definitions for the whole family).
 *
 * What the PR Director (`seo.press_strategist`) embeds at the end of its markdown answer: a main play plus
 * backups, each of which is a BUTTON in the chat — the founder picks by clicking instead of typing
 * (BRIEFS-STRATEGY-AND-ORG-CHART §2 Output, PARITY X19). The kind is DATA FOR THE BUTTONS; the reader never
 * sees its field names.
 *
 *   { __kind:"pr_play_menu",
 *     plays: [ { __kind:"pr_play", title, why_this_founder, first_move, trap,
 *                effort: "one_or_two_moves"|"program",
 *                action?: { __kind:"pr_play_action", type:"run_member"|"run_workflow"|"open_surface",
 *                           target, inputs } } ],
 *     diagnosis?: { __kind:"pr_diagnosis", audience, goal, nearest_moment, buyer, confidence },
 *     peg?: { __kind:"pr_peg_check", text, passes_new, passes_timely, passes_others_care },
 *     next_move }
 *
 * THE DATABASE ROWS ARE THE SCHEMA OF RECORD (aidream `aidream/kinds/pr.py`, published to
 * `content_ir.kind_definition`). These schemas are the compiled bootstrap floor; warm rows override them.
 *
 * Complete-only bridge: a half-streamed menu would paint buttons whose action has not arrived yet.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";

import { isRecord, makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import { additionalDetailsSection, collectExtras, joinBlocks } from "./kind-markdown-utils";

export const PR_PLAY_MENU_KIND = "pr_play_menu";
export const PR_PLAY_KIND = "pr_play";
export const PR_PLAY_ACTION_KIND = "pr_play_action";
export const PR_DIAGNOSIS_KIND = "pr_diagnosis";
export const PR_PEG_CHECK_KIND = "pr_peg_check";
/** The render key `kind-route` sets `block.type` to. */
export const PR_PLAY_MENU_BLOCK_TYPE = "pr_play_menu";

export const prPlayActionKindSchema: KindSchema = {
  kind: PR_PLAY_ACTION_KIND,
  fields: {
    type: {
      type: "enum",
      values: ["run_member", "run_workflow", "open_surface"],
      required: true,
      description: "What the play's button starts: a specialist, a pipeline, or a screen.",
    },
    target: { type: "string", required: true },
    inputs: { type: "inline_object", open: true, fields: {} },
  },
};

export const prPlayKindSchema: KindSchema = {
  kind: PR_PLAY_KIND,
  fields: {
    title: { type: "string", required: true },
    why_this_founder: { type: "string", required: true },
    first_move: { type: "string", required: true },
    trap: { type: "string", required: true },
    effort: { type: "enum", values: ["one_or_two_moves", "program"], required: true },
    action: { type: "object", kind: PR_PLAY_ACTION_KIND, nullable: true },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const prDiagnosisKindSchema: KindSchema = {
  kind: PR_DIAGNOSIS_KIND,
  fields: {
    audience: { type: "string", required: true },
    goal: { type: "string", required: true },
    nearest_moment: { type: "string" },
    buyer: { type: "string" },
    confidence: { type: "enum", values: ["stated", "inferred"] },
  },
};

export const prPegCheckKindSchema: KindSchema = {
  kind: PR_PEG_CHECK_KIND,
  fields: {
    text: { type: "string", required: true },
    passes_new: { type: "boolean", required: true },
    passes_timely: { type: "boolean", required: true },
    passes_others_care: { type: "boolean", required: true },
  },
};

export const prPlayMenuKindSchema: KindSchema = {
  kind: PR_PLAY_MENU_KIND,
  fields: {
    plays: { type: "array", itemKinds: [PR_PLAY_KIND] },
    diagnosis: { type: "object", kind: PR_DIAGNOSIS_KIND, nullable: true },
    peg: { type: "object", kind: PR_PEG_CHECK_KIND, nullable: true },
    next_move: { type: "string" },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

// ---------------------------------------------------------------------------
// The view model the block renders — read defensively; the payload is untouched.
// ---------------------------------------------------------------------------

export type PrPlayActionType = "run_member" | "run_workflow" | "open_surface";

export interface PrPlayActionView {
  type: PrPlayActionType;
  target: string;
  inputs: Record<string, unknown>;
}

export interface PrPlayView {
  title: string;
  whyThisFounder: string;
  firstMove: string;
  trap: string;
  effort: "one_or_two_moves" | "program" | null;
  action: PrPlayActionView | null;
}

export interface PrPlayMenuServerData extends Record<string, unknown> {
  plays: PrPlayView[];
  nextMove: string;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readAction(value: unknown): PrPlayActionView | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  const target = str(value.target);
  if ((type !== "run_member" && type !== "run_workflow" && type !== "open_surface") || !target) return null;
  return { type, target, inputs: isRecord(value.inputs) ? value.inputs : {} };
}

export function readPrPlays(value: Record<string, unknown>): PrPlayView[] {
  const plays = Array.isArray(value.plays) ? value.plays.filter(isRecord) : [];
  return plays
    .map((play) => ({
      title: str(play.title),
      whyThisFounder: str(play.why_this_founder),
      firstMove: str(play.first_move),
      trap: str(play.trap),
      effort:
        play.effort === "one_or_two_moves" || play.effort === "program"
          ? (play.effort as "one_or_two_moves" | "program")
          : null,
      action: readAction(play.action),
    }))
    .filter((play) => play.title !== "");
}

export const prPlayMenuServerDataFromEnvelope = makeCompleteEnvelopeBridge<PrPlayMenuServerData>(
  PR_PLAY_MENU_KIND,
  (value) => {
    if (!Array.isArray(value.plays)) return undefined;
    return { plays: readPrPlays(value), nextMove: str(value.next_move) };
  },
);

const MD_KNOWN_KEYS = ["plays", "diagnosis", "peg", "next_move", KIND_KEY];

export function prPlayMenuMarkdownFromValue(value: Record<string, unknown>): string {
  const plays = readPrPlays(value);
  return joinBlocks([
    plays.length > 0
      ? plays
          .map(
            (play, i) =>
              `${i + 1}. **${play.title}** — ${play.whyThisFounder}\n   First move: ${play.firstMove}\n   Watch out: ${play.trap}`,
          )
          .join("\n")
      : null,
    str(value.next_move) ? `**Next:** ${str(value.next_move)}` : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

export const PR_PLAY_MENU_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: PR_PLAY_MENU_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: PR_PLAY_MENU_BLOCK_TYPE,
    toLegacyServerData: prPlayMenuServerDataFromEnvelope,
    toMarkdown: prPlayMenuMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: prPlayMenuKindSchema,
  },
  { kind: PR_PLAY_KIND, schemaSource: "system", tier: "eager", schema: prPlayKindSchema },
  { kind: PR_PLAY_ACTION_KIND, schemaSource: "system", tier: "eager", schema: prPlayActionKindSchema },
  { kind: PR_DIAGNOSIS_KIND, schemaSource: "system", tier: "eager", schema: prDiagnosisKindSchema },
  { kind: PR_PEG_CHECK_KIND, schemaSource: "system", tier: "eager", schema: prPegCheckKindSchema },
];
