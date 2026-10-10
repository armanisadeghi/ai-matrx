import { buildMatrxRequestUrl, sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { resolveServiceBaseUrl } from "@/lib/api/resolve-service-url";
import { createClient } from "@/utils/supabase/client";

export interface PinterestData {
  resource_id: string;
  connected: boolean;
  last_sync_at: string | null;
  start_date?: string;
  end_date?: string;
  boards?: {id: string; name?: string; privacy?: string; pin_count?: number}[];
  pins?: {id: string; title?: string; description?: string; board_id?: string}[];
  pin_analytics?: Record<string, {observed_at: string; metrics: Record<string, {summary_metrics?: Record<string, number>}>}>;
  analytics: {date: string; engagements: number | null; impressions: number | null; saves: number | null; outbound_clicks: number | null; pin_clicks: number | null}[];
}

export async function pinterestRequest(operation: "attach" | "data" | "sync", organizationId: string, body: Record<string, string>): Promise<PinterestData> {
  const client = createClient();
  const {data: {session}} = await client.auth.getSession();
  if (!session) throw new Error("Sign in to manage Pinterest.");
  const response = await sendMatrxRequest(buildMatrxRequestUrl(resolveServiceBaseUrl("aidream"), `/api/pinterest-integrations/${operation}`), {
    method: "POST", headers: applyOrganizationContextHeader({Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json"}, organizationId),
    body: JSON.stringify(body), signal: AbortSignal.timeout(120_000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value?.detail === "string" ? value.detail : value?.detail?.message || "Pinterest data could not be loaded.");
  if (!value || typeof value.resource_id !== "string" || !Array.isArray(value.analytics)) throw new Error("Pinterest returned invalid saved data.");
  return value;
}

export async function loadPinterestData(organizationId: string, connectionId: string): Promise<PinterestData | null> {
  const client = createClient();
  const {data, error} = await client.schema("users").from("integration_connection_resources").select("id,metadata")
    .eq("connection_id", connectionId).eq("resource_type", "pinterest_account");
  if (error) throw error;
  const resource = data?.find((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    const attachments = metadata?.pinterest_social_attachments as Record<string, unknown> | undefined;
    return !!attachments?.[organizationId];
  });
  return resource ? pinterestRequest("data", organizationId, {resource_id: resource.id}) : null;
}
