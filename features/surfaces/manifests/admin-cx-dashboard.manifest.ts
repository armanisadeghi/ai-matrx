/**
 * Surface manifest — CX Dashboard (`matrx-admin/cx-dashboard`).
 *
 * ADMIN SURFACE. Drives the whole `/administration/chat/cx-dashboard/**`
 * subtree: a read-only super-admin console over the `cx_*` chat tables
 * (conversations, user requests, API iterations, tool calls, errors, usage).
 * One surface covers the whole subtree — the five tabs (Overview,
 * Conversations, Requests, Usage & Cost, Errors) plus the conversation and
 * request detail pages are all views over the same underlying dataset, not
 * separately-bound-agent destinations.
 *
 * Every page here is server-rendered (`fetch*` in
 * `features/cx-dashboard/service.ts`) and hands its result down as props to
 * a "*-content.tsx" client component — nothing is mutable. What an agent
 * bound here may safely do: read the KPIs/rows/detail it is shown and
 * summarize, explain, or diagnose (e.g. "why did this request hit
 * max_tokens", "summarize this conversation's cost"). Nothing on this
 * surface is a write path.
 *
 * Emitters (real, wired):
 *   - Section (which tab)        → `CxDashboardLayoutClient.tsx` (base provider, all tabs)
 *   - Overview KPIs              → `overview-content.tsx` (nested provider, overview tab only)
 *
 * Deliberately declared-but-unemitted (no provider wired yet — see
 * `readinessNote`): conversations/requests list + detail, usage, and errors.
 * Declaring them is still correct per THE COMPLETENESS LAW (they ARE data
 * the page loads) — an author can already see and bind them; the runtime
 * value simply won't be populated until an emitter is added to each
 * "*-content.tsx" component (same nested-provider pattern as overview).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_CX_DASHBOARD_SURFACE_NAME = "matrx-admin/cx-dashboard";

const groups: SurfaceValueGroup[] = [
  {
    key: "dashboard_nav",
    label: "Dashboard navigation",
    sortOrder: 100,
    description: "Which tab of the CX dashboard the admin is currently on.",
  },
  {
    key: "overview",
    label: "Overview KPIs",
    sortOrder: 200,
    description:
      "Aggregate metrics shown on the Overview tab: totals, costs, tokens, error rates, per-model and per-tool breakdowns, daily trend.",
  },
  {
    key: "conversations",
    label: "Conversations",
    sortOrder: 300,
    description:
      "The Conversations list (with its filters) and, on a detail page, the active conversation's messages, sub-agent children, and user requests.",
  },
  {
    key: "requests",
    label: "User requests",
    sortOrder: 400,
    description:
      "The Requests list (with its filters) and, on a detail page, the active user request's API iterations, tool calls, and cost verification.",
  },
  {
    key: "usage",
    label: "Usage & cost",
    sortOrder: 500,
    description: "Usage/cost analytics broken out by day, provider, and model.",
  },
  {
    key: "errors",
    label: "Errors & issues",
    sortOrder: 600,
    description:
      "Pending (stuck) requests, max-tokens hits, and tool-call errors surfaced on the Errors tab.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Navigation ───────────────────────────────────────────────────────
  {
    name: "dashboard_section",
    label: "Dashboard section",
    description:
      'Which tab of the CX dashboard is active: "overview", "conversations", "conversation_detail", "requests", "request_detail", "usage", or "errors". Always present — derived from the route.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 18,
    sortOrder: 100,
    group: "dashboard_nav",
  },

  // ── Overview ─────────────────────────────────────────────────────────
  {
    name: "overview_kpis",
    label: "Overview KPIs",
    description:
      "The full Overview-tab payload: totals (conversations, requests, messages, tool calls), cost/token aggregates, error/pending/max-tokens counts, and the models_used / tool_usage / daily_stats breakdown arrays. Present only on the Overview tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 200,
    group: "overview",
  },
  {
    name: "overview_total_conversations",
    label: "Total conversations",
    description:
      "Overview-tab total conversation count for the current timeframe filter. Present only on the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 210,
    group: "overview",
  },
  {
    name: "overview_total_cost",
    label: "Total cost",
    description:
      "Overview-tab total cost (USD) for the current timeframe filter. Present only on the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 220,
    group: "overview",
  },
  {
    name: "overview_error_count",
    label: "Error count",
    description:
      "Overview-tab count of requests that errored, plus overview_error_rate for the ratio. Present only on the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 230,
    group: "overview",
  },
  {
    name: "overview_error_rate",
    label: "Error rate",
    description:
      "Overview-tab error rate as a 0-1 fraction of total requests. Present only on the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 235,
    group: "overview",
  },

  // ── Conversations ────────────────────────────────────────────────────
  {
    name: "conversation_list_results",
    label: "Conversation list",
    description:
      "The current page of the Conversations table: one entry per conversation with id, title, status, message_count, model_name, provider, parent_conversation_id, and created_at. Present only on the Conversations list tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 300,
    group: "conversations",
  },
  {
    name: "conversation_list_total",
    label: "Conversation list total",
    description:
      "Total conversation count matching the current filters (across all pages), shown next to the list heading. Present only on the Conversations list tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 310,
    group: "conversations",
  },
  {
    name: "current_conversation_id",
    label: "Active conversation ID",
    description:
      "UUID of the conversation shown on the conversation detail page. Absent on the list tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "conversations",
  },
  {
    name: "current_conversation",
    label: "Active conversation",
    description:
      "Summary of the conversation on the detail page: { id, title, status, model_name, provider, message_count, parent_conversation_id, config, variables, overrides, metadata, created_at, updated_at }. Absent on the list tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 325,
    group: "conversations",
  },
  {
    name: "current_conversation_messages",
    label: "Active conversation messages",
    description:
      "Every message in the conversation shown on the detail page, in order, with role, content blocks, and timestamps. Bindable rather than auto-context — can be large. Absent on the list tab; empty array if the conversation has no messages.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 330,
    group: "conversations",
  },
  {
    name: "current_conversation_user_requests",
    label: "Active conversation's requests",
    description:
      "User requests belonging to the conversation shown on the detail page, with { id, status, iterations, total_tool_calls, total_cost, total_tokens }. Absent on the list tab; empty array if none exist yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 335,
    group: "conversations",
  },
  {
    name: "current_conversation_children",
    label: "Active conversation's sub-agent children",
    description:
      "Child conversations forked from the one shown on the detail page (sub-agent runs), with { id, title, model_name, message_count }. Absent on the list tab; empty array if none exist.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 340,
    group: "conversations",
  },

  // ── Requests ─────────────────────────────────────────────────────────
  {
    name: "request_list_results",
    label: "Request list",
    description:
      "The current page of the Requests table: one entry per user request with id, conversation_id, conversation_title, status, finish_reason, iterations, total_tool_calls, total_tokens, total_cost, model_name, created_at. Present only on the Requests list tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3500,
    autoContext: false,
    sortOrder: 400,
    group: "requests",
  },
  {
    name: "request_list_total",
    label: "Request list total",
    description:
      "Total user-request count matching the current filters (across all pages). Present only on the Requests list tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 410,
    group: "requests",
  },
  {
    name: "current_request_id",
    label: "Active request ID",
    description:
      "UUID of the user request shown on the request detail page. Absent on the list tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 420,
    group: "requests",
  },
  {
    name: "current_user_request",
    label: "Active user request",
    description:
      "Summary of the user request on the detail page: { id, conversation_id, conversation_title, status, finish_reason, iterations, total_tool_calls, total_input_tokens, total_output_tokens, total_cached_tokens, total_tokens, total_cost, total_duration_ms, api_duration_ms, error, model_name, provider, created_at, completed_at }. Absent on the list tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 425,
    group: "requests",
  },
  {
    name: "current_request_api_iterations",
    label: "Active request's API iterations",
    description:
      "The individual model-call iterations (`cx_request` rows) that make up the user request on the detail page, each with { iteration, model_name, input_tokens, output_tokens, cached_tokens, cost, api_duration_ms, finish_reason }. Bindable rather than auto-context. Absent on the list tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 430,
    group: "requests",
  },
  {
    name: "current_request_tool_calls",
    label: "Active request's tool calls",
    description:
      "Tool calls made during the user request on the detail page, each with { tool_name, tool_type, status, is_error, error_type, error_message, arguments, output, cost_usd, duration_ms }. The single most useful value for a debugging agent on this page. Absent on the list tab; empty array if no tools were called.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 435,
    group: "requests",
  },
  {
    name: "current_request_cost_verification",
    label: "Active request's cost verification",
    description:
      "Server-computed cost cross-check for the user request on the detail page: whether the stored total_cost matches a recomputation from token counts, and the discrepancy if not (`has_discrepancy`). Absent on the list tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 440,
    group: "requests",
  },

  // ── Usage & cost ─────────────────────────────────────────────────────
  {
    name: "usage_analytics",
    label: "Usage analytics",
    description:
      "The Usage & Cost tab's full payload: total_requests plus by_day / by_provider / by_model cost and token breakdowns. Present only on the Usage tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 500,
    group: "usage",
  },
  {
    name: "usage_total_requests",
    label: "Usage total requests",
    description:
      "Total API request count backing the Usage tab's charts for the current filters. Present only on the Usage tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 510,
    group: "usage",
  },

  // ── Errors ───────────────────────────────────────────────────────────
  {
    name: "error_pending_count",
    label: "Pending (stuck) request count",
    description:
      'Number of user requests stuck in "pending" status (a known Python-side bug the Errors tab flags explicitly). Present only on the Errors tab.',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
    group: "errors",
  },
  {
    name: "error_max_tokens_count",
    label: "Max-tokens-hit count",
    description:
      'Number of requests whose finish_reason is "max_tokens" on the Errors tab. Present only on the Errors tab.',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 610,
    group: "errors",
  },
  {
    name: "error_request_count",
    label: "Errored request count",
    description:
      'Number of user requests with a non-null error or status "error" on the Errors tab. Present only on the Errors tab.',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 620,
    group: "errors",
  },
  {
    name: "error_pending_requests",
    label: "Pending requests",
    description:
      "The pending (stuck) user requests listed on the Errors tab, each with { id, conversation_title, total_tokens, total_cost, created_at }. Bindable rather than auto-context. Present only on the Errors tab; empty array when none are pending.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 630,
    group: "errors",
  },
  {
    name: "error_tool_calls",
    label: "Tool call errors",
    description:
      "Tool calls that errored, listed on the Errors tab, each with { tool_name, tool_type, error_type, error_message, created_at }. Bindable rather than auto-context. Present only on the Errors tab; empty array when none exist.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 635,
    group: "errors",
  },
];

export const adminCxDashboardManifest: SurfaceManifest = {
  surfaceName: ADMIN_CX_DASHBOARD_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "dashboard_section is wired everywhere via a base provider in CxDashboardLayoutClient.tsx. The Overview tab additionally emits its full overview_kpis scope via a nested provider in overview-content.tsx (deepest wins). Conversations/requests list+detail, usage, and errors values are declared (THE COMPLETENESS LAW — this IS the data those pages load) but have no emitter yet; each needs the same nested-provider treatment added to its own *-content.tsx.",
  label: "CX Dashboard",
  urlPattern: "/administration/chat/cx-dashboard",
  intro: `<surface_intro>
This is an ADMIN surface: the CX (customer experience) dashboard at /administration/chat/cx-dashboard, a read-only super-admin console over the cx_* chat tables.

It has five tabs plus two detail pages, all read via dashboard_section: "overview" (aggregate KPIs, cost/token trends, model and tool usage), "conversations" (paginated conversation list) and "conversation_detail" (one conversation's messages, sub-agent children, and requests), "requests" (paginated user-request list) and "request_detail" (one request's API iterations, tool calls, and cost verification), "usage" (cost/token analytics by day/provider/model), and "errors" (pending/stuck requests, max-tokens hits, tool-call errors).

Only the values matching the current dashboard_section are populated — everything else is absent, not stale. Treat every row and field here as live production data: summarize, diagnose, and explain it, but never republish it verbatim at scale. You never execute anything on this surface — it has no write path.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/** One entry in `conversation_list_results`. */
export interface CxDashboardConversationListEntry {
  id: string;
  title: string | null;
  status: string;
  message_count: number;
  model_name?: string | null;
  provider?: string | null;
  parent_conversation_id: string | null;
  created_at: string;
}

