/**
 * Surface manifest — Quick Answers (`matrx-user/keyword-quick-answers`).
 *
 * Overlay surface for the five-keyword ruling window. The canonical
 * `QuickAnswers` child owns the loaded dimension catalogue, server-selected
 * question, keyword batch, session progress, reason draft, and the existing
 * `setKeywordStamps` persistence path. It exposes that live state to the
 * window's nested `SurfaceRuntimeProvider` at trigger time.
 *
 * Answer submission is deliberately NOT a write target. Picking a value
 * persists a semantic keyword ruling immediately, so that decision stays on
 * the existing explicit user buttons. Agents may stage the optional reason or
 * move the active question; neither action submits an answer.
 */

import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import type {
  BatchKeyword,
  BatchQuestion,
} from "@/features/marketing/seo/value-system/workbench/session/batch";
import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const KEYWORD_QUICK_ANSWERS_SURFACE_NAME =
  "matrx-user/keyword-quick-answers";

const groups: SurfaceValueGroup[] = [
  {
    key: "site_identity",
    label: "Site identity",
    sortOrder: 100,
    description: "The managed site whose keywords are being classified.",
  },
  {
    key: "question",
    label: "Active question",
    sortOrder: 200,
    description:
      "The loaded dimension catalogue and the question currently being asked.",
  },
  {
    key: "keyword_batch",
    label: "Keyword batch",
    sortOrder: 300,
    description:
      "The five current keywords, their demand evidence, and the choices still awaiting answers.",
  },
  {
    key: "session",
    label: "Answering session",
    sortOrder: 400,
    description:
      "The live reason draft, answered/seen progress, and request state for this window session.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "site_summary",
    label: "Site summary",
    description:
      "Composite identity of the managed site as { id, label }. Always present while the window is mounted; label is null when the opener did not supply one.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 100,
    group: "site_identity",
    sortOrder: 100,
  },
  {
    name: "site_id",
    label: "Site ID",
    description:
      "UUID of the managed web.site whose keywords are being answered. Always present because the window refuses to render without it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "site_identity",
    sortOrder: 110,
  },
  {
    name: "site_label",
    label: "Site label",
    description:
      "Human label supplied by the opening Value Workbench for the managed site. Empty when the opener has only the site ID.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "site_identity",
    sortOrder: 120,
  },
  {
    name: "dimension_catalog",
    label: "Question catalogue",
    description:
      "Every keyword dimension available to this site, including each dimension's metadata and answer choices. Always an array while mounted; empty during initial loading or when the site has no dimensions.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 12000,
    autoContext: false,
    group: "question",
    sortOrder: 200,
  },
  {
    name: "active_dimension",
    label: "Active dimension",
    description:
      "Full catalogue entry for the question currently shown, including metadata and choices. Empty while loading or when no usable question exists.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2200,
    autoContext: false,
    group: "question",
    sortOrder: 210,
  },
  {
    name: "active_dimension_id",
    label: "Active dimension ID",
    description:
      "Canonical dimension UUID for the question currently shown. Empty while loading or when no usable question exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "question",
    sortOrder: 220,
  },
  {
    name: "active_dimension_slug",
    label: "Active dimension slug",
    description:
      "Stable slug of the question currently shown. Empty while loading or when the server finds no question worth asking.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "question",
    sortOrder: 230,
  },
  {
    name: "active_dimension_label",
    label: "Active question label",
    description:
      "Human question label rendered above the current batch. Empty while loading or when no usable question exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "question",
    sortOrder: 240,
  },
  {
    name: "active_dimension_scope",
    label: "Active dimension scope",
    description:
      "Whether the active question is platform-wide or authored for this site. Empty while loading or when no usable question exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "question",
    sortOrder: 250,
  },
  {
    name: "active_dimension_choices",
    label: "Answer choices",
    description:
      "Choices offered for the active question, including IDs, labels, descriptions, abstain state, and evidence metadata. Always an array; empty until the active dimension loads or when it has no choices.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    group: "question",
    sortOrder: 260,
  },
  {
    name: "current_question",
    label: "Current question",
    description:
      "Composite server response for this batch: selected dimension, explanation, keyword rows, and remaining-unanswered count. Empty until the batch query resolves.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    autoContext: false,
    group: "question",
    sortOrder: 270,
  },
  {
    name: "question_reason",
    label: "Question reason",
    description:
      "Server-authored explanation of why this question was selected now. Empty when the server supplied no explanation or no question exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "question",
    sortOrder: 280,
  },
  {
    name: "remaining_unanswered",
    label: "Remaining unanswered",
    description:
      "Number of site keywords still lacking an answer for the active dimension. Empty until the current batch query resolves; zero means the dimension is complete.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 7,
    group: "question",
    sortOrder: 290,
  },
  {
    name: "current_keywords",
    label: "Current keywords",
    description:
      "The current batch of up to five keyword rows with id, phrase, clicks, impressions, and why each row was selected. Always an array; empty while loading or when nothing remains.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1600,
    group: "keyword_batch",
    sortOrder: 300,
  },
  {
    name: "outstanding_keywords",
    label: "Outstanding keywords",
    description:
      "Subset of current_keywords that has not been answered in this visible batch. Always an array; empty once every visible keyword is answered or no batch exists.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1600,
    group: "keyword_batch",
    sortOrder: 310,
  },
  {
    name: "answered_results",
    label: "Answered results",
    description:
      "Map of keyword ID to the answer label successfully persisted during the visible batch. Always an object; empty before the first successful answer or after changing questions.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    group: "keyword_batch",
    sortOrder: 320,
  },
  {
    name: "reason_draft",
    label: "Answer reason draft",
    description:
      "Optional explanation currently typed beneath the batch. Always a string; empty means future explicit answer clicks persist no note.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 300,
    group: "session",
    sortOrder: 400,
  },
  {
    name: "answered_this_session",
    label: "Session answered count",
    description:
      "Number of keywords successfully answered since this window mounted. Always populated and starts at zero.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "session",
    sortOrder: 410,
  },
  {
    name: "seen_keyword_ids",
    label: "Seen keyword IDs",
    description:
      "IDs skipped or completed in earlier batches during this window session so the server does not immediately repeat them. Always an array and starts empty.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1000,
    autoContext: false,
    group: "session",
    sortOrder: 420,
  },
  {
    name: "all_done",
    label: "Visible batch complete",
    description:
      "True when every keyword in the visible non-empty batch has a persisted answer. Always populated; false while loading, on an empty batch, or while answers remain.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "session",
    sortOrder: 430,
  },
  {
    name: "is_loading",
    label: "Questions loading",
    description:
      "True while either the dimension catalogue or current keyword batch is loading or refreshing. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    autoContext: false,
    group: "session",
    sortOrder: 440,
  },
  {
    name: "is_saving",
    label: "Answer saving",
    description:
      "True while an explicit user answer is being persisted through setKeywordStamps. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    autoContext: false,
    group: "session",
    sortOrder: 450,
  },
  {
    name: "session_progress",
    label: "Session progress",
    description:
      "Composite progress snapshot as { answered, seen, visible, outstanding, all_done, loading, saving }. Always present while the window is mounted.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 180,
    autoContext: false,
    group: "session",
    sortOrder: 460,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "reason_draft",
    label: "Answer reason draft",
    description:
      "Replaces the optional reason text staged beneath the current batch. This does not answer or persist any keyword; the user still chooses an answer button, which is the existing explicit save action.",
    valueType: "string",
    updatesValue: "reason_draft",
    mode: "draft",
    applyPolicy: "auto",
    group: "session",
    sortOrder: 100,
  },
  {
    name: "active_dimension_slug",
    label: "Active dimension slug",
    description:
      "Moves the window to another loaded question by its stable slug. This changes only UI focus and fetches the corresponding next batch; it never persists an answer.",
    valueType: "string",
    updatesValue: "active_dimension_slug",
    mode: "ui",
    applyPolicy: "ask",
    group: "question",
    sortOrder: 110,
  },
];

