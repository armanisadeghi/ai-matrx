/**
 * Decision review — data access.
 *
 * Reads AND labels go straight to Supabase as the signed-in person: reads
 * under RLS (`std_select` on platform.judge_verdict and the caller's own chat
 * rows), labels through `platform.label_decision_item` /
 * `platform.label_decision_conversations` — gated to members of the item's
 * organization, normalized by the ONE vocabulary
 * (`platform.normalize_decision_label`), so the queue and the battle verdict
 * column land identically. Only calibration goes to the server, because it is
 * computed by `matrx_ai.evaluators.calibration` (Cohen's kappa, reliability
 * curve, Brier). aidream `aidream/services/decision_review/FEATURE.md`.
 */

import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { callApi } from "@/lib/api/call-api";
import { isJsonObject } from "@/types/json";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";
import { getUserOrganizations } from "@/features/organizations/service";
import {
  DECISION_SUBJECT_KIND,
  decisionJudgeKey,
  orderQueue,
  readReviewItem,
  type DecisionSource,
  type JudgeVerdictRow,
  type ReviewItem,
} from "./queue";

export type DecisionCalibrationReport =
  components["schemas"]["DecisionCalibrationReport"];
export type GroupCalibration = components["schemas"]["GroupCalibration"];

/** One saved label, as `platform.label_decision_item` returns it. */
export interface LabeledItem {
  id: string;
  question: string;
  verdict: string;
  authority_verdict: string;
  agreed: boolean;
}

/** The battle verdict column's write: what was labeled, and why each other column was not. */
export interface ConversationLabels {
  labeled: LabeledItem[];
  /** conversation id -> why nothing was labeled there */
  skipped: Record<string, string>;
}

function readLabeledItem(value: unknown): LabeledItem {
  if (
    !isJsonObject(value) ||
    typeof value.id !== "string" ||
    typeof value.question !== "string" ||
    typeof value.verdict !== "string" ||
    typeof value.authority_verdict !== "string" ||
    typeof value.agreed !== "boolean"
  ) {
    throw new Error("The label was saved, but the database answered in an unexpected shape.");
  }
  return {
    id: value.id,
    question: value.question,
    verdict: value.verdict,
    authority_verdict: value.authority_verdict,
    agreed: value.agreed,
  };
}

const ITEM_COLUMNS =
  "id, judge_key, organization_id, question, judge_version, model, verdict, confidence, authority_verdict, agreed, subject_ref_id, created_at, metadata";

/** Everything the queue can show for one agent, capped by the knob-free page size. */
export const QUEUE_PAGE_SIZE = 500;

/**
 * Which items a queue reads. One agent's answers (`/agents/<id>/answers`), or
 * every decision item in the organizations the person belongs to
 * (`/decisions/review`) — declared here, never left to RLS alone, because a
 * platform admin's RLS reads every organization's rows and this is a person's
 * page, not the admin system.
 */
export type QueueScope = { agentId: string } | { agentId: null };

export interface QueueFilters {
  status: "unlabeled" | "labeled" | "all";
  /** Combined queue only: agent / workflow step / API model. */
  source: DecisionSource | null;
  question: string | null;
  method: string | null;
  model: string | null;
  version: number | null;
}

export const DEFAULT_FILTERS: QueueFilters = {
  status: "unlabeled",
  source: null,
  question: null,
  method: null,
  model: null,
  version: null,
};

/** The organization ids the combined queue reads — the person's own memberships. */
async function myOrganizationIds(): Promise<string[]> {
  const organizations = await getUserOrganizations();
  return organizations.map((organization) => organization.id);
}

export async function loadQueue(
  scope: QueueScope,
  filters: QueueFilters,
): Promise<ReviewItem[]> {
  const organizationIds = scope.agentId ? null : await myOrganizationIds();
  const base = createClient()
    .schema("platform")
    .from("judge_verdict")
    .select(ITEM_COLUMNS)
    .eq("subject_kind", DECISION_SUBJECT_KIND)
    .is("deleted_at", null);
  let query = scope.agentId
    ? base.eq("judge_key", decisionJudgeKey(scope.agentId))
    : base.in("organization_id", organizationIds ?? []);
  if (filters.source === "model") query = query.like("judge_key", "model:%");
  if (filters.source === "workflow") {
    query = query.or("judge_key.like.workflow_node:*,metadata->>workflow_run_id.not.is.null");
  }
  if (filters.source === "agent") {
    query = query.like("judge_key", "agent:%").is("metadata->>workflow_run_id", null);
  }
  if (filters.status === "unlabeled") query = query.is("authority_verdict", null);
  if (filters.status === "labeled") query = query.not("authority_verdict", "is", null);
  if (filters.question) query = query.eq("question", filters.question);
  if (filters.model) query = query.eq("model", filters.model);
  if (filters.version != null) query = query.eq("judge_version", filters.version);
  if (filters.method) query = query.eq("metadata->>method", filters.method);
  const { data, error } = await query
    .order("confidence", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(QUEUE_PAGE_SIZE);
  if (error) throw error;
  return orderQueue(((data ?? []) as JudgeVerdictRow[]).map(readReviewItem));
}

export interface QueueFacets {
  questions: string[];
  models: string[];
  methods: string[];
  versions: number[];
  total: number;
  labeled: number;
}

/** Every value each filter can take, and the labeled/total counts. */
export async function loadFacets(scope: QueueScope): Promise<QueueFacets> {
  const client = createClient();
  const organizationIds = scope.agentId ? null : await myOrganizationIds();
  const rows = await readAllRows(
    ({ from, to }) => {
      const base = client
        .schema("platform")
        .from("judge_verdict")
        .select("id, question, model, judge_version, authority_verdict, metadata", {
          count: "exact",
        });
      const scoped = scope.agentId
        ? base.eq("judge_key", decisionJudgeKey(scope.agentId))
        : base.in("organization_id", organizationIds ?? []);
      return scoped
        .eq("subject_kind", DECISION_SUBJECT_KIND)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to);
    },
    { label: "platform.judge_verdict (decision answers)" },
  );
  const questions = new Set<string>();
  const models = new Set<string>();
  const methods = new Set<string>();
  const versions = new Set<number>();
  let labeled = 0;
  for (const row of rows) {
    questions.add(row.question);
    if (row.model) models.add(row.model);
    const method = isJsonObject(row.metadata) ? row.metadata.method : null;
    if (typeof method === "string") methods.add(method);
    versions.add(row.judge_version);
    if (row.authority_verdict) labeled += 1;
  }
  return {
    questions: [...questions].sort(),
    models: [...models].sort(),
    methods: [...methods].sort(),
    versions: [...versions].sort((a, b) => b - a),
    total: rows.length,
    labeled,
  };
}

