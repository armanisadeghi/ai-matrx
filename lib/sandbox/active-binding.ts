/**
 * Resolve the active sandbox binding for outbound chat / agent requests.
 *
 * When a conversation is bound to a sandbox, the matrx-ai tools running inside
 * aidream need three things to route fs/shell/git calls into the container
 * instead of aidream's host:
 *
 *   1. sandbox_id   — the orchestrator's sbx-XXX id
 *   2. base_url     — orchestrator URL up to /sandboxes/<id>
 *   3. access_token — short-lived, sandbox-scoped HMAC bearer
 *
 * ── Which box is bound? (resolution order) ───────────────────────────────
 * The product model is "one shared box per user, by default, across every
 * conversation" — so 20 agents feel like one agent sharing the same files,
 * working state, and memory — with a power-user escape hatch to pin a
 * different box to a single conversation. We resolve, highest priority first:
 *
 *   1. Conversation override — `cx_conversation.sandbox_instance_id`, surfaced
 *      on the conversation record as `sandboxOverride`. The power-user "use a
 *      different box just here" path. `null` for almost everyone.
 *   2. User-active sandbox   — `userPreferences.coding.activeAgentSandbox`, the
 *      shared default that follows the user across reloads, tabs, and surfaces.
 *   3. Editor-active sandbox — `codeWorkspaceSlice` (session-only). A sensible
 *      default inside the /code editor's own chat, below any explicit choice.
 *   4. None → returns `null` → the capability is omitted → multi-tenant aidream.
 *
 * Both the override and the user-active preference store `{ rowId, proxyUrl }`
 * together, so the common path needs no extra fetch. The access token is
 * minted on demand via `POST /api/sandbox/[id]/access-tokens` and cached in
 * module scope until ~30s before expiry. The mint route only issues tokens for
 * a running box, so a terminal (stopped/expired/failed) bound box naturally
 * resolves to `null` here — the UI surfaces a re-attach hint separately.
 *
 * This module is the single place execute thunks (via the `sandbox-fs`
 * capability provider) call to attach the binding to a request.
 */

import type { RootState } from "@/lib/redux/store";
import {
  selectActiveSandboxId,
  selectActiveSandboxProxyUrl,
} from "@/features/code/redux/codeWorkspaceSlice";
import { selectConversationSandboxOverride } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";

/** Loud, greppable prefix. Every branch of the binding chain logs under this. */
const LOG = "[sandbox-binding]";

export interface SandboxBindingPayload {
  sandbox_id: string;
  base_url: string;
  access_token: string;
  root_path: string;
}

/** A resolved sandbox reference — enough to build a binding with no fetch. */
export interface ResolvedSandboxRef {
  rowId: string;
  proxyUrl: string;
  /**
   * "ec2" (slim) boxes have no in-box server — the conversation's loop runs on
   * the nearby dedicated EC2 server (see `resolveBackendForConversation`).
   * "hosted" (heavy) boxes carry the loop themselves. May be absent on refs
   * stored before tier was tracked, or for the editor-active source.
   */
  tier?: "ec2" | "hosted";
  source: "conversation-override" | "user-active" | "editor-active";
}

interface CachedToken {
  token: string;
  /** Unix epoch seconds. We refresh ≥30s before this. */
  exp: number;
}

const TOKEN_CACHE = new Map<string, CachedToken>();
const REFRESH_LEEWAY_SECONDS = 30;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function isStillValid(cached: CachedToken | undefined): cached is CachedToken {
  return !!cached && cached.exp - REFRESH_LEEWAY_SECONDS > nowSec();
}

/**
 * Resolve which sandbox a conversation is bound to, highest priority first.
 * Returns `null` when no box is bound at any level. Pure + synchronous — safe
 * to call on every turn; does no network I/O (token mint happens in
 * `getActiveSandboxBinding`).
 */
export function resolveAgentSandboxRef(
  state: RootState,
  conversationId: string | null | undefined,
): ResolvedSandboxRef | null {
  const override = conversationId
    ? selectConversationSandboxOverride(conversationId)(state)
    : null;
  const userActive = state.userPreferences?.coding?.activeAgentSandbox ?? null;

  // 1. Per-conversation override (power-user pin).
  if (override?.rowId && override.proxyUrl) {
    return { ...override, source: "conversation-override" };
  }

  // 2. User's shared active sandbox.
  if (userActive?.rowId && userActive.proxyUrl) {
    return { ...userActive, source: "user-active" };
  }

  // 3. Editor-active sandbox (session-only, /code workspace).
  const editorRowId = selectActiveSandboxId(state);
  const editorProxyUrl = selectActiveSandboxProxyUrl(state);
  if (editorRowId && editorProxyUrl) {
    return {
      rowId: editorRowId,
      proxyUrl: editorProxyUrl,
      source: "editor-active",
    };
  }

  return null;
}

