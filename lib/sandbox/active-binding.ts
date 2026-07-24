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
 * ── THE SOURCE OF TRUTH: the conversation record ─────────────────────────
 * A conversation's sandbox binding lives in exactly ONE place — on the
 * conversation record (`sandboxBinding`), persisted to
 * `cx_conversation.sandbox_instance_id` (+ a metadata mirror for proxyUrl /
 * tier / kind / name) and rehydrated by the conversation bundle. Redux therefore
 * looks IDENTICAL for a freshly-created conversation and a fetched one, and the
 * client and the server (which reads the same column) can never disagree about
 * which box a conversation is bound to.
 *
 * The per-surface preference (`userPreferences.coding.activeAgentSandboxBySurface`)
 * is NOT a binding. It is a SEED: "which box should a NEW conversation on this
 * surface start out attached to". The moment a turn actually goes out with that
 * box — or the user attaches one from the panel — it is PROMOTED onto the
 * conversation record and written to the DB (`promoteSurfaceSeedToConversation`
 * in sandbox-gate.thunk.ts). From then on the record is the only thing anyone
 * reads.
 *
 * Why this matters (the bug this shape kills): treating the surface preference
 * as a binding meant a brand-new conversation on /chat/new "was bound to a
 * sandbox" because of a stale preference pointing at a long-dead box — so the
 * pre-send gate fired and claimed the conversation had a sandbox it had never
 * had. A conversation that has never gone out with a box has nothing to protect.
 *
 * Resolution, highest priority first:
 *
 *   1. Conversation binding — the record. The ONLY thing that counts as "this
 *      conversation is bound" (and the only thing the pre-send gate reads).
 *   2. Surface seed — the per-surface preference, keyed by the conversation's
 *      OWN `sourceFeature` ("chat-route", …), NOT the route (a background turn
 *      can run while you're on another route). Surface-scoped, never global: a
 *      box bound from chat must never silently bind a conversation on a surface
 *      with no visible control (transcription cleanup, other integrations).
 *      Arms an unbound conversation at turn time, then gets promoted.
 *   3. Editor seed — `codeWorkspaceSlice` (session-only), ONLY when
 *      `sourceFeature === "code-editor"`.
 *   4. None → returns `null` → the capability is omitted → multi-tenant aidream.
 *
 * Liveness suppression (self-healing): a bound box can go momentarily
 * unmintable (mid-restart/migration, or a stale 60s DB status snapshot the mint
 * route 409s on) or terminally expire long after selection, and the stored ref
 * carries no liveness signal. On a mint failure we suppress its rowId for a
 * BOUNDED cooldown (`markSandboxDead`) — `resolveAgentSandboxRef` then refuses
 * to resolve it at every level, suppressing BOTH the binding AND the
 * `ec2-dedicated` server routing, so the turn falls back to the global server
 * instead of POSTing to a dead EC2 host (502 + CORS). The mint runs before the
 * AI stream in the same turn, so suppressing in turn N protects turn N. Crucial
 * difference from the old design: the window EXPIRES — after the cooldown the
 * next turn retries the mint and a success clears it, so a box that recovered
 * self-heals with NO manual re-attach (a transient blip must never drop the
 * binding for the whole session — that was the "filesystem vanished" bug).
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
  selectConversationSandboxBinding,
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
  /**
   * Where the ref came from. `"conversation"` is the only one that means "this
   * conversation IS bound" — the other two are seeds for an as-yet-unbound
   * conversation, promoted onto the record on first use.
   */
  source: "conversation" | "surface-seed" | "editor-seed";
}

interface CachedToken {
  token: string;
  /** Unix epoch seconds. We refresh ≥30s before this. */
  exp: number;
}

const TOKEN_CACHE = new Map<string, CachedToken>();
const REFRESH_LEEWAY_SECONDS = 30;

/**
 * Box rowIds we KNOW are dead (terminal: expired / stopped / failed), learned
 * from the orchestrator at token-mint time. A bound box can expire long after
 * it was selected; the stored Redux ref has no liveness signal, so without this
 * the resolver keeps handing back a corpse — and a NEW conversation auto-
 * inherits the surface-default corpse and routes its whole turn to a dead EC2
 * host (502 + CORS). Once a box is in here, `resolveAgentSandboxRef` refuses to
 * resolve it, which suppresses BOTH the sandbox binding AND the `ec2-dedicated`
 * server routing, so the turn falls back to the global server.
 *
 * The mint runs (buildToolInjection → getActiveSandboxBinding) BEFORE the AI
 * stream fires (runAiStream) within the same turn, so marking dead here in turn
 * N stops the stream in turn N from ever reaching the dead host.
 */
