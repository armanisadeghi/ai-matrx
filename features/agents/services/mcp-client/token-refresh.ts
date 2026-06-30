/**
 * MCP Token Refresh
 *
 * Handles OAuth token refresh for MCP server connections.
 * Works server-side only — uses Supabase admin client to read/write tokens.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface McpCredentials {
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  oauth_token_endpoint: string | null;
  oauth_client_id: string | null;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

// ─── Token Check ─────────────────────────────────────────────────────────────

/** Returns true if the token expires within `bufferMs` (default 5 minutes). */
export function isTokenExpiringSoon(
  expiresAt: string | null,
  bufferMs = 5 * 60 * 1000,
): boolean {
  if (!expiresAt) return false; // No expiry info — assume valid
  return new Date(expiresAt).getTime() - Date.now() < bufferMs;
}

// ─── Refresh Flow ────────────────────────────────────────────────────────────

/**
 * Refresh an OAuth access token using the stored refresh token.
 * Updates the database with the new tokens.
 *
 * @returns The new access token, or null if refresh failed.
 */
export async function refreshAccessToken(
  supabase: SupabaseClient<Database>,
  serverId: string,
  userId: string,
): Promise<string | null> {
  // Fetch current credentials via the decrypt RPC
  const { data: creds, error: credsError } = await supabase.rpc(
    "get_mcp_credentials",
    {
      p_server_id: serverId,
      p_user_id: userId,
    },
  );

  if (credsError || !creds || (Array.isArray(creds) && creds.length === 0)) {
    console.error(
      `[MCP Token Refresh] No credentials found for server ${serverId}`,
    );
    return null;
  }

  const credential = Array.isArray(creds) ? creds[0] : creds;
  const typedCred = credential as unknown as McpCredentials;

  if (!typedCred.refresh_token) {
    console.warn(
      `[MCP Token Refresh] No refresh token for server ${serverId} — cannot refresh`,
    );
    return null;
  }

  if (!typedCred.oauth_token_endpoint) {
    console.warn(
      `[MCP Token Refresh] No token endpoint for server ${serverId} — cannot refresh`,
    );
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: typedCred.refresh_token,
    });

    // Look up client_secret from env for Basic Auth
    const { data: serverRow } = await supabase
      .schema("tool").from("mcp_server")
      .select("slug")
      .eq("id", serverId)
      .single();

    const slugUpper = serverRow?.slug?.toUpperCase().replace(/-/g, "_");
    const clientSecret = slugUpper
      ? (process.env[`MCP_SECRET_${slugUpper}`] ??
        process.env[`${slugUpper}_CLIENT_SECRET`] ??
        undefined)
      : undefined;

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (clientSecret && typedCred.oauth_client_id) {
      const credentials = Buffer.from(
        `${typedCred.oauth_client_id}:${clientSecret}`,
      ).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
    } else {
      body.set("client_id", typedCred.oauth_client_id ?? "");
    }

    const response = await fetch(typedCred.oauth_token_endpoint, {
      method: "POST",
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        `[MCP Token Refresh] Failed (${response.status}): ${text.slice(0, 200)}`,
      );

      // Mark connection as refresh_failed
      await supabase.rpc("upsert_mcp_connection", {
        p_server_id: serverId,
        p_access_token: typedCred.access_token,
        p_refresh_token: typedCred.refresh_token,
        p_token_expires_at: typedCred.token_expires_at ?? undefined,
        p_credentials_json: undefined,
        p_config_id: undefined,
        p_transport: "http",
        p_oauth_token_endpoint: typedCred.oauth_token_endpoint,
        p_oauth_client_id: typedCred.oauth_client_id ?? undefined,
        p_oauth_scopes: undefined,
        p_endpoint_override: undefined,
      });

      return null;
    }

    const tokens = (await response.json()) as TokenResponse;

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Store refreshed tokens
    await supabase.rpc("upsert_mcp_connection", {
      p_server_id: serverId,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token ?? typedCred.refresh_token,
      p_token_expires_at: expiresAt ?? undefined,
      p_credentials_json: undefined,
      p_config_id: undefined,
      p_transport: "http",
      p_oauth_token_endpoint: typedCred.oauth_token_endpoint,
      p_oauth_client_id: typedCred.oauth_client_id ?? undefined,
      p_oauth_scopes: undefined,
      p_endpoint_override: undefined,
    });

    console.log(
      `[MCP Token Refresh] Successfully refreshed token for server ${serverId}`,
    );

    return tokens.access_token;
  } catch (err) {
    console.error(
      `[MCP Token Refresh] Error:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Get a valid access token for a server, refreshing if needed.
 * This is the main entry point for server-side code that needs a token.
 */
export async function getValidToken(
  supabase: SupabaseClient<Database>,
  serverId: string,
  userId: string,
): Promise<string | null> {
  const { data: creds, error } = await supabase.rpc("get_mcp_credentials", {
    p_server_id: serverId,
    p_user_id: userId,
  });

  if (error || !creds || (Array.isArray(creds) && creds.length === 0)) {
    return null;
  }

  const credential = Array.isArray(creds) ? creds[0] : creds;
  const typedCred = credential as unknown as McpCredentials;

  // If token is still valid, return it
  if (!isTokenExpiringSoon(typedCred.token_expires_at)) {
    return typedCred.access_token;
  }

  // Try to refresh
  return refreshAccessToken(supabase, serverId, userId);
}
