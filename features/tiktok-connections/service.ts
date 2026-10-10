import { apiPost } from "@/lib/api/typed-client";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { operationFailed } from "@/utils/errors";

export async function listTikTokConnections(signal?: AbortSignal) {
  const client = createClient();
  const { data: { user }, error } = await getClaimsUser(client);
  if (error) throw operationFailed("verify your identity", error);
  if (!user) throw new Error("Sign in to load TikTok accounts.");
  const result = await client.schema("users").from("integration_connections")
    .select("id,account_name,status,scopes,last_error,last_verified_at")
    .eq("provider", "tiktok").eq("owner_type", "user").eq("owner_user_id", user.id)
    .is("deleted_at", null).order("created_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  if (result.error) throw operationFailed("load TikTok accounts", result.error);
  return result.data;
}

const PROOF_KEY = "matrx.tiktok.consent";

export async function startTikTokAuthorization(userId: string, organizationId: string) {
  const proof = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proof))), byte => byte.toString(16).padStart(2, "0")).join("");
  const { data } = await apiPost("/tiktok-integrations/authorize", { browser_proof_hash: hash });
  const state = new URL(data.authorization_url).searchParams.get("state");
  if (!state) throw new Error("TikTok authorization did not return a consent state.");
  sessionStorage.setItem(PROOF_KEY, JSON.stringify({ proof, state, userId, organizationId, expiresAt: Date.now() + 600_000 }));
  return data;
}

export async function finishTikTokAuthorization(state: string, code: string, userId: string, organizationId: string) {
  const stored = sessionStorage.getItem(PROOF_KEY);
  if (!stored) throw new Error("Return to the browser where you connected TikTok.");
  const value: unknown = JSON.parse(stored);
  if (typeof value !== "object" || value === null || !("proof" in value) || typeof value.proof !== "string" ||
      !("state" in value) || value.state !== state || !("userId" in value) || value.userId !== userId ||
      !("organizationId" in value) || value.organizationId !== organizationId || !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" || value.expiresAt < Date.now()) {
    throw new Error("TikTok consent belongs to a different account, organization or browser. Reconnect TikTok.");
  }
  const result = await apiPost("/tiktok-integrations/finish", { state, code, browser_proof: value.proof });
  sessionStorage.removeItem(PROOF_KEY);
  return result.data;
}

export async function discoverTikTokAccount(connectionId: string) {
  return (await apiPost("/tiktok-integrations/discover", { connection_id: connectionId })).data;
}

export async function attachTikTokAccount(connectionId: string, resourceRef: string) {
  return (await apiPost("/tiktok-integrations/attach", { connection_id: connectionId, resource_ref: resourceRef })).data;
}

export async function refreshTikTokConnection(connectionId: string) {
  return (await apiPost("/tiktok-integrations/refresh", { connection_id: connectionId })).data;
}

export async function disconnectTikTokConnection(connectionId: string) {
  return (await apiPost("/tiktok-integrations/disconnect", { connection_id: connectionId })).data;
}
