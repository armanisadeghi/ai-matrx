// CX Dashboard Server-Side Data Service
// All functions use the server-side Supabase client.
//
// ERROR CONTRACT: every exported fetcher returns CxFetchResult<T> — a query
// failure is NEVER swallowed into zeros/empty arrays. The `const { data } =
// await query` pattern (error silently discarded) caused the "Usage shows $0"
// production bug: an unbounded chat.request scan hit the 8s statement timeout,
// PostgREST returned 500, and the page rendered "No usage data".
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type {
  CxConversation,
  CxUserRequest,
  CxRequest,
  CxToolCall,
  CxMessage,
  CxOverviewKpis,
  CxFilters,
  CxPaginatedResponse,
  CxCostVerification,
  CxFetchResult,
  CxUsageAnalytics,
} from "./types/cxDashboardTypes";
import { getTimeframeRange } from "./utils/filters";
import { buildSearchOr } from "@/utils/supabase-search";

function fetchError<T>(context: string, e: unknown): CxFetchResult<T> {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[cx-dashboard] ${context} failed:`, e);
  return { ok: false, error: `${context}: ${message}` };
}

/** Throw when a supabase query returned an error — never discard it. */
function must<T>(
  result: { data: T | null; error: { message: string } | null },
  label: string,
): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${label}: returned no data`);
  return result.data;
}

/** Resolve a CxFilters timeframe to an inclusive [start, end] range (nulls = all time). */
function timeframeBounds(filters: CxFilters): {
  start: string | null;
  end: string | null;
} {
  if (filters.timeframe === "custom" && filters.start_date && filters.end_date) {
    return { start: filters.start_date, end: filters.end_date };
  }
  if (filters.timeframe !== "all" && filters.timeframe !== "custom") {
    const range = getTimeframeRange(filters.timeframe);
    if (range) return { start: range.start, end: range.end };
  }
  return { start: null, end: null };
}

// ─── Conversation resolution via the cx_request m2m ──────────────────────────
// `cx_user_request` no longer carries a `conversation_id` column — a single
// user request maps to exactly one conversation but spawns many cx_request
// rows, and every one of those rows carries the same `conversation_id`, so any
// of them is an accurate reference. We resolve user_request → conversation
// (title / model / provider) through `cx_request` here.

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

interface UrConversationInfo {
  conversation_id: string | null;
  conversation_title: string | null;
  model_name: string | null;
  provider: string | null;
}

