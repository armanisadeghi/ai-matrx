/**
 * Decision review — data access.
 *
 * Reads go straight to Supabase (RLS `std_select` on platform.judge_verdict
 * and the caller's own chat rows). Labels and calibration go to the server,
 * because a label is written through the Judge ledger's ONE agreement writer
 * (normalized into the question's vocabulary there, so the queue and the
 * battle verdict column land identically) and calibration is computed by
 * `matrx_ai.evaluators.calibration` (Cohen's kappa, reliability curve, Brier).
 * aidream `services/decision_review/FEATURE.md`.
 */

import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { callApi } from "@/lib/api/call-api";
import { isJsonObject } from "@/types/json";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";
import {
  DECISION_SUBJECT_KIND,
  decisionJudgeKey,
  orderQueue,
  readReviewItem,
  type JudgeVerdictRow,
  type ReviewItem,
} from "./queue";

export type DecisionCalibrationReport =
  components["schemas"]["DecisionCalibrationReport"];
export type GroupCalibration = components["schemas"]["GroupCalibration"];
export type LabeledItem = components["schemas"]["LabeledItem"];
export type ConversationLabels = components["schemas"]["ConversationLabels"];

const ITEM_COLUMNS =
  "id, organization_id, question, judge_version, model, verdict, confidence, authority_verdict, agreed, subject_ref_id, created_at, metadata";

/** Everything the queue can show for one agent, capped by the knob-free page size. */
export const QUEUE_PAGE_SIZE = 500;

export interface QueueFilters {
  status: "unlabeled" | "labeled" | "all";
  question: string | null;
  method: string | null;
  model: string | null;
  version: number | null;
}

export const DEFAULT_FILTERS: QueueFilters = {
  status: "unlabeled",
  question: null,
  method: null,
  model: null,
  version: null,
};

export async function loadQueue(
  agentId: string,
  filters: QueueFilters,
): Promise<ReviewItem[]> {
  let query = createClient()
    .schema("platform")
    .from("judge_verdict")
    .select(ITEM_COLUMNS)
    .eq("judge_key", decisionJudgeKey(agentId))
    .eq("subject_kind", DECISION_SUBJECT_KIND)
    .is("deleted_at", null);
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
export async function loadFacets(agentId: string): Promise<QueueFacets> {
  const client = createClient();
  const rows = await readAllRows(
    ({ from, to }) =>
      client
        .schema("platform")
        .from("judge_verdict")
        .select("id, question, model, judge_version, authority_verdict, metadata", {
          count: "exact",
        })
        .eq("judge_key", decisionJudgeKey(agentId))
        .eq("subject_kind", DECISION_SUBJECT_KIND)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
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

export async function labelItem(
  dispatch: AppDispatch,
  item: Pick<ReviewItem, "id" | "organizationId">,
  answer: string,
): Promise<LabeledItem> {
  const result = await dispatch(
    callApi({
      path: "/decision-review/items/{item_id}/label",
      method: "POST",
      pathParams: { item_id: item.id },
      body: { answer },
      // The label is a write on this record, which carries its own
      // organization — never the viewer's active-org choice.
      ...(item.organizationId ? { scopeOverrides: { organization_id: item.organizationId } } : {}),
    }),
  );
  if (result.error) throw new Error(result.error.message);
  return result.data as LabeledItem;
}

/** The battle verdict column: one true answer across every column's latest answer. */
export async function labelConversations(
  dispatch: AppDispatch,
  conversationIds: string[],
  question: string,
  answer: string,
): Promise<ConversationLabels> {
  const result = await dispatch(
    callApi({
      path: "/decision-review/conversations/label",
      method: "POST",
      body: { conversation_ids: conversationIds, question, answer },
    }),
  );
  if (result.error) throw new Error(result.error.message);
  return result.data as ConversationLabels;
}

export async function loadCalibration(
  dispatch: AppDispatch,
  agentId: string,
  filters: { model?: string | null; method?: string | null },
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
    }),
  );
  if (result.error) throw new Error(result.error.message);
  return result.data as DecisionCalibrationReport;
}

export function reviewAnswersHref(agentId: string): string {
  return `/agents/${agentId}/answers`;
}

export function calibrationHref(agentId: string): string {
  return `/agents/${agentId}/answers/calibration`;
}