interface DeadEntry {
  reason: string;
  /** Unix epoch seconds. The box is suppressed only UNTIL this moment. */
  until: number;
}
const DEAD_SANDBOXES = new Map<string, DeadEntry>();

/**
 * A tombstone is a SUPPRESSION WINDOW, never a permanent verdict.
 *
 * The original design marked a box dead for the WHOLE session and — because
 * `resolveAgentSandboxRef` short-circuits dead boxes BEFORE minting — the only
 * clear paths (`clearSandboxBindingCache`, or a successful mint) were both
 * unreachable. A single transient failure (a box mid-restart/migration, or a
 * stale 60s DB status snapshot the mint route 409s on) therefore dropped the
 * sandbox binding for every remaining turn, silently degrading the agent to
 * the multi-tenant VFS — the "my filesystem vanished mid-conversation" bug.
 *
 * Now every tombstone carries a cooldown. After it elapses, `isSandboxDead`
 * lets the resolver try a fresh mint; a success clears the entry entirely, so
 * a box that recovered self-heals on the next turn — NO manual re-attach.
 * Transient/ambiguous signals get a short window; clearly-terminal ones a
 * longer one (still bounded, since a re-created box gets a new rowId anyway).
 */
const DEAD_COOLDOWN_TRANSIENT_SEC = 15;
const DEAD_COOLDOWN_TERMINAL_SEC = 60;

/** Mint-failure bodies that mean the box is genuinely gone (not a transient blip). */
const TERMINAL_STATUS_RE =
  /status:\s*(expired|terminated|failed|deleted|gone)/i;

/**
 * Suppress a box for a bounded cooldown so the resolver stops binding/routing
 * to it — then lets it self-heal. Loud. Repeated failures refresh the window
 * (and never shorten a longer one already in place).
 */
export function markSandboxDead(
  rowId: string,
  reason: string,
  cooldownSec: number = DEAD_COOLDOWN_TRANSIENT_SEC,
): void {
  const until = nowSec() + cooldownSec;
  const existing = DEAD_SANDBOXES.get(rowId);
  DEAD_SANDBOXES.set(rowId, {
    reason,
    until: existing ? Math.max(existing.until, until) : until,
  });
  console.warn(
    `${LOG} ⚰️ box ${rowId} suppressed for ~${cooldownSec}s (${reason}). Sandbox tools + ec2 routing fall back to the global server until the window elapses, then it self-heals on the next turn if the box is live again — no manual re-attach.`,
  );
}

/**
 * True only while a box is inside its suppression window. Once the cooldown
 * has elapsed the entry is dropped and this returns false, so the very next
 * turn attempts a fresh mint and the binding self-heals on success.
 */