// chat.* tables have cross-schema FKs to ai.model_definition (chat→ai schema boundary).
// PostgREST cannot auto-resolve cross-schema FK embeds, so we fetch model info
// separately via `.schema("ai").from("model_definition")` and join in JS.
async function resolveAiModels(
  supabase: ServerSupabase,
  modelIds: (string | null | undefined)[],
): Promise<Map<string, { common_name: string | null; provider: string | null; name: string | null }>> {
  const ids = [...new Set(modelIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  // `provider` (free-text) was dropped from ai.model_definition — the maker is the
  // provider_id FK → ai.provider.name. Resolve it in a second query (same pattern as
  // app/api/ai-models/route.ts). Don't swallow the error.
  const { data, error } = await supabase
    .schema("ai")
    .from("model_definition")
    .select("id, common_name, name, provider_id")
    .in("id", ids);
  if (error) {
    throw new Error(`ai.model_definition: ${error.message}`);
  }
  const rows = data || [];
  const providerIds = [...new Set(rows.map((m) => m.provider_id).filter((v): v is string => !!v))];
  const providerNames = new Map<string, string | null>();
  if (providerIds.length > 0) {
    const { data: provs, error: provErr } = await supabase
      .schema("ai")
      .from("provider")
      .select("id, name")
      .in("id", providerIds);
    if (provErr) {
      throw new Error(`ai.provider: ${provErr.message}`);
    }
    for (const p of provs || []) providerNames.set(p.id, p.name ?? null);
  }
  const map = new Map<string, { common_name: string | null; provider: string | null; name: string | null }>();
  for (const m of rows) {
    map.set(m.id, {
      common_name: m.common_name ?? null,
      provider: m.provider_id ? (providerNames.get(m.provider_id) ?? null) : null,
      name: m.name ?? null,
    });
  }
  return map;
}

async function resolveUserRequestConversations(
  supabase: ServerSupabase,
  userRequestIds: string[],
): Promise<Map<string, UrConversationInfo>> {
  const result = new Map<string, UrConversationInfo>();
  if (userRequestIds.length === 0) return result;

  // user_request_id → conversation_id. Any cx_request row is an accurate ref;
  // take the first one we encounter per user_request_id.
  const links = must(
    await supabase
      .schema("chat").from("request")
      .select("user_request_id, conversation_id")
      .in("user_request_id", userRequestIds)
      .is("deleted_at", null),
    "chat.request (conversation links)",
  );

  const urToConv = new Map<string, string>();
  for (const link of (links || []) as {
    user_request_id: string;
    conversation_id: string;
  }[]) {
    if (
      link.user_request_id &&
      link.conversation_id &&
      !urToConv.has(link.user_request_id)
    ) {
      urToConv.set(link.user_request_id, link.conversation_id);
    }
  }

  const conversationIds = Array.from(new Set(urToConv.values()));
  const convMap = new Map<string, any>();
  if (conversationIds.length > 0) {
    const convs = must(
      await supabase
        .schema("chat").from("conversation")
        .select("id, title, last_model_id")
        .in("id", conversationIds),
      "chat.conversation (titles)",
    );
    const modelMap = await resolveAiModels(supabase, (convs || []).map((c: any) => c.last_model_id));
    for (const c of convs || []) {
      const m = c.last_model_id ? modelMap.get(c.last_model_id) : null;
      convMap.set(c.id, { ...c, ai_model: m ?? null });
    }
  }

  for (const urId of userRequestIds) {
    const convId = urToConv.get(urId) ?? null;
    const conv = convId ? convMap.get(convId) : null;
    result.set(urId, {
      conversation_id: convId,
      conversation_title: conv?.title ?? null,
      model_name: conv?.ai_model?.common_name ?? null,
      provider: conv?.ai_model?.provider ?? null,
    });
  }
  return result;
}

// ─── Overview KPIs ───────────────────────────────────────────────────────────

export async function fetchOverviewKpis(
  filters: CxFilters,
): Promise<CxFetchResult<CxOverviewKpis>> {
  try {
    return { ok: true, data: await fetchOverviewKpisInner(filters) };
  } catch (e) {
    return fetchError("Overview KPIs", e);
  }
}

type UrStatRow = {
  id: string;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cached_tokens: number | null;
  total_tokens: number | null;
  total_cost: number | string | null;
  total_duration_ms: number | null;
  status: string | null;
  finish_reason: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type ToolUsageRow = {
  tool_name: string;
  duration_ms: number | null;
  is_error: boolean | null;
  cost_usd: number | string | null;
};

async function fetchOverviewKpisInner(
  filters: CxFilters,
): Promise<CxOverviewKpis> {
  const supabase = await createClient();
  const { start, end } = timeframeBounds(filters);

  // Pure counts never fetch rows — head:true returns only the exact count.
  const headCount = async (
    table: "conversation" | "message" | "tool_call" | "request",
  ): Promise<number> => {
    let q = supabase
      .schema("chat")
      .from(table)
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (start && end) q = q.gte("created_at", start).lte("created_at", end);
    const { count, error } = await q;
    if (error) throw new Error(`chat.${table} count: ${error.message}`);
    return count ?? 0;
  };

  // Aggregate scans page through readAllRows: PostgREST caps every response at
  // 1000 rows, so a bare .select() silently under-reports every total here.
  const readUrStats = () =>
    readAllRows<UrStatRow>(
      ({ from, to }) => {
        let q = supabase
          .schema("chat")
          .from("user_request")
          .select(
            "id, total_input_tokens, total_output_tokens, total_cached_tokens, total_tokens, total_cost, total_duration_ms, status, finish_reason, error, created_at, completed_at",
            { count: "exact" },
          )
          .is("deleted_at", null);
        if (start && end) q = q.gte("created_at", start).lte("created_at", end);
        if (filters.user_id) q = q.eq("created_by", filters.user_id);
        return q.order("id", { ascending: true }).range(from, to);
      },
      { label: "chat.user_request (overview KPIs)" },
    );

  const readToolUsage = () =>
    readAllRows<ToolUsageRow>(
      ({ from, to }) => {
        let q = supabase
          .schema("chat")
          .from("tool_call")
          .select("id, tool_name, duration_ms, is_error, cost_usd", {
            count: "exact",
          })
          .is("deleted_at", null);
        if (start && end) q = q.gte("created_at", start).lte("created_at", end);
        return q.order("id", { ascending: true }).range(from, to);
      },
      { label: "chat.tool_call (overview KPIs)" },
    );

  const [
    requests,
    toolUsage,
    conversationCount,
    messageCount,
    toolCallCount,
    apiRequestCount,
    // Per-model request counts/costs come from the same service-role aggregate
    // the usage tab uses — never an all-time chat.request row scan.
    usageAggregate,
  ] = await Promise.all([
    readUrStats(),
    readToolUsage(),
    headCount("conversation"),
    headCount("message"),
    headCount("tool_call"),
    headCount("request"),
    fetchCxUsageAnalyticsRange(start, end),
  ]);
  const totalCost = requests.reduce(
    (sum, r) => sum + (Number(r.total_cost) || 0),
    0,
  );
  const totalInputTokens = requests.reduce(
    (sum, r) => sum + (r.total_input_tokens || 0),
    0,
  );
  const totalOutputTokens = requests.reduce(
    (sum, r) => sum + (r.total_output_tokens || 0),
    0,
  );
  const totalCachedTokens = requests.reduce(
    (sum, r) => sum + (r.total_cached_tokens || 0),
    0,
  );
  const totalTokens = requests.reduce(
    (sum, r) => sum + (r.total_tokens || 0),
    0,
  );
  const errorCount = requests.filter(
    (r) => r.error || r.status === "error",
  ).length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const maxTokensCount = requests.filter(
    (r) => r.finish_reason === "max_tokens",
  ).length;

  const completedRequests = requests.filter((r) => r.status === "completed");
  const avgDuration =
    completedRequests.length > 0
      ? completedRequests.reduce((sum, r) => {
          const dur =
            r.total_duration_ms && r.total_duration_ms > 0
              ? r.total_duration_ms
              : r.completed_at && r.created_at
                ? new Date(r.completed_at).getTime() -
                  new Date(r.created_at).getTime()
                : 0;
          return sum + dur;
        }, 0) / completedRequests.length
      : 0;

  // Model usage — straight from the Postgres aggregate (already cost-sorted).
  const modelsUsed = usageAggregate.by_model.map((m) => ({
    model_name: m.model_name,
    provider: m.provider,
    count: m.count,
    total_cost: m.total_cost,
  }));

  // Aggregate tool usage
  const toolMap = new Map<
    string,
    {
      tool_name: string;
      count: number;
      error_count: number;
      avg_duration_ms: number;
      total_cost: number;
      total_dur: number;
    }
  >();
  toolUsage.forEach((t) => {
    const key = t.tool_name;
    const existing = toolMap.get(key) || {
      tool_name: key,
      count: 0,
      error_count: 0,
      avg_duration_ms: 0,
      total_cost: 0,
      total_dur: 0,
    };
    existing.count++;
    if (t.is_error) existing.error_count++;
    existing.total_dur += t.duration_ms || 0;
    existing.total_cost += Number(t.cost_usd) || 0;
    toolMap.set(key, existing);
  });

  // Daily stats
  const dailyMap = new Map<
    string,
    {
      date: string;
      requests: number;
      cost: number;
      tokens: number;
      errors: number;
    }
  >();
  requests.forEach((r) => {
    const date = r.created_at.slice(0, 10);
    const existing = dailyMap.get(date) || {
      date,
      requests: 0,
      cost: 0,
      tokens: 0,
      errors: 0,
    };
    existing.requests++;
    existing.cost += Number(r.total_cost) || 0;
    existing.tokens += r.total_tokens || 0;
    if (r.error || r.status === "error") existing.errors++;
    dailyMap.set(date, existing);
  });

  return {
    total_conversations: conversationCount,
    total_user_requests: requests.length,
    total_api_requests: apiRequestCount,
    total_tool_calls: toolCallCount,
    total_messages: messageCount,
    total_cost: totalCost,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_cached_tokens: totalCachedTokens,
    total_tokens: totalTokens,
    avg_cost_per_request: requests.length > 0 ? totalCost / requests.length : 0,
    avg_tokens_per_request:
      requests.length > 0 ? totalTokens / requests.length : 0,
    avg_duration_ms: avgDuration,
    error_count: errorCount,
    error_rate: requests.length > 0 ? errorCount / requests.length : 0,
    pending_count: pendingCount,
    max_tokens_count: maxTokensCount,
    models_used: modelsUsed,
    tool_usage: Array.from(toolMap.values())
      .map((t) => ({
        ...t,
        avg_duration_ms: t.count > 0 ? t.total_dur / t.count : 0,
      }))
      .sort((a, b) => b.count - a.count),
    daily_stats: Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}

// ─── Conversations ──────────────────────────────────────────────────────────

export async function fetchConversations(
  filters: CxFilters,
): Promise<CxFetchResult<CxPaginatedResponse<CxConversation>>> {
  try {
    return { ok: true, data: await fetchConversationsInner(filters) };
  } catch (e) {
    return fetchError("Conversations", e);
  }
}

async function fetchConversationsInner(
  filters: CxFilters,
): Promise<CxPaginatedResponse<CxConversation>> {
  const supabase = await createClient();
  const page = filters.page || 1;
  const perPage = filters.per_page || 50;
  const offset = (page - 1) * perPage;

  // cross-schema FK (chat→ai): fetch without embed, resolve models separately.
  let query = supabase
    .schema("chat").from("conversation")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .order(filters.sort_by || "created_at", {
      ascending: filters.sort_dir === "asc",
    })
    .range(offset, offset + perPage - 1);

  // cx_conversation ownership is `created_by` (the `user_id` column was dropped).
  if (filters.user_id) query = query.eq("created_by", filters.user_id);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search)
    query = query.or(buildSearchOr(filters.search, ["title"]));

  if (filters.timeframe !== "all" && filters.timeframe !== "custom") {
    const range = getTimeframeRange(filters.timeframe as any);
    if (range) {
      query = query.gte("created_at", range.start).lte("created_at", range.end);
    }
  } else if (
    filters.timeframe === "custom" &&
    filters.start_date &&
    filters.end_date
  ) {
    query = query
      .gte("created_at", filters.start_date)
      .lte("created_at", filters.end_date);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const convModelMap = await resolveAiModels(supabase, (data || []).map((c: any) => c.last_model_id));
  const conversations = (data || []).map((c: any) => ({
    ...c,
    model_name: c.last_model_id ? (convModelMap.get(c.last_model_id)?.common_name ?? null) : null,
    provider: c.last_model_id ? (convModelMap.get(c.last_model_id)?.provider ?? null) : null,
  }));

  return {
    data: conversations,
    total: count || 0,
    page,
    per_page: perPage,
    total_pages: Math.ceil((count || 0) / perPage),
  };
}

// ─── Single Conversation Detail ─────────────────────────────────────────────

export type CxConversationDetail = {
  conversation: (CxConversation & { model_name: string | null; provider: string | null }) | null;
  messages: CxMessage[];
  user_requests: CxUserRequest[];
  child_conversations: CxConversation[];
};

export async function fetchConversationDetail(
  id: string,
): Promise<CxFetchResult<CxConversationDetail>> {
  try {
    return { ok: true, data: await fetchConversationDetailInner(id) };
  } catch (e) {
    return fetchError("Conversation detail", e);
  }
}

async function fetchConversationDetailInner(
  id: string,
): Promise<CxConversationDetail> {
  const supabase = await createClient();

  // cross-schema FK (chat→ai): fetch conversations without embed, resolve models separately.
  const [convResult, messagesResult, reqLinksResult, childConvsResult] =
    await Promise.all([
      supabase
        .schema("chat").from("conversation")
        .select("*")
        .eq("id", id)
        .single(),
      supabase
        .schema("chat").from("message")
        .select("*")
        .eq("conversation_id", id)
        .is("deleted_at", null)
        .order("position", { ascending: true }),
      // User requests for this conversation are resolved through the cx_request
      // m2m: every cx_request for this conversation_id points back at a
      // user_request_id.
      supabase
        .schema("chat").from("request")
        .select("user_request_id")
        .eq("conversation_id", id)
        .is("deleted_at", null),
      supabase
        .schema("chat").from("conversation")
        .select("*")
        .eq("parent_conversation_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);

  // .single() with no row is PGRST116 — that's "not found", not a failure.
  if (convResult.error && convResult.error.code !== "PGRST116") {
    throw new Error(`chat.conversation: ${convResult.error.message}`);
  }
  if (messagesResult.error) {
    throw new Error(`chat.message: ${messagesResult.error.message}`);
  }
  if (reqLinksResult.error) {
    throw new Error(`chat.request links: ${reqLinksResult.error.message}`);
  }
  if (childConvsResult.error) {
    throw new Error(
      `chat.conversation children: ${childConvsResult.error.message}`,
    );
  }

  const conv = convResult.data as any;
  const childConvs = childConvsResult.data || [];

  // Resolve AI model info for this conversation and children in one batch.
  const modelIdsToFetch = [conv?.last_model_id, ...childConvs.map((c: any) => c.last_model_id)];
  const detailModelMap = await resolveAiModels(supabase, modelIdsToFetch);

  const userRequestIds = Array.from(
    new Set(
      ((reqLinksResult.data || []) as { user_request_id: string | null }[])
        .map((r) => r.user_request_id)
        .filter((v): v is string => !!v),
    ),
  );

  let userRequests: CxUserRequest[] = [];
  if (userRequestIds.length > 0) {
    const urData = must(
      await supabase
        .schema("chat").from("user_request")
        .select("*")
        .in("id", userRequestIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      "chat.user_request",
    );
    userRequests = (urData ?? []).map((row) => ({
      ...row,
      conversation_id: id,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    }));
  }

  return {
    conversation: conv
      ? {
          ...conv,
          model_name: conv.last_model_id ? (detailModelMap.get(conv.last_model_id)?.common_name ?? null) : null,
          provider: conv.last_model_id ? (detailModelMap.get(conv.last_model_id)?.provider ?? null) : null,
        }
      : null,
    messages: (messagesResult.data || []) as CxMessage[],
    user_requests: userRequests,
    child_conversations: childConvs.map((c: any) => ({
      ...c,
      model_name: c.last_model_id ? (detailModelMap.get(c.last_model_id)?.common_name ?? null) : null,
      provider: c.last_model_id ? (detailModelMap.get(c.last_model_id)?.provider ?? null) : null,
    })) as CxConversation[],
  };
}

// ─── User Requests ──────────────────────────────────────────────────────────

export async function fetchUserRequests(
  filters: CxFilters,
): Promise<CxFetchResult<CxPaginatedResponse<CxUserRequest>>> {
  try {
    return { ok: true, data: await fetchUserRequestsInner(filters) };
  } catch (e) {
    return fetchError("User requests", e);
  }
}

async function fetchUserRequestsInner(
  filters: CxFilters,
): Promise<CxPaginatedResponse<CxUserRequest>> {
  const supabase = await createClient();
  const page = filters.page || 1;
  const perPage = filters.per_page || 50;
  const offset = (page - 1) * perPage;

  let query = supabase
    .schema("chat").from("user_request")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .order(filters.sort_by || "created_at", {
      ascending: filters.sort_dir === "asc",
    })
    .range(offset, offset + perPage - 1);

  if (filters.user_id) query = query.eq("created_by", filters.user_id);
  if (filters.status) query = query.eq("status", filters.status);

  if (filters.timeframe !== "all" && filters.timeframe !== "custom") {
    const range = getTimeframeRange(filters.timeframe as any);
    if (range) {
      query = query.gte("created_at", range.start).lte("created_at", range.end);
    }
  } else if (
    filters.timeframe === "custom" &&
    filters.start_date &&
    filters.end_date
  ) {
    query = query
      .gte("created_at", filters.start_date)
      .lte("created_at", filters.end_date);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = (data || []) as any[];
  const convInfo = await resolveUserRequestConversations(
    supabase,
    rows.map((r) => r.id),
  );

  const requests = rows.map((r) => {
    const info = convInfo.get(r.id);
    return {
      ...r,
      conversation_id: info?.conversation_id ?? null,
      conversation_title: info?.conversation_title ?? null,
      model_name: info?.model_name ?? null,
      provider: info?.provider ?? null,
      computed_duration_ms:
        r.total_duration_ms && r.total_duration_ms > 0
          ? r.total_duration_ms
          : r.completed_at && r.created_at
            ? new Date(r.completed_at).getTime() -
              new Date(r.created_at).getTime()
            : null,
    };
  });

  return {
    data: requests,
    total: count || 0,
    page,
    per_page: perPage,
    total_pages: Math.ceil((count || 0) / perPage),
  };
}

// ─── Single User Request Detail ─────────────────────────────────────────────

export type CxUserRequestDetail = Awaited<
  ReturnType<typeof fetchUserRequestDetailInner>
>;

export async function fetchUserRequestDetail(
  id: string,
): Promise<CxFetchResult<CxUserRequestDetail>> {
  try {
    return { ok: true, data: await fetchUserRequestDetailInner(id) };
  } catch (e) {
    return fetchError("Request detail", e);
  }
}

async function fetchUserRequestDetailInner(id: string) {
  const supabase = await createClient();

  // cross-schema FK (chat→ai): fetch request rows without embed, resolve models separately.
  const [urResult, requestsResult, toolCallsResult] = await Promise.all([
    supabase.schema("chat").from("user_request").select("*").eq("id", id).single(),
    supabase
      .schema("chat").from("request")
      .select("*")
      .eq("user_request_id", id)
      .is("deleted_at", null)
      .order("iteration", { ascending: true }),
    supabase
      .schema("chat").from("tool_call")
      .select("*")
      .eq("user_request_id", id)
      .is("deleted_at", null)
      .order("iteration", { ascending: true })
      .order("started_at", { ascending: true }),
  ]);

  // .single() with no row is PGRST116 — that's "not found", not a failure.
  if (urResult.error && urResult.error.code !== "PGRST116") {
    throw new Error(`chat.user_request: ${urResult.error.message}`);
  }
  if (requestsResult.error) {
    throw new Error(`chat.request: ${requestsResult.error.message}`);
  }
  if (toolCallsResult.error) {
    throw new Error(`chat.tool_call: ${toolCallsResult.error.message}`);
  }

  const ur = urResult.data as any;
  const [urConvInfo, requestModelMap] = await Promise.all([
    ur ? resolveUserRequestConversations(supabase, [ur.id]).then((m) => m.get(ur.id)) : Promise.resolve(undefined),
    resolveAiModels(supabase, (requestsResult.data || []).map((r: any) => r.ai_model_id)),
  ]);

  // Cost verification
  const requestCosts = (requestsResult.data || []).reduce(
    (sum: number, r: any) => sum + (Number(r.cost) || 0),
    0,
  );
  const toolCosts = (toolCallsResult.data || []).reduce(
    (sum: number, t: any) => sum + (Number(t.cost_usd) || 0),
    0,
  );
  const urTotalCost = Number(ur?.total_cost) || 0;
  const combinedTotal = requestCosts + toolCosts;

  const costVerification: CxCostVerification = {
    user_request_total_cost: urTotalCost,
    sum_of_request_costs: requestCosts,
    sum_of_tool_call_costs: toolCosts,
    combined_total: combinedTotal,
    discrepancy: Math.abs(urTotalCost - combinedTotal),
    has_discrepancy: Math.abs(urTotalCost - combinedTotal) > 0.001,
  };

  return {
    user_request: ur
      ? {
          ...ur,
          conversation_id: urConvInfo?.conversation_id ?? null,
          conversation_title: urConvInfo?.conversation_title ?? null,
          model_name: urConvInfo?.model_name ?? null,
          provider: urConvInfo?.provider ?? null,
          computed_duration_ms:
            ur.total_duration_ms && ur.total_duration_ms > 0
              ? ur.total_duration_ms
              : ur.completed_at && ur.created_at
                ? new Date(ur.completed_at).getTime() -
                  new Date(ur.created_at).getTime()
                : null,
        }
      : null,
    requests: (requestsResult.data || []).map((r: any) => {
      const m = r.ai_model_id ? requestModelMap.get(r.ai_model_id) : null;
      return { ...r, model_name: m?.common_name ?? null, provider: m?.provider ?? null };
    }) as CxRequest[],
    tool_calls: (toolCallsResult.data || []) as CxToolCall[],
    cost_verification: costVerification,
  };
}

// ─── Messages for a conversation ────────────────────────────────────────────

export async function fetchMessages(
  conversationId: string,
): Promise<CxMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat").from("message")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []) as CxMessage[];
}

// ─── Errors list ────────────────────────────────────────────────────────────

export type CxErrorsData = {
  error_requests: CxUserRequest[];
  error_tool_calls: CxToolCall[];
};

export async function fetchErrors(
  filters: CxFilters,
): Promise<CxFetchResult<CxErrorsData>> {
  try {
    return { ok: true, data: await fetchErrorsInner(filters) };
  } catch (e) {
    return fetchError("Errors", e);
  }
}

async function fetchErrorsInner(filters: CxFilters): Promise<CxErrorsData> {
  const supabase = await createClient();
  const { start, end } = timeframeBounds(filters);

  // User requests with errors (newest 200 in range)
  let urQuery = supabase
    .schema("chat").from("user_request")
    .select("*")
    .is("deleted_at", null)
    .or("error.neq.null,status.eq.error,finish_reason.eq.max_tokens")
    .order("created_at", { ascending: false })
    .limit(200);
  if (start && end) urQuery = urQuery.gte("created_at", start).lte("created_at", end);
  const errorRequests = must(await urQuery, "chat.user_request (errors)");

  // Tool calls with errors (newest 200 in range)
  let tcQuery = supabase
    .schema("chat").from("tool_call")
    .select("*")
    .is("deleted_at", null)
    .or("is_error.eq.true,success.eq.false")
    .order("created_at", { ascending: false })
    .limit(200);
  if (start && end) tcQuery = tcQuery.gte("created_at", start).lte("created_at", end);
  const errorToolCalls = must(await tcQuery, "chat.tool_call (errors)");

  const errConvInfo = await resolveUserRequestConversations(
    supabase,
    (errorRequests || []).map((r: any) => r.id),
  );

  return {
    error_requests: (errorRequests || []).map((r) => {
      const info = errConvInfo.get(r.id);
      return {
        ...r,
        conversation_id: info?.conversation_id ?? null,
        conversation_title: info?.conversation_title ?? null,
      };
    }) as CxUserRequest[],
    error_tool_calls: (errorToolCalls || []) as CxToolCall[],
  };
}

// ─── Usage analytics ────────────────────────────────────────────────────────
// The old implementation pulled EVERY chat.request row (26.8k rows / 34MB)
// through PostgREST and aggregated in JS — it exceeded the 8s statement
// timeout under RLS and the discarded error rendered as "$0 / No usage data".
// Aggregation now happens in Postgres via chat.cx_usage_analytics(p_start,
// p_end): SECURITY DEFINER, EXECUTE granted ONLY to service_role. It MUST be
// called with the admin (service-role) client — the user client is refused by
// design — so the call is gated here by requireSuperAdmin(), the same pattern
// as app/api/admin/users/usage/route.ts.

const num = (v: unknown): number => Number(v) || 0;

/**
 * Super-admin-gated aggregate over chat.request for [start, end] (nulls =
 * all time). Shared by the usage tab (server component, direct call) and the
 * GET /api/admin/chat/cx-usage route. Throws on auth failure or query error.
 */
export async function fetchCxUsageAnalyticsRange(
  start: string | null,
  end: string | null,
): Promise<CxUsageAnalytics> {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("chat")
    .rpc("cx_usage_analytics", {
      p_start: start ?? undefined,
      p_end: end ?? undefined,
    });
  if (error) throw new Error(`chat.cx_usage_analytics: ${error.message}`);

  // jsonb → typed shape. Numeric aggregates can arrive as strings — coerce.
  const raw = (data ?? {}) as {
    by_model?: Record<string, unknown>[];
    by_day?: Record<string, unknown>[];
    by_provider?: Record<string, unknown>[];
    total_requests?: unknown;
  };
  return {
    by_model: (raw.by_model ?? []).map((m) => ({
      model_name: String(m.model_name ?? "Unknown"),
      provider: String(m.provider ?? "Unknown"),
      count: num(m.count),
      total_cost: num(m.total_cost),
      total_input_tokens: num(m.total_input_tokens),
      total_output_tokens: num(m.total_output_tokens),
      total_cached_tokens: num(m.total_cached_tokens),
      total_tokens: num(m.total_tokens),
      avg_duration_ms: num(m.avg_duration_ms),
    })),
    by_day: (raw.by_day ?? []).map((d) => ({
      date: String(d.date ?? ""),
      count: num(d.count),
      cost: num(d.cost),
      input_tokens: num(d.input_tokens),
      output_tokens: num(d.output_tokens),
      cached_tokens: num(d.cached_tokens),
    })),
    by_provider: (raw.by_provider ?? []).map((p) => ({
      provider: String(p.provider ?? "Unknown"),
      count: num(p.count),
      total_cost: num(p.total_cost),
      total_tokens: num(p.total_tokens),
    })),
    total_requests: num(raw.total_requests),
  };
}

export async function fetchUsageAnalytics(
  filters: CxFilters,
): Promise<CxFetchResult<CxUsageAnalytics>> {
  try {
    const { start, end } = timeframeBounds(filters);
    return { ok: true, data: await fetchCxUsageAnalyticsRange(start, end) };
  } catch (e) {
    return fetchError("Usage analytics", e);
  }
}