export const keywordQuickAnswersManifest: SurfaceManifest = {
  surfaceName: KEYWORD_QUICK_ANSWERS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest, trigger-time emitter, v3 menus, Locate anchors, and write handlers are wired; DB mirror sync and isolated live Browser proof are still pending before verified.",
  overlayId: "keywordQuickAnswersWindow",
  label: "Quick Answers",
  intro: `<surface_intro>
You are in Quick Answers, the focused five-keyword classification window opened from the Keyword Value Workbench for one managed site. The active question is a governed keyword dimension; current_keywords carries the demand evidence that selected each phrase, active_dimension_choices carries the allowed answers, and question_reason explains why this question is being asked now.
The user may answer one keyword or apply the same answer to every outstanding keyword. A reason draft is optional and rides with each explicit answer as learning evidence. answered_results and session_progress describe only confirmed writes from this mounted session; they are not proposals.
Never invent an answer outside active_dimension_choices or treat an unanswered keyword as classified. Answer submission is deliberately human-controlled: agents may stage the reason or suggest/move the active question, but only the user's existing answer buttons persist keyword rulings.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline(
      "selection",
      "text_before",
      "text_after",
      "content",
      "context",
    ),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "classification_advisor",
      label: "Classification advisor",
      description:
        "Uses the active governed question, allowed choices, and keyword demand evidence to explain classifications without submitting them.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

export interface KeywordQuickAnswersScopeValues {
  site_summary: { id: string; label: string | null };
  site_id: string;
  site_label?: string;
  dimension_catalog: FacetDimension[];
  active_dimension?: FacetDimension;
  active_dimension_id?: string;
  active_dimension_slug?: string;
  active_dimension_label?: string;
  active_dimension_scope?: FacetDimension["scope"];
  active_dimension_choices: FacetDimension["values"];
  current_question?: BatchQuestion;
  question_reason?: string;
  remaining_unanswered?: number;
  current_keywords: BatchKeyword[];
  outstanding_keywords: BatchKeyword[];
  answered_results: Record<string, string>;
  reason_draft: string;
  answered_this_session: number;
  seen_keyword_ids: string[];
  all_done: boolean;
  is_loading: boolean;
  is_saving: boolean;
  session_progress: {
    answered: number;
    seen: number;
    visible: number;
    outstanding: number;
    all_done: boolean;
    loading: boolean;
    saving: boolean;
  };
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
}

/** Type-safe scope builder; required fields mirror every Always value above. */
export function createKeywordQuickAnswersScope(
  values: KeywordQuickAnswersScopeValues,
): SurfaceScopePayload {
  const scope: SurfaceScopePayload = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) scope[key] = value;
  }
  return scope;
}