/**
 * Fetch (or reuse) a sandbox access token. Network call only on first use
 * or when the cached token is within `REFRESH_LEEWAY_SECONDS` of expiring.
 * Returns `null` (and the binding is omitted) when the box isn't running —
 * the mint route rejects non-running sandboxes.
 */
async function fetchAccessToken(sandboxRowId: string): Promise<CachedToken | null> {
  const cached = TOKEN_CACHE.get(sandboxRowId);
  if (isStillValid(cached)) return cached;

  let resp: Response;
  try {
    resp = await fetch(`/api/sandbox/${sandboxRowId}/access-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["ai"] }),
    });
  } catch (err) {
    // LOUD: network-level failure reaching our own mint route. Never silent.
    console.error(
      `${LOG} ❌ token mint request THREW for box ${sandboxRowId}. The /api/sandbox/${sandboxRowId}/access-tokens fetch could not complete. The agent will get NO sandbox tools this turn.`,
      err,
    );
    return null;
  }
  if (!resp.ok) {
    // LOUD: read the body so the REAL reason (missing orchestrator API key,
    // box not running, orchestrator unreachable) is visible — not swallowed.
    const body = await resp.text().catch(() => "(no body)");
    console.error(
      `${LOG} ❌ token mint FAILED for box ${sandboxRowId}: HTTP ${resp.status} ${resp.statusText}. The agent will get NO sandbox tools this turn. Server said: ${body}`,
    );
    return null;
  }
  const json = (await resp.json().catch(() => null)) as
    | { token?: string; exp?: number; expires_at?: string }
    | null;

  // Expiry comes back as EITHER `exp` (unix seconds, legacy) OR `expires_at`
  // (ISO string — what the orchestrator actually returns:
  // `{ token, expires_at, sandbox_id, tier, direct_url, ws_base }`). Accept
  // both. The previous code only read `exp`, so every valid token was rejected
  // and the binding silently dropped.
  let expSec: number | null = null;
  if (typeof json?.exp === "number") {
    expSec = json.exp;
  } else if (json?.expires_at) {
    const ms = new Date(json.expires_at).getTime();
    if (!Number.isNaN(ms)) expSec = Math.floor(ms / 1000);
  }

  if (!json?.token || expSec == null) {
    console.error(
      `${LOG} ❌ token mint returned 200 but the body has no usable token/expiry for box ${sandboxRowId}. Expected { token, expires_at|exp }. Body:`,
      json,
    );
    return null;
  }

  const fresh: CachedToken = { token: json.token, exp: expSec };
  TOKEN_CACHE.set(sandboxRowId, fresh);
  return fresh;
}

/**
 * Build the request-body sandbox block for the conversation's bound sandbox,
 * or `null` if no sandbox is bound / the box isn't running / token mint fails.
 * Safe to call on every turn.
 *
 * Pass a Redux `getState` function (typical from inside a thunk) or the
 * already-snapshotted state, plus the conversationId so the per-conversation
 * override can win over the user-active default.
 */
export async function getActiveSandboxBinding(
  stateOrGetState: RootState | (() => RootState),
  conversationId?: string | null,
): Promise<SandboxBindingPayload | null> {
  const state =
    typeof stateOrGetState === "function"
      ? stateOrGetState()
      : stateOrGetState;

  const ref = resolveAgentSandboxRef(state, conversationId);
  if (!ref) return null;

  // The proxy_url shape is `<orchestrator>/sandboxes/sbx-XXX/proxy`.
  // The orchestrator's structured fs/exec endpoints live one level up at
  // `<orchestrator>/sandboxes/sbx-XXX/...`, so strip the trailing `/proxy`.
  const baseUrl = ref.proxyUrl.replace(/\/proxy\/?$/, "").replace(/\/$/, "");

  // Pull the orchestrator-side sandbox_id out of the URL — the segment
  // right after `/sandboxes/`. This is the id matrx-ai needs to log /
  // surface; tools never use it for routing (base_url is enough).
  const sandboxIdMatch = baseUrl.match(/\/sandboxes\/([^/]+)/);
  const sandboxId = sandboxIdMatch?.[1] ?? "";

  const token = await fetchAccessToken(ref.rowId);
  if (!token) return null; // fetchAccessToken already logged the failure reason.

  return {
    sandbox_id: sandboxId,
    base_url: baseUrl,
    access_token: token.token,
    root_path: "/home/agent",
  };
}

export function clearSandboxBindingCache(sandboxRowId?: string) {
  if (sandboxRowId) TOKEN_CACHE.delete(sandboxRowId);
  else TOKEN_CACHE.clear();
}