export interface JudgedState {
  /** The text the model judged, part by part. */
  parts: string[];
  /** False when the conversation is not readable by this viewer. */
  visible: boolean;
}

const TRANSLATOR_PREAMBLE = "You are answering a fixed set of decision questions";

/**
 * The state the model judged: the text parts of the user turn that asked the
 * questions. The verbalized route persists its own instruction block beside
 * the state; that block is the translator's wording, not the state, so it is
 * left out.
 */
export async function loadJudgedState(item: ReviewItem): Promise<JudgedState> {
  if (!item.messageId || !item.conversationId) return { parts: [], visible: false };
  const client = createClient().schema("chat");
  const { data: answer, error: answerError } = await client
    .from("message")
    .select("position")
    .eq("id", item.messageId)
    .maybeSingle();
  if (answerError) throw answerError;
  if (!answer) return { parts: [], visible: false };
  const { data: turn, error } = await client
    .from("message")
    .select("content")
    .eq("conversation_id", item.conversationId)
    .eq("role", "user")
    .lt("position", answer.position)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!turn) return { parts: [], visible: true };
  const content = Array.isArray(turn.content) ? turn.content : [];
  const parts = content.flatMap((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return [];
    const text = (part as Record<string, unknown>).text;
    if (typeof text !== "string" || !text.trim()) return [];
    if (text.trimStart().startsWith(TRANSLATOR_PREAMBLE)) return [];
    return [text];
  });
  return { parts, visible: true };
}

/** Record the person's true answer on one item, as them (RLS + the RPC's org-member gate). */
export async function labelItem(
  item: Pick<ReviewItem, "id">,
  answer: string,
): Promise<LabeledItem> {
  const { data, error } = await createClient()
    .schema("platform")
    .rpc("label_decision_item", { p_item_id: item.id, p_answer: answer });
  if (error) throw new Error(error.message);
  return readLabeledItem(data);
}

/** The battle verdict column: one true answer across every column's latest answer. */
export async function labelConversations(
  conversationIds: string[],
  question: string,
  answer: string,
): Promise<ConversationLabels> {
  const { data, error } = await createClient()
    .schema("platform")
    .rpc("label_decision_conversations", {
      p_conversation_ids: conversationIds,
      p_question: question,
      p_answer: answer,
    });
  if (error) throw new Error(error.message);
  const labeled = isJsonObject(data) && Array.isArray(data.labeled) ? data.labeled : [];
  const skippedRaw = isJsonObject(data) && isJsonObject(data.skipped) ? data.skipped : {};
  const skipped: Record<string, string> = {};
  for (const [conversationId, reason] of Object.entries(skippedRaw)) {
    skipped[conversationId] = typeof reason === "string" ? reason : "not labeled";
  }
  return { labeled: labeled.map(readLabeledItem), skipped };
}

export async function loadCalibration(
  dispatch: AppDispatch,
  agentId: string,
  filters: { model?: string | null; method?: string | null },
  /** The agent's own organization — calibration is a read about this record,
   *  never about whichever organization the viewer happens to have active. */
  organizationId?: string | null,
): Promise<DecisionCalibrationReport> {
  const queryParams: Record<string, string> = {};
  if (filters.model) queryParams.model = filters.model;
  if (filters.method) queryParams.method = filters.method;
  const result = await dispatch(
    callApi({
      path: "/decision-review/agents/{agent_id}/calibration",
      method: "GET",
      pathParams: { agent_id: agentId },
      queryParams,
      ...(organizationId
        ? { scopeOverrides: { organization_id: organizationId } }
        : {}),
    }),
  );
  if (result.error) throw new Error(result.error.message);
  return result.data as DecisionCalibrationReport;
}

export function reviewAnswersHref(agentId: string): string {
  return `/agents/${agentId}/answers`;
}

/** Every decision item the person may see — agents, workflow steps and API model calls. */
export const ALL_DECISIONS_REVIEW_HREF = "/decisions/review";

export function calibrationHref(agentId: string): string {
  return `/agents/${agentId}/answers/calibration`;
}