export function isSandboxDead(rowId: string): boolean {
  const entry = DEAD_SANDBOXES.get(rowId);
  if (!entry) return false;
  if (entry.until <= nowSec()) {
    DEAD_SANDBOXES.delete(rowId);
    return false;
  }
  return true;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function isStillValid(cached: CachedToken | undefined): cached is CachedToken {
  return !!cached && cached.exp - REFRESH_LEEWAY_SECONDS > nowSec();
}

/** The stored shape of a ref on the conversation record / in the surface preference. */
type StoredSandboxRef = Omit<ResolvedSandboxRef, "source">;

/**
 * A ref is a BINDING as soon as it names a box — `rowId` and nothing else.
 *
 * It used to also demand a `proxyUrl`, which silently equated "we don't have the
 * URL cached" with "not bound". Two ways that lied: a binding written by
 * aidream's own `PUT /ai/conversations/{id}/sandbox` sets the column and no
 * metadata at all, and a local-PC binding never has a proxyUrl to begin with.
 * Both looked UNBOUND to this resolver, so the turn went out to the global
 * server with no sandbox and no gate — the exact silent fallback this module
 * exists to make impossible. The URL is not identity; it is a routing detail,
 * re-derivable from the row (`resolveProxyUrl` below) and cached in metadata.
 */
function isUsableRef(
  ref: Partial<StoredSandboxRef> | null | undefined,
): ref is StoredSandboxRef {
  return !!ref?.rowId;
}

/**
 * True when a sandbox must not be attached to this conversation at all —
 * incognito chat and ephemeral conversations never bind a box.
 */
function isSandboxBlocked(
  state: RootState,
  conversationId: string | null | undefined,
): boolean {
  if (conversationId && selectConversationIsEphemeral(conversationId)(state)) {
    return true;
  }
  const sourceFeature = conversationId
    ? state.conversations?.byConversationId?.[conversationId]?.sourceFeature
    : undefined;
  return sourceFeature === "chat-route" && selectChatIncognitoActive(state);
}

/**
 * THE binding — the box this conversation is actually bound to, read off the
 * conversation record (persisted at `cx_conversation.sandbox_instance_id`).
 *
 * This is the ONLY function that answers "is this conversation bound to a
 * sandbox?", and it is what the pre-send hard-gate reads. A surface preference
 * is NOT a binding: a conversation that has never gone out with a box has
 * nothing to protect, so gating it would be a lie (that was the /chat/new
 * "bound to a sandbox that doesn't exist" bug).
 *
 * No liveness filter — this is stored INTENT. `resolveAgentSandboxRef` answers
 * the different question "is a live box resolvable right now?". A bound-but-
 * unresolvable box returns a ref HERE and `null` there; that gap is exactly the
 * gate condition. Pure + synchronous; no network I/O.
 */
export function getConversationSandboxBinding(
  state: RootState,
  conversationId: string | null | undefined,
): ResolvedSandboxRef | null {
  if (!conversationId || isSandboxBlocked(state, conversationId)) return null;

  const binding = selectConversationSandboxBinding(conversationId)(state);
  return isUsableRef(binding) ? { ...binding, source: "conversation" } : null;
}

/**
 * The SEED for an as-yet-unbound conversation: which box a new conversation on
 * this surface should start out attached to. NOT a binding — nothing gates on
 * it. `promoteSurfaceSeedToConversation` (sandbox-gate.thunk.ts) turns a seed
 * into a real binding the first time a turn actually goes out with it, after
 * which the conversation record is the only thing anyone reads.
 */
export function getSurfaceSeedRef(
  state: RootState,
  conversationId: string | null | undefined,
): ResolvedSandboxRef | null {
  if (!conversationId || isSandboxBlocked(state, conversationId)) return null;

  // The surface this conversation belongs to ("chat-route", "transcript-studio",
  // "agent-runner", …). This is the load-bearing scope: a box bound from one
  // surface's input must NEVER bind a conversation on another surface (where
  // there's no visible/unbindable control). Route-based detection is unsafe
  // (a background transcription runs while the user sits on /chat), so we read
  // the conversation's OWN persisted sourceFeature.
  const sourceFeature =
    state.conversations?.byConversationId?.[conversationId]?.sourceFeature;
  if (!sourceFeature) return null;

  const surfaceSeed =
    state.userPreferences?.coding?.activeAgentSandboxBySurface?.[
      sourceFeature
    ] ?? null;
  if (isUsableRef(surfaceSeed)) {
    return { ...surfaceSeed, source: "surface-seed" };
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
        source: "editor-seed",
      };
    }
  }

  return null;
}

/**
 * The binding if there is one, else the seed that WOULD be promoted on the next
 * turn. Display-only ("which box will this conversation use?") — the SandboxPanel
 * chip and `useVerifiedSandboxBinding` render from this so the UI and the turn-
 * time resolver never disagree. Never use it to decide whether to gate a send:
 * that is `getConversationSandboxBinding` alone.
 */
export function getEffectiveSandboxRef(
  state: RootState,
  conversationId: string | null | undefined,
): ResolvedSandboxRef | null {
  return (
    getConversationSandboxBinding(state, conversationId) ??
    getSurfaceSeedRef(state, conversationId)
  );
}

