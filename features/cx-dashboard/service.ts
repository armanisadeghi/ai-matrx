// CX Dashboard Server-Side Data Service
// All functions use the server-side Supabase client
import { createClient } from "@/utils/supabase/server";
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
} from "./types/cxDashboardTypes";
import { getTimeframeRange } from "./utils/filters";

function buildTimeframeCondition(filters: CxFilters, col: string): string {
  if (filters.timeframe === "all") return "";
  if (filters.timeframe === "custom" && filters.start_date && filters.end_date) {
    return `AND ${col} >= '${filters.start_date}' AND ${col} <= '${filters.end_date}'`;
  }
  const range = getTimeframeRange(filters.timeframe as any);
  if (!range) return "";
  return `AND ${col} >= '${range.start}' AND ${col} <= '${range.end}'`;
}

// ─── Overview KPIs ───────────────────────────────────────────────────────────

export async function fetchOverviewKpis(filters: CxFilters): Promise<CxOverviewKpis> {
  const supabase = await createClient();
  const timeWhere = buildTimeframeCondition(filters, "ur.created_at");
  const userWhere = filters.user_id ? `AND ur.user_id = '${filters.user_id}'` : "";

  // KPIs are aggregated from direct queries below — the prior
  // `cx_dashboard_kpis` RPC was removed in the post-0023 schema and its
  // result was never consumed by the rest of this function.
  const { data: urStats } = await supabase
    .from("cx_user_request")
    .select("id, total_input_tokens, total_output_tokens, total_cached_tokens, total_tokens, total_cost, total_duration_ms, status, finish_reason, error, created_at, completed_at, iterations, total_tool_calls")
    .is("deleted_at", null);

  const { data: convStats } = await supabase
    .from("cx_conversation")
    .select("id")
    .is("deleted_at", null);

  const { data: msgStats } = await supabase
    .from("cx_message")
    .select("id")
    .is("deleted_at", null);

  const { data: toolStats } = await supabase
    .from("cx_tool_call")
    .select("id, is_error")
    .is("deleted_at", null);

  const { data: reqStats } = await supabase
    .from("cx_request")
    .select("id")
    .is("deleted_at", null);

  // Model usage
  const { data: modelUsage } = await supabase
    .from("cx_request")
    .select("ai_model_id, cost, ai_model(common_name, provider)")
    .is("deleted_at", null) as any;

  // Tool usage
  const { data: toolUsage } = await supabase
    .from("cx_tool_call")
    .select("tool_name, duration_ms, is_error, cost_usd")
    .is("deleted_at", null);

  const requests = urStats || [];
  const totalCost = requests.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);
  const totalInputTokens = requests.reduce((sum, r) => sum + (r.total_input_tokens || 0), 0);
  const totalOutputTokens = requests.reduce((sum, r) => sum + (r.total_output_tokens || 0), 0);
  const totalCachedTokens = requests.reduce((sum, r) => sum + (r.total_cached_tokens || 0), 0);
  const totalTokens = requests.reduce((sum, r) => sum + (r.total_tokens || 0), 0);
  const errorCount = requests.filter((r) => r.error || r.status === "error").length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const maxTokensCount = requests.filter((r) => r.finish_reason === "max_tokens").length;

  const completedRequests = requests.filter((r) => r.status === "completed");
  const avgDuration =
    completedRequests.length > 0
      ? completedRequests.reduce((sum, r) => {
          const dur = r.total_duration_ms && r.total_duration_ms > 0
            ? r.total_duration_ms
            : r.completed_at && r.created_at
            ? new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()
            : 0;
          return sum + dur;
        }, 0) / completedRequests.length
      : 0;

  // Aggregate model usage
  const modelMap = new Map<string, { model_name: string; provider: string; count: number; total_cost: number }>();
  (modelUsage || []).forEach((r: any) => {
    const name = r.ai_model?.common_name || "Unknown";
    const provider = r.ai_model?.provider || "Unknown";
    const key = `${name}|${provider}`;
    const existing = modelMap.get(key) || { model_name: name, provider, count: 0, total_cost: 0 };
    existing.count++;
    existing.total_cost += Number(r.cost) || 0;
    modelMap.set(key, existing);
  });

  // Aggregate tool usage
  const toolMap = new Map<string, { tool_name: string; count: number; error_count: number; avg_duration_ms: number; total_cost: number; total_dur: number }>();
  (toolUsage || []).forEach((t: any) => {
    const key = t.tool_name;
    const existing = toolMap.get(key) || { tool_name: key, count: 0, error_count: 0, avg_duration_ms: 0, total_cost: 0, total_dur: 0 };
    existing.count++;
    if (t.is_error) existing.error_count++;
    existing.total_dur += t.duration_ms || 0;
    existing.total_cost += Number(t.cost_usd) || 0;
    toolMap.set(key, existing);
  });

  // Daily stats
  const dailyMap = new Map<string, { date: string; requests: number; cost: number; tokens: number; errors: number }>();
  requests.forEach((r) => {
    const date = r.created_at.slice(0, 10);
    const existing = dailyMap.get(date) || { date, requests: 0, cost: 0, tokens: 0, errors: 0 };
    existing.requests++;
    existing.cost += Number(r.total_cost) || 0;
    existing.tokens += r.total_tokens || 0;
    if (r.error || r.status === "error") existing.errors++;
    dailyMap.set(date, existing);
  });

  return {
    total_conversations: convStats?.length || 0,
    total_user_requests: requests.length,
    total_api_requests: reqStats?.length || 0,
    total_tool_calls: toolStats?.length || 0,
    total_messages: msgStats?.length || 0,
    total_cost: totalCost,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_cached_tokens: totalCachedTokens,
    total_tokens: totalTokens,
    avg_cost_per_request: requests.length > 0 ? totalCost / requests.length : 0,
    avg_tokens_per_request: requests.length > 0 ? totalTokens / requests.length : 0,
    avg_duration_ms: avgDuration,
    error_count: errorCount,
    error_rate: requests.length > 0 ? errorCount / requests.length : 0,
    pending_count: pendingCount,
    max_tokens_count: maxTokensCount,
    models_used: Array.from(modelMap.values()).sort((a, b) => b.total_cost - a.total_cost),
    tool_usage: Array.from(toolMap.values())
      .map((t) => ({ ...t, avg_duration_ms: t.count > 0 ? t.total_dur / t.count : 0 }))
      .sort((a, b) => b.count - a.count),
    daily_stats: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ─── Conversations ──────────────────────────────────────────────────────────

export async function fetchConversations(filters: CxFilters): Promise<CxPaginatedResponse<CxConversation>> {
  const supabase = await createClient();
  const page = filters.page || 1;
  const perPage = filters.per_page || 50;
  const offset = (page - 1) * perPage;

  let query = supabase
    .from("cx_conversation")
    .select("*, ai_model:last_model_id(common_name, provider)", { count: "exact" })
    .is("deleted_at", null)
    .order(filters.sort_by || "created_at", { ascending: filters.sort_dir === "asc" })
    .range(offset, offset + perPage - 1);

  if (filters.user_id) query = query.eq("user_id", filters.user_id);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) query = query.ilike("title", `%${filters.search}%`);

  if (filters.timeframe !== "all" && filters.timeframe !== "custom") {
    const range = getTimeframeRange(filters.timeframe as any);
    if (range) {
      query = query.gte("created_at", range.start).lte("created_at", range.end);
    }
  } else if (filters.timeframe === "custom" && filters.start_date && filters.end_date) {
    query = query.gte("created_at", filters.start_date).lte("created_at", filters.end_date);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const conversations = (data || []).map((c: any) => ({
    ...c,
    model_name: c.ai_model?.common_name || null,
    provider: c.ai_model?.provider || null,
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

export async function fetchConversationDetail(id: string) {
  const supabase = await createClient();

  const [convResult, messagesResult, userRequestsResult, childConvsResult] = await Promise.all([
    supabase
      .from("cx_conversation")
      .select("*, ai_model:last_model_id(common_name, provider)")
      .eq("id", id)
      .single(),
    supabase
      .from("cx_message")
      .select("*")
      .eq("conversation_id", id)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
    supabase
      .from("cx_user_request")
      .select("*")
      .eq("conversation_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("cx_conversation")
      .select("*, ai_model:last_model_id(common_name, provider)")
      .eq("parent_conversation_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const conv = convResult.data as any;
  return {
    conversation: conv
      ? { ...conv, model_name: conv.ai_model?.common_name, provider: conv.ai_model?.provider }
      : null,
    messages: (messagesResult.data || []) as CxMessage[],
    user_requests: (userRequestsResult.data || []) as CxUserRequest[],
    child_conversations: (childConvsResult.data || []).map((c: any) => ({
      ...c,
      model_name: c.ai_model?.common_name,
      provider: c.ai_model?.provider,
    })) as CxConversation[],
  };
}

// ─── User Requests ──────────────────────────────────────────────────────────

export async function fetchUserRequests(filters: CxFilters): Promise<CxPaginatedResponse<CxUserRequest>> {
  const supabase = await createClient();
  const page = filters.page || 1;
  const perPage = filters.per_page || 50;
  const offset = (page - 1) * perPage;

  let query = supabase
    .from("cx_user_request")
    .select("*, cx_conversation:conversation_id(title, ai_model:last_model_id(common_name, provider))", { count: "exact" })
    .is("deleted_at", null)
    .order(filters.sort_by || "created_at", { ascending: filters.sort_dir === "asc" })
    .range(offset, offset + perPage - 1);

  if (filters.user_id) query = query.eq("user_id", filters.user_id);
  if (filters.status) query = query.eq("status", filters.status);

  if (filters.timeframe !== "all" && filters.timeframe !== "custom") {
    const range = getTimeframeRange(filters.timeframe as any);
    if (range) {
      query = query.gte("created_at", range.start).lte("created_at", range.end);
    }
  } else if (filters.timeframe === "custom" && filters.start_date && filters.end_date) {
    query = query.gte("created_at", filters.start_date).lte("created_at", filters.end_date);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const requests = (data || []).map((r: any) => ({
    ...r,
    conversation_title: r.cx_conversation?.title || null,
    model_name: r.cx_conversation?.ai_model?.common_name || null,
    provider: r.cx_conversation?.ai_model?.provider || null,
    computed_duration_ms:
      r.total_duration_ms && r.total_duration_ms > 0
        ? r.total_duration_ms
        : r.completed_at && r.created_at
        ? new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()
        : null,
  }));

  return {
    data: requests,
    total: count || 0,
    page,
    per_page: perPage,
    total_pages: Math.ceil((count || 0) / perPage),
  };
}

// ─── Single User Request Detail ─────────────────────────────────────────────

export async function fetchUserRequestDetail(id: string) {
  const supabase = await createClient();

  const [urResult, requestsResult, toolCallsResult] = await Promise.all([
    supabase
      .from("cx_user_request")
      .select("*, cx_conversation:conversation_id(title, ai_model:last_model_id(common_name, provider))")
      .eq("id", id)
      .single(),
    supabase
      .from("cx_request")
      .select("*, ai_model:ai_model_id(common_name, provider, name)")
      .eq("user_request_id", id)
      .is("deleted_at", null)
      .order("iteration", { ascending: true }),
    supabase
      .from("cx_tool_call")
      .select("*")
      .eq("user_request_id", id)
      .is("deleted_at", null)
      .order("iteration", { ascending: true })
      .order("started_at", { ascending: true }),
  ]);

  const ur = urResult.data as any;

  // Cost verification
  const requestCosts = (requestsResult.data || []).reduce((sum: number, r: any) => sum + (Number(r.cost) || 0), 0);
  const toolCosts = (toolCallsResult.data || []).reduce((sum: number, t: any) => sum + (Number(t.cost_usd) || 0), 0);
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
          conversation_title: ur.cx_conversation?.title,
          model_name: ur.cx_conversation?.ai_model?.common_name,
          provider: ur.cx_conversation?.ai_model?.provider,
          computed_duration_ms:
            ur.total_duration_ms && ur.total_duration_ms > 0
              ? ur.total_duration_ms
              : ur.completed_at && ur.created_at
              ? new Date(ur.completed_at).getTime() - new Date(ur.created_at).getTime()
              : null,
        }
      : null,
    requests: (requestsResult.data || []).map((r: any) => ({
      ...r,
      model_name: r.ai_model?.common_name,
      provider: r.ai_model?.provider,
    })) as CxRequest[],
    tool_calls: (toolCallsResult.data || []) as CxToolCall[],
    cost_verification: costVerification,
  };
}

// ─── Messages for a conversation ────────────────────────────────────────────

export async function fetchMessages(conversationId: string): Promise<CxMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cx_message")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []) as CxMessage[];
}

// ─── Errors list ────────────────────────────────────────────────────────────

export async function fetchErrors(filters: CxFilters) {
  const supabase = await createClient();

  // User requests with errors
  const { data: errorRequests } = await supabase
    .from("cx_user_request")
    .select("*, cx_conversation:conversation_id(title)")
    .is("deleted_at", null)
    .or("error.neq.null,status.eq.error,finish_reason.eq.max_tokens")
    .order("created_at", { ascending: false })
    .limit(200);

  // Tool calls with errors
  const { data: errorToolCalls } = await supabase
    .from("cx_tool_call")
    .select("*")
    .is("deleted_at", null)
    .or("is_error.eq.true,success.eq.false")
    .order("created_at", { ascending: false })
    .limit(200);

  return {
    error_requests: (errorRequests || []).map((r: any) => ({
      ...r,
      conversation_title: r.cx_conversation?.title,
    })),
    error_tool_calls: errorToolCalls || [],
  };
}

// ─── Usage analytics ────────────────────────────────────────────────────────

export async function fetchUsageAnalytics(filters: CxFilters) {
  const supabase = await createClient();

  // All requests with model info for usage analytics
  let query = supabase
    .from("cx_request")
    .select("*, ai_model:ai_model_id(common_name, provider, name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (filters.timeframe !== "all" && filters.timeframe !== "custom") {
    const range = getTimeframeRange(filters.timeframe as any);
    if (range) {
      query = query.gte("created_at", range.start).lte("created_at", range.end);
    }
  } else if (filters.timeframe === "custom" && filters.start_date && filters.end_date) {
    query = query.gte("created_at", filters.start_date).lte("created_at", filters.end_date);
  }

  const { data: requests } = await query;

  // Aggregate by model
  const byModel = new Map<string, {
    model_name: string;
    provider: string;
    count: number;
    total_cost: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cached_tokens: number;
    total_tokens: number;
    avg_duration_ms: number;
    total_dur: number;
  }>();

  // Aggregate by day
  const byDay = new Map<string, {
    date: string;
    count: number;
    cost: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  }>();

  // Aggregate by provider
  const byProvider = new Map<string, { provider: string; count: number; total_cost: number; total_tokens: number }>();

  (requests || []).forEach((r: any) => {
    const modelName = r.ai_model?.common_name || "Unknown";
    const provider = r.ai_model?.provider || "Unknown";
    const cost = Number(r.cost) || 0;
    const inputTokens = r.input_tokens || 0;
    const outputTokens = r.output_tokens || 0;
    const cachedTokens = r.cached_tokens || 0;
    const totalTokens = r.total_tokens || 0;
    const dur = r.api_duration_ms || 0;
    const date = r.created_at.slice(0, 10);

    // By model
    const mKey = `${modelName}|${provider}`;
    const m = byModel.get(mKey) || { model_name: modelName, provider, count: 0, total_cost: 0, total_input_tokens: 0, total_output_tokens: 0, total_cached_tokens: 0, total_tokens: 0, avg_duration_ms: 0, total_dur: 0 };
    m.count++;
    m.total_cost += cost;
    m.total_input_tokens += inputTokens;
    m.total_output_tokens += outputTokens;
    m.total_cached_tokens += cachedTokens;
    m.total_tokens += totalTokens;
    m.total_dur += dur;
    byModel.set(mKey, m);

    // By day
    const d = byDay.get(date) || { date, count: 0, cost: 0, input_tokens: 0, output_tokens: 0, cached_tokens: 0 };
    d.count++;
    d.cost += cost;
    d.input_tokens += inputTokens;
    d.output_tokens += outputTokens;
    d.cached_tokens += cachedTokens;
    byDay.set(date, d);

    // By provider
    const p = byProvider.get(provider) || { provider, count: 0, total_cost: 0, total_tokens: 0 };
    p.count++;
    p.total_cost += cost;
    p.total_tokens += totalTokens;
    byProvider.set(provider, p);
  });

  return {
    by_model: Array.from(byModel.values())
      .map((m) => ({ ...m, avg_duration_ms: m.count > 0 ? m.total_dur / m.count : 0 }))
      .sort((a, b) => b.total_cost - a.total_cost),
    by_day: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    by_provider: Array.from(byProvider.values()).sort((a, b) => b.total_cost - a.total_cost),
    total_requests: requests?.length || 0,
  };
}
