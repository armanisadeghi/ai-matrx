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
 * The binding is SURFACE-scoped, never global. A box bound from one surface's
 * input (e.g. chat) applies to every conversation ON THAT SURFACE and NOTHING
 * else — it must never silently bind a conversation on a surface with no
 * visible/unbindable control (transcription cleanup, other AI integrations).
 * We resolve, highest priority first:
 *
 *   1. Conversation override — `cx_conversation.sandbox_instance_id`, surfaced
 *      on the conversation record as `sandboxOverride`. The "use a different box
 *      just here" path, valid on any surface. `null` for almost everyone.
 *   2. Surface-active sandbox — `userPreferences.coding.activeAgentSandboxBySurface`
 *      keyed by the conversation's OWN `sourceFeature` ("chat-route", …). Not
 *      route-derived (a background turn can run while you're on another route).
 *   3. Editor-active sandbox — `codeWorkspaceSlice` (session-only), applied ONLY
 *      when `sourceFeature === "code-editor"`.
 *   4. None → returns `null` → the capability is omitted → multi-tenant aidream.
 *
 * The override and each per-surface entry store `{ rowId, proxyUrl, tier }`
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
import {
  selectConversationIsEphemeral,
  selectConversationSandboxOverride,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectChatIncognitoActive } from "@/features/agents/components/chat/chat-incognito.slice";

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
  /**
   * Compute-target kind. Absent / "ec2" / "hosted" → orchestrator sandbox
   * (existing client-side token-mint path). "local-pc" → matrx-local PC
   * over Cloudflare tunnel, resolved server-side via
   * `/api/compute-targets/resolve` (uses Supabase session JWT).
   */
  kind?: "ec2" | "hosted" | "local-pc";
  /** Display label latched at selection (rendered by SandboxPanel chip). */
  name?: string;
  source: "conversation-override" | "surface-active" | "editor-active";
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
  if (conversationId && selectConversationIsEphemeral(conversationId)(state)) {
    return null;
  }

  const sourceFeature = conversationId
    ? state.conversations?.byConversationId?.[conversationId]?.sourceFeature
    : undefined;

  // Chat incognito: never attach org/user sandboxes on the chat route, even
  // when a surface-default box is configured in preferences.
  if (sourceFeature === "chat-route" && selectChatIncognitoActive(state)) {
    return null;
  }

  // Level 1: explicit per-conversation override (applies on ANY surface — the
  // user pinned this specific conversation to a box).
  const override = conversationId
    ? selectConversationSandboxOverride(conversationId)(state)
    : null;
  if (override?.rowId && (override.proxyUrl || override.kind === "local-pc")) {
    return { ...override, source: "conversation-override" };
  }

  // The surface this conversation belongs to ("chat-route", "transcript-studio",
  // "agent-runner", …). This is the load-bearing scope: a box bound from one
  // surface's input must NEVER bind a conversation on another surface (where
  // there's no visible/unbindable control). Route-based detection is unsafe
  // (a background transcription runs while the user sits on /chat), so we read
  // the conversation's OWN persisted sourceFeature.
  if (!sourceFeature) return null;

  // Level 2: the box bound for THIS surface, if any.
  const surfaceBound =
    state.userPreferences?.coding?.activeAgentSandboxBySurface?.[
      sourceFeature
    ] ?? null;
  if (
    surfaceBound?.rowId &&
    (surfaceBound.proxyUrl || surfaceBound.kind === "local-pc")
  ) {
    return { ...surfaceBound, source: "surface-active" };
  }

  // The /code editor's connected box — scoped to the code-editor surface ONLY,
  // so it never leaks into chat/transcription/etc.
  if (sourceFeature === "code-editor") {
    const editorRowId = selectActiveSandboxId(state);
    const editorProxyUrl = selectActiveSandboxProxyUrl(state);
    if (editorRowId && editorProxyUrl) {
      return {
        rowId: editorRowId,
        proxyUrl: editorProxyUrl,
        source: "editor-active",
      };
    }
  }

  return null;
}

/**
 * Fetch (or reuse) a sandbox access token. Network call only on first use
 * or when the cached token is within `REFRESH_LEEWAY_SECONDS` of expiring.
 * Returns `null` (and the binding is omitted) when the box isn't running —
 * the mint route rejects non-running sandboxes.
 */
async function fetchAccessToken(
  sandboxRowId: string,
): Promise<CachedToken | null> {
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
  const json = (await resp.json().catch(() => null)) as {
    token?: string;
    exp?: number;
    expires_at?: string;
  } | null;

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
    typeof stateOrGetState === "function" ? stateOrGetState() : stateOrGetState;

  const ref = resolveAgentSandboxRef(state, conversationId);
  if (!ref) return null;

  // Local-PC binding: server-side resolution via /api/compute-targets/resolve.
  // The token comes from the Supabase session (not the orchestrator mint
  // route), and the base_url points at aidream's reverse-proxy which forwards
  // to the user's matrx-local engine over its Cloudflare tunnel.
  if (ref.kind === "local-pc") {
    try {
      const resp = await fetch("/api/compute-targets/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "local-pc", id: ref.rowId }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "(no body)");
        console.error(
          `${LOG} ❌ local-PC resolve FAILED for device ${ref.rowId}: HTTP ${resp.status}. The agent will get NO sandbox tools this turn. Server said: ${body}`,
        );
        return null;
      }
      return (await resp.json()) as SandboxBindingPayload;
    } catch (err) {
      console.error(
        `${LOG} ❌ local-PC resolve THREW for device ${ref.rowId}.`,
        err,
      );
      return null;
    }
  }

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
