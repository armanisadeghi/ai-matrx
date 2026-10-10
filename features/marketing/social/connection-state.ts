/**
 * Where a network stands for the signed-in person, judged ONE way for the Accounts tab and the KPI
 * "Own channel" table. The facts come from the connect hub (`features/social-connections`): the
 * person's connections (`users.integration_connections`) and each provider's configuration
 * (`loadSocialConfigs`: available / unavailable, approved or tester-only). Nothing here connects
 * anything; the hub does. This only decides what a row says and which action it offers.
 */

import { createClient } from "@/utils/supabase/client";
import { getClientClaimsUserCached } from "@/utils/supabase/clientClaimsCache";
import { getXConfig } from "@/features/social-connections/service";
import {
  CUSTOMER_SOCIAL_PROVIDERS,
  loadSocialConfigs,
  type CustomerSocialProvider,
  type SocialProviderConfig,
} from "@/features/social-connections/customer-service";

export type ConnectionState =
  | "connected"
  | "reconnect"
  | "testers_only"
  | "not_offered"
  | "not_connected";

export const CONNECTION_STATE_LABELS: Record<ConnectionState, string> = {
  connected: "Connected",
  reconnect: "Needs reconnect",
  testers_only: "Testers only",
  not_offered: "Not offered yet",
  not_connected: "Not connected",
};

export const CONNECTION_STATE_TONES: Record<ConnectionState, "success" | "warning" | "neutral"> = {
  connected: "success",
  reconnect: "warning",
  testers_only: "neutral",
  not_offered: "neutral",
  not_connected: "neutral",
};

export interface ConnectionFact {
  id: string;
  provider: string;
  status: string;
  /** Resource types attached to the connection (YouTube is a Google connection with a channel). */
  resourceTypes: string[];
}

export interface PlatformConnection {
  platform: string;
  state: ConnectionState;
  /** The connection to reconnect, when one exists. */
  connectionId: string | null;
  /** Connect / Reconnect is possible from here. False for not_offered. */
  canConnect: boolean;
  /** The hub provider id when this network goes through the shared OAuth start (`socialAuthorizeUrl`). */
  hubProvider: CustomerSocialProvider | null;
}

const HUB = new Set<string>(CUSTOMER_SOCIAL_PROVIDERS);

/** The connection provider(s) a network's facts live under. */
function providerOf(platform: string): string {
  return platform === "youtube" ? "google" : platform;
}

/** Pure. */
export function judgeConnection(
  platform: string,
  connections: readonly ConnectionFact[],
  configs: readonly SocialProviderConfig[],
  /** Whether the X app is set up for this organization; null = not asked. */
  xAvailable: boolean | null = null,
): PlatformConnection {
  const provider = providerOf(platform);
  const mine = connections.filter(
    (c) => c.provider === provider && (platform !== "youtube" || c.resourceTypes.includes("youtube_channel")),
  );
  const hubProvider = HUB.has(platform) ? (platform as CustomerSocialProvider) : null;
  const live = mine.find((c) => c.status === "connected");
  if (live) return { platform, state: "connected", connectionId: live.id, canConnect: true, hubProvider };
  const stale = mine[0];
  if (stale) return { platform, state: "reconnect", connectionId: stale.id, canConnect: true, hubProvider };
  if (platform === "x" && xAvailable === false)
    return { platform, state: "not_offered", connectionId: null, canConnect: false, hubProvider };
  if (hubProvider) {
    const config = configs.find((c) => c.provider === hubProvider);
    if (!config || config.status === "unavailable" || config.accessMode === "unavailable")
      return { platform, state: "not_offered", connectionId: null, canConnect: false, hubProvider };
    if (config.accessMode === "internal_test")
      return { platform, state: "testers_only", connectionId: null, canConnect: true, hubProvider };
  }
  return { platform, state: "not_connected", connectionId: null, canConnect: true, hubProvider };
}

export interface ConnectionSnapshot {
  connections: ConnectionFact[];
  configs: SocialProviderConfig[];
  xAvailable: boolean | null;
}

/** The hub providers that are social networks the module reads (one config read each; no chat or voice providers). */
const SOCIAL_PLATFORM_PROVIDERS: CustomerSocialProvider[] = ["pinterest", "instagram", "facebook", "threads", "linkedin", "snapchat", "reddit"];

const PROVIDERS = [...new Set([...CUSTOMER_SOCIAL_PROVIDERS, "x", "tiktok", "google"])];

/** The person's own connections (personal grants span organizations) + the hub's provider configs. */
export async function loadConnectionSnapshot(organizationId: string): Promise<ConnectionSnapshot> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await getClientClaimsUserCached();
  if (userError) throw userError;
  if (!user) return { connections: [], configs: [], xAvailable: null };
  const [rows, configs, xAvailable] = await Promise.all([
    supabase
      .schema("users")
      .from("integration_connections")
      .select("id,provider,status,integration_connection_resources(resource_type,deleted_at)")
      .eq("owner_type", "user")
      .eq("owner_user_id", user.id)
      .in("provider", PROVIDERS)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    loadSocialConfigs(organizationId, SOCIAL_PLATFORM_PROVIDERS),
    getXConfig(organizationId).then(
      (config) => config?.status === "available",
      () => null,
    ),
  ]);
  if (rows.error) throw rows.error;
  return {
    configs,
    xAvailable,
    connections: (rows.data ?? []).map((r) => ({
      id: r.id,
      provider: r.provider,
      status: r.status,
      resourceTypes: (r.integration_connection_resources ?? [])
        .filter((x: { deleted_at: string | null }) => x.deleted_at === null)
        .map((x: { resource_type: string }) => x.resource_type),
    })),
  };
}

/** What a network's row in the Connect menu says, in plain words. */
export const CONNECT_MENU_STATUS: Record<ConnectionState, string> = {
  connected: "Connected",
  reconnect: "Reconnect",
  testers_only: "Approved testers",
  not_offered: "Coming soon",
  not_connected: "Connect",
};