/**
 * Resolve which LIVE sandbox this turn should route into: the conversation's
 * binding, or — for a conversation that has never been bound — the surface seed
 * (which `ensureSandboxOrDecide` promotes onto the record in the same turn, so
 * the two converge immediately). Returns `null` when nothing is bound/seeded OR
 * the box is inside its dead-box suppression window. Pure + synchronous — safe
 * to call on every turn; does no network I/O (token mint happens in
 * `getActiveSandboxBinding`).
 */
export function resolveAgentSandboxRef(
  state: RootState,
  conversationId: string | null | undefined,
): ResolvedSandboxRef | null {
  const ref = getEffectiveSandboxRef(state, conversationId);
  if (!ref) return null;
  // A box we've learned is dead (token mint reported it not-running) must NOT
  // resolve while suppressed — otherwise a turn routes to a dead host. The
  // suppression is time-boxed (see isSandboxDead) so it self-heals.
  if (isSandboxDead(ref.rowId)) {
    console.warn(
      `${LOG} skipping bound box ${ref.rowId} for conversation ${conversationId ?? "(none)"} — suppressed (${DEAD_SANDBOXES.get(ref.rowId)?.reason ?? "unknown"}). Falling back to the global server until the cooldown elapses; it retries automatically.`,
    );
    return null;
  }
  return ref;
}

/**
 * `proxy_url` for a box, re-derived from its row when the binding doesn't carry
 * one. Deliberately not a stored column anywhere in the platform — the server
 * recomputes it from `sandbox_id` + tier (`decorate-sandbox-row.ts`), and
 * `GET /api/sandbox/{id}` returns the decorated row — so this is a re-derivation,
 * not a lookup of some second source of truth.
 *
 * Cached per rowId for the session: the URL is a pure function of the row, and
 * the token mint already fails loudly if the box has since died. Returns null
 * (loudly) if the box can't be read — that lands as "bound but unresolvable",
 * which the pre-send gate turns into a user decision rather than a silent
 * unbound send.
 */
const PROXY_URL_CACHE = new Map<string, ResolvedRefDetails>();

export interface ResolvedRefDetails {
  proxyUrl: string;
  tier?: "ec2" | "hosted";
  name?: string;
}

/**
 * Re-derive a box's routing details from its row. `tier` matters as much as the
 * URL: `resolve-base-url` reads it SYNCHRONOUSLY to decide whether the turn runs
 * on the nearby dedicated EC2 server, so a binding with no cached tier would
 * quietly route the loop to the global server. The pre-send gate calls this and
 * writes the result back onto the conversation, healing the cache before the
 * request is assembled — so the first turn after a server-written bind is
 * already correct, not just the second.
 */
export async function resolveSandboxRefDetails(
  sandboxRowId: string,
): Promise<ResolvedRefDetails | null> {
  const cached = PROXY_URL_CACHE.get(sandboxRowId);
  if (cached) return cached;

  try {
    const resp = await fetch(`/api/sandbox/${sandboxRowId}`);
    if (!resp.ok) {
      console.error(
        `${LOG} ❌ could not re-derive routing details for bound box ${sandboxRowId}: GET /api/sandbox/${sandboxRowId} → HTTP ${resp.status}. The conversation IS bound to this box, so the turn will NOT silently run unbound — the pre-send gate asks the user what to do.`,
      );
      return null;
    }
    const json = (await resp.json()) as {
      instance?: {
        proxy_url?: string | null;
        tier?: string | null;
        config?: { template?: string | null } | null;
        sandbox_id?: string | null;
      };
    };
    const inst = json.instance;
    const proxyUrl = inst?.proxy_url ?? null;
    if (!proxyUrl) {
      console.error(
        `${LOG} ❌ box ${sandboxRowId} came back with no proxy_url — it has no sandbox_id/tier to recompute one from, so the row is unroutable.`,
      );
      return null;
    }
    const details: ResolvedRefDetails = {
      proxyUrl,
      tier:
        inst?.tier === "ec2" || inst?.tier === "hosted" ? inst.tier : undefined,
      name: inst?.config?.template ?? inst?.sandbox_id ?? undefined,
    };
    PROXY_URL_CACHE.set(sandboxRowId, details);
    console.warn(
      `${LOG} re-derived routing details for bound box ${sandboxRowId} (the binding carried none — written by the server's bind endpoint, or a pre-cache row). proxy_url is never persisted by design; this is a recompute, not a second source of truth.`,
    );
    return details;
  } catch (err) {
    console.error(
      `${LOG} ❌ routing-detail re-derivation THREW for box ${sandboxRowId}.`,
      err,
    );
    return null;
  }
}

