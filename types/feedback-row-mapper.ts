import type { Database, Json } from "@/types/database.types";
import type {
  AdminDecision,
  AiComplexity,
  AnnouncementType,
  FeedbackComment,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
  FeedbackUserMessage,
  SystemAnnouncement,
  TestingResult,
  UserFeedback,
} from "@/types/feedback.types";

/** Table or RPC rows that share `user_feedback` column shapes (strings from DB). */
export type UserFeedbackRowLike =
  Database["public"]["Tables"]["user_feedback"]["Row"];

export type FeedbackCommentRowLike =
  | Database["public"]["Functions"]["get_feedback_comments"]["Returns"][number]
  | Database["public"]["Functions"]["add_feedback_comment"]["Returns"];

export type SystemAnnouncementRow =
  Database["public"]["Tables"]["system_announcements"]["Row"];

export type FeedbackUserMessageRowLike =
  Database["public"]["Tables"]["feedback_user_messages"]["Row"];

function isJsonRecord(value: Json): value is Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function narrowFeedbackType(raw: string): FeedbackType {
  if (
    raw === "bug" ||
    raw === "feature" ||
    raw === "suggestion" ||
    raw === "other"
  ) {
    return raw;
  }
  throw new Error(`Invalid feedback_type: ${raw}`);
}

function narrowFeedbackStatus(raw: string): FeedbackStatus {
  switch (raw) {
    case "new":
    case "triaged":
    case "in_progress":
    case "awaiting_review":
    case "user_review":
    case "resolved":
    case "closed":
    case "wont_fix":
    case "split":
    case "deferred":
      return raw;
    default:
      throw new Error(`Invalid feedback status: ${raw}`);
  }
}

function narrowFeedbackPriority(raw: string): FeedbackPriority {
  if (
    raw === "low" ||
    raw === "medium" ||
    raw === "high" ||
    raw === "critical"
  ) {
    return raw;
  }
  throw new Error(`Invalid feedback priority: ${raw}`);
}

function narrowAdminDecision(raw: string): AdminDecision {
  if (
    raw === "pending" ||
    raw === "approved" ||
    raw === "rejected" ||
    raw === "deferred" ||
    raw === "split"
  ) {
    return raw;
  }
  throw new Error(`Invalid admin_decision: ${raw}`);
}

function narrowAiComplexity(raw: string | null): AiComplexity | null {
  if (raw === null) return null;
  if (raw === "simple" || raw === "moderate" || raw === "complex") return raw;
  throw new Error(`Invalid ai_complexity: ${raw}`);
}

function narrowTestingResult(raw: string | null): TestingResult | null {
  if (raw === null) return null;
  if (
    raw === "pending" ||
    raw === "pass" ||
    raw === "fail" ||
    raw === "partial" ||
    raw === "admin_closed"
  ) {
    return raw;
  }
  throw new Error(`Invalid testing_result: ${raw}`);
}

/** Scalar-only summary object from `get_feedback_summary` (top-level JSON object). */
export type FeedbackSummaryData = Record<
  string,
  string | number | boolean | null
>;

export function parseFeedbackSummaryPayload(
  data: Json,
): FeedbackSummaryData | null {
  if (!isJsonRecord(data)) return null;
  const out: FeedbackSummaryData = {};
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v === null) {
      out[k] = null;
    } else if (typeof v === "string") {
      out[k] = v;
    } else if (typeof v === "number") {
      out[k] = v;
    } else if (typeof v === "boolean") {
      out[k] = v;
    } else {
      return null;
    }
  }
  return out;
}