/** One entry in `request_list_results`. */
export interface CxDashboardRequestListEntry {
  id: string;
  conversation_id: string | null;
  conversation_title?: string | null;
  status: string;
  finish_reason: string | null;
  iterations: number;
  total_tool_calls: number;
  total_tokens: number;
  total_cost: number | null;
  model_name?: string | null;
  created_at: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminCxDashboardScope(values: {
  // alwaysAvailable: true → required
  dashboard_section:
    | "overview"
    | "conversations"
    | "conversation_detail"
    | "requests"
    | "request_detail"
    | "usage"
    | "errors";
  // alwaysAvailable: false → optional
  context?: Record<string, unknown>;
  overview_kpis?: Record<string, unknown>;
  overview_total_conversations?: number;
  overview_total_cost?: number;
  overview_error_count?: number;
  overview_error_rate?: number;
  conversation_list_results?: CxDashboardConversationListEntry[];
  conversation_list_total?: number;
  current_conversation_id?: string;
  current_conversation?: Record<string, unknown>;
  current_conversation_messages?: unknown[];
  current_conversation_user_requests?: unknown[];
  current_conversation_children?: unknown[];
  request_list_results?: CxDashboardRequestListEntry[];
  request_list_total?: number;
  current_request_id?: string;
  current_user_request?: Record<string, unknown>;
  current_request_api_iterations?: unknown[];
  current_request_tool_calls?: unknown[];
  current_request_cost_verification?: Record<string, unknown>;
  usage_analytics?: Record<string, unknown>;
  usage_total_requests?: number;
  error_pending_count?: number;
  error_max_tokens_count?: number;
  error_request_count?: number;
  error_pending_requests?: unknown[];
  error_tool_calls?: unknown[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