async function resolveProxyUrl(sandboxRowId: string): Promise<string | null> {
  const details = await resolveSandboxRefDetails(sandboxRowId);
  return details?.proxyUrl ?? null;
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
    // Suppress the box briefly so we don't bind/route to it while it's
    // unmintable. CRUCIAL: distinguish transient from terminal. The mint route
    // 409s on any status outside {ready,running,starting} — which includes
    // transient states (creating, a box mid-restart/migration, or a stale 60s
    // DB status snapshot). Treating a bare 409 as terminal-for-the-session was
    // the bug: a momentary blip permanently dropped the binding. Only a body
    // with a clearly-terminal status gets the long window; everything else
    // (bare 409, "not running", a transient status) gets a short one and
    // self-heals on the next turn once the box is live again. A transient 5xx /
    // network error is NOT suppressed at all (handled above / retried next turn).
    if (resp.status === 409 || TERMINAL_STATUS_RE.test(body)) {
      const terminal = TERMINAL_STATUS_RE.test(body);
      markSandboxDead(
        sandboxRowId,
        `mint HTTP ${resp.status}: ${body}`,
        terminal ? DEAD_COOLDOWN_TERMINAL_SEC : DEAD_COOLDOWN_TRANSIENT_SEC,
      );
    }
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
  DEAD_SANDBOXES.delete(sandboxRowId); // a successful mint means it's alive again
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
        const reason = `local-PC device ${ref.rowId} resolve returned HTTP ${resp.status}: ${body}`;
        markSandboxDead(
          ref.rowId,
          reason,
          resp.status === 410
            ? DEAD_COOLDOWN_TERMINAL_SEC
            : DEAD_COOLDOWN_TRANSIENT_SEC,
        );
        if (resp.status !== 410) {
          console.error(
            `${LOG} ❌ ${reason}. The agent will get NO sandbox tools this turn.`,
          );
        }
        return null;
      }
      DEAD_SANDBOXES.delete(ref.rowId);
      return (await resp.json()) as SandboxBindingPayload;
    } catch (err) {
      console.error(
        `${LOG} ❌ local-PC resolve THREW for device ${ref.rowId}.`,
        err,
      );
      return null;
    }
  }

  // A binding names a box; it does not necessarily carry its URL (aidream's bind
  // endpoint writes only the column; the metadata cache may be absent or from a
  // pre-rework row). `proxy_url` is deliberately never persisted anywhere — it is
  // recomputed from `sandbox_id` + tier server-side (see decorate-sandbox-row.ts)
  // — so re-derive it from the row instead of treating the binding as dead.
  const proxyUrl = ref.proxyUrl || (await resolveProxyUrl(ref.rowId));
  if (!proxyUrl) return null; // resolveProxyUrl already logged why.

  // The proxy_url shape is `<orchestrator>/sandboxes/sbx-XXX/proxy`.
  // The orchestrator's structured fs/exec endpoints live one level up at
  // `<orchestrator>/sandboxes/sbx-XXX/...`, so strip the trailing `/proxy`.
  const baseUrl = proxyUrl.replace(/\/proxy\/?$/, "").replace(/\/$/, "");

  // Pull the orchestrator-side sandbox_id out of the URL — the segment
  // right after `/sandboxes/`. This is the id matrx-ai needs to log /
  // surface; tools never use it for routing (base_url is enough).
  const sandboxIdMatch = baseUrl.match(/\/sandboxes\/([^/]+)/);
  // MATRX-EXCEPTION: sandboxId is informational only (logging/surfacing); a
  // failed match falling back to "" doesn't affect routing — baseUrl is what
  // tools actually use.
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
  if (sandboxRowId) {
    TOKEN_CACHE.delete(sandboxRowId);
    PROXY_URL_CACHE.delete(sandboxRowId);
    DEAD_SANDBOXES.delete(sandboxRowId); // re-attach gets a clean slate
  } else {
    TOKEN_CACHE.clear();
    PROXY_URL_CACHE.clear();
    DEAD_SANDBOXES.clear();
  }
}