function isStringArrayOrNull(v: Json): boolean {
  if (v === null) return true;
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function isUserFeedbackRowLike(val: Json): val is UserFeedbackRowLike {
  if (!isJsonRecord(val)) return false;
  const o = val;
  const r = (k: string): boolean => typeof o[k] === "string";
  const rn = (k: string): boolean => o[k] === null || typeof o[k] === "string";
  const rnn = (k: string): boolean => o[k] === null || typeof o[k] === "number";
  const rb = (k: string): boolean => typeof o[k] === "boolean";
  return (
    r("id") &&
    r("user_id") &&
    r("feedback_type") &&
    r("route") &&
    r("description") &&
    r("status") &&
    r("priority") &&
    rb("has_open_issues") &&
    r("created_at") &&
    r("updated_at") &&
    rn("admin_direction") &&
    rn("admin_notes") &&
    rn("ai_assessment") &&
    rn("ai_complexity") &&
    rnn("autonomy_score") &&
    rn("category_id") &&
    isStringArrayOrNull(o["ai_estimated_files"]) &&
    rn("ai_solution_proposal") &&
    rn("ai_suggested_priority") &&
    rn("resolution_notes") &&
    rn("resolved_at") &&
    rn("resolved_by") &&
    rn("user_confirmed_at") &&
    rn("parent_id") &&
    rn("assigned_to") &&
    r("admin_decision") &&
    rnn("work_priority") &&
    rn("testing_instructions") &&
    rn("testing_url") &&
    rn("testing_result") &&
    rn("username") &&
    (o["image_urls"] === null || isStringArrayOrNull(o["image_urls"]))
  );
}

export type TriageOtherUntriagedItem = {
  id: string;
  feedback_type: FeedbackType;
  route: string;
  username: string | null;
  description_preview: string;
  has_images: boolean;
  has_admin_notes: boolean;
  created_at: string;
};

export type TriageBatchData = {
  batch: UserFeedback[];
  pipeline: {
    untriaged: number;
    your_decision: number;
    agent_working: number;
    test_results: number;
    done: number;
  };
  other_untriaged: TriageOtherUntriagedItem[];
};

export function parseGetTriageBatchResult(
  data: Json,
): { ok: true; value: TriageBatchData } | { ok: false; error: string } {
  if (!isJsonRecord(data)) {
    return { ok: false, error: "get_triage_batch: expected object" };
  }
  const batchRaw = data.batch;
  const pipelineRaw = data.pipeline;
  const otherRaw = data.other_untriaged;
  if (!Array.isArray(batchRaw)) {
    return { ok: false, error: "get_triage_batch: batch must be an array" };
  }
  if (!isJsonRecord(pipelineRaw)) {
    return { ok: false, error: "get_triage_batch: pipeline must be an object" };
  }
  if (!Array.isArray(otherRaw)) {
    return {
      ok: false,
      error: "get_triage_batch: other_untriaged must be an array",
    };
  }

  const pr = pipelineRaw;
  const nums = (k: string): number | null =>
    typeof pr[k] === "number" && !Number.isNaN(pr[k] as number)
      ? (pr[k] as number)
      : null;
  const untriaged = nums("untriaged");
  const your_decision = nums("your_decision");
  const agent_working = nums("agent_working");
  const test_results = nums("test_results");
  const done = nums("done");
  if (
    untriaged === null ||
    your_decision === null ||
    agent_working === null ||
    test_results === null ||
    done === null
  ) {
    return { ok: false, error: "get_triage_batch: pipeline counts invalid" };
  }

  let batch: UserFeedback[];
  try {
    batch = batchRaw.map((item, i) => {
      if (!isUserFeedbackRowLike(item)) {
        throw new Error(`batch[${i}] is not a valid user_feedback row`);
      }
      return mapUserFeedbackRow(item);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "batch parse failed";
    return { ok: false, error: msg };
  }

  let other_untriaged: TriageOtherUntriagedItem[];
  try {
    other_untriaged = otherRaw.map((item, i) => {
      if (!isJsonRecord(item)) {
        throw new Error(`other_untriaged[${i}] must be an object`);
      }
      const o = item;
      if (typeof o.id !== "string") throw new Error(`other_untriaged[${i}].id`);
      if (typeof o.feedback_type !== "string") {
        throw new Error(`other_untriaged[${i}].feedback_type`);
      }
      if (typeof o.route !== "string") {
        throw new Error(`other_untriaged[${i}].route`);
      }
      if (typeof o.description_preview !== "string") {
        throw new Error(`other_untriaged[${i}].description_preview`);
      }
      if (typeof o.has_images !== "boolean") {
        throw new Error(`other_untriaged[${i}].has_images`);
      }
      if (typeof o.has_admin_notes !== "boolean") {
        throw new Error(`other_untriaged[${i}].has_admin_notes`);
      }
      if (typeof o.created_at !== "string") {
        throw new Error(`other_untriaged[${i}].created_at`);
      }
      let username: string | null;
      if (o.username === null) {
        username = null;
      } else if (typeof o.username === "string") {
        username = o.username;
      } else {
        throw new Error(`other_untriaged[${i}].username`);
      }
      return {
        id: o.id,
        feedback_type: narrowFeedbackType(o.feedback_type),
        route: o.route,
        username,
        description_preview: o.description_preview,
        has_images: o.has_images,
        has_admin_notes: o.has_admin_notes,
        created_at: o.created_at,
      };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "other_untriaged parse failed";
    return { ok: false, error: msg };
  }

  return {
    ok: true,
    value: {
      batch,
      pipeline: {
        untriaged,
        your_decision,
        agent_working,
        test_results,
        done,
      },
      other_untriaged,
    },
  };
}

export function mapUserFeedbackRow(row: UserFeedbackRowLike): UserFeedback {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username,
    feedback_type: narrowFeedbackType(row.feedback_type),
    route: row.route,
    description: row.description,
    status: narrowFeedbackStatus(row.status),
    priority: narrowFeedbackPriority(row.priority),
    admin_notes: row.admin_notes,
    ai_assessment: row.ai_assessment,
    autonomy_score: row.autonomy_score,
    resolution_notes: row.resolution_notes,
    image_urls: row.image_urls,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    resolved_by: row.resolved_by,
    user_confirmed_at: row.user_confirmed_at,
    parent_id: row.parent_id,
    category_id: row.category_id,
    assigned_to: row.assigned_to,
    ai_solution_proposal: row.ai_solution_proposal,
    ai_suggested_priority: row.ai_suggested_priority,
    ai_complexity: narrowAiComplexity(row.ai_complexity),
    ai_estimated_files: row.ai_estimated_files,
    admin_direction: row.admin_direction,
    admin_decision: narrowAdminDecision(row.admin_decision),
    work_priority: row.work_priority,
    testing_instructions: row.testing_instructions,
    testing_url: row.testing_url,
    testing_result: narrowTestingResult(row.testing_result),
    has_open_issues: row.has_open_issues,
  };
}

export function mapUserFeedbackRows(
  rows: UserFeedbackRowLike[],
): UserFeedback[] {
  return rows.map(mapUserFeedbackRow);
}

function narrowCommentAuthorType(raw: string): FeedbackComment["author_type"] {
  if (raw === "user" || raw === "admin" || raw === "ai_agent") return raw;
  throw new Error(`Invalid feedback comment author_type: ${raw}`);
}

export function mapFeedbackCommentRow(
  row: FeedbackCommentRowLike,
): FeedbackComment {
  return {
    id: row.id,
    feedback_id: row.feedback_id,
    author_type: narrowCommentAuthorType(row.author_type),
    author_name: row.author_name,
    content: row.content,
    created_at: row.created_at,
  };
}

export function mapFeedbackCommentRows(
  rows: FeedbackCommentRowLike[],
): FeedbackComment[] {
  return rows.map(mapFeedbackCommentRow);
}

function narrowMessageSenderType(
  raw: string,
): FeedbackUserMessage["sender_type"] {
  if (raw === "user" || raw === "admin") return raw;
  throw new Error(`Invalid feedback_user_message sender_type: ${raw}`);
}

export function mapFeedbackUserMessageRow(
  row: FeedbackUserMessageRowLike,
): FeedbackUserMessage {
  return {
    id: row.id,
    feedback_id: row.feedback_id,
    sender_type: narrowMessageSenderType(row.sender_type),
    sender_name: row.sender_name,
    content: row.content,
    created_at: row.created_at,
    email_sent: row.email_sent,
    image_urls: row.image_urls,
  };
}

export function mapFeedbackUserMessageRows(
  rows: FeedbackUserMessageRowLike[],
): FeedbackUserMessage[] {
  return rows.map(mapFeedbackUserMessageRow);
}

/**
 * RPCs that return a `feedback_user_messages` row as untyped `Json`.
 */
export function parseFeedbackUserMessageJson(
  data: Json,
): FeedbackUserMessage | null {
  if (!isJsonRecord(data)) return null;
  const o = data;
  if (typeof o.id !== "string" || typeof o.feedback_id !== "string") {
    return null;
  }
  if (typeof o.content !== "string" || typeof o.created_at !== "string") {
    return null;
  }
  if (typeof o.email_sent !== "boolean") return null;
  if (!(o.sender_name === null || typeof o.sender_name === "string")) {
    return null;
  }
  if (typeof o.sender_type !== "string") return null;
  let imageUrls: string[] | null = null;
  if (o.image_urls !== null) {
    if (!Array.isArray(o.image_urls)) return null;
    const urls: string[] = [];
    for (const x of o.image_urls) {
      if (typeof x !== "string") return null;
      urls.push(x);
    }
    imageUrls = urls;
  }
  let senderName: string | null;
  if (o.sender_name === null) {
    senderName = null;
  } else if (typeof o.sender_name === "string") {
    senderName = o.sender_name;
  } else {
    return null;
  }
  try {
    return mapFeedbackUserMessageRow({
      id: o.id,
      feedback_id: o.feedback_id,
      content: o.content,
      created_at: o.created_at,
      email_sent: o.email_sent,
      sender_name: senderName,
      sender_type: o.sender_type,
      image_urls: imageUrls,
    });
  } catch {
    return null;
  }
}

function isAnnouncementType(raw: string): raw is AnnouncementType {
  return (
    raw === "info" ||
    raw === "warning" ||
    raw === "critical" ||
    raw === "update"
  );
}

export function mapSystemAnnouncementRow(
  row: SystemAnnouncementRow,
): SystemAnnouncement {
  if (!isAnnouncementType(row.announcement_type)) {
    throw new Error(`Invalid announcement_type: ${row.announcement_type}`);
  }
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    announcement_type: row.announcement_type,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    min_display_seconds: row.min_display_seconds ?? 0,
  };
}

export function mapSystemAnnouncementRows(
  rows: SystemAnnouncementRow[],
): SystemAnnouncement[] {
  return rows.map(mapSystemAnnouncementRow);
}
