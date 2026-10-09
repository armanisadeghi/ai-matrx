/**
 * errorCaptureStore.ts
 *
 * A module-level, React-free ring buffer that captures runtime errors the
 * moment they happen — anywhere, on any page, even outside React render or
 * before the Redux store has hydrated. It is the ONE sink for the systemwide
 * Error Inspector: Supabase/PostgREST errors, uncaught runtime exceptions,
 * unhandled promise rejections, console.error, Python-backend HTTP failures,
 * and React render errors all land here through their own capture adapters.
 *
 * Why a module store and not a Redux slice:
 *   - The Supabase capture proxy (supabaseErrorCapture.ts) is imported by
 *     `utils/supabase/client.ts`, which 1,000+ files depend on. Pulling the
 *     Redux store into that graph (and dispatching on a hot path) is the wrong
 *     coupling. A plain module store has zero deps and never misses an early
 *     error.
 *   - `useSyncExternalStore` gives React components a first-class subscription
 *     to it with correct tearing semantics — see `useCapturedErrors.ts`.
 *
 * Every entry is classified into a display TIER (red / orange / yellow) at
 * capture time via `classifyTier` (lib/diagnostics/errorTierRules.ts). The
 * default is `red`; admins quiet specific errors by adding downgrade rules.
 *
 * This is the single capture path for global runtime errors — the old
 * `adminDebugSlice` listeners were retired in favor of `globalErrorCapture.ts`
 * feeding this store, so there is no parallel system.
 */
import { type BrowserProvenance } from "@/lib/deployment/browser-provenance";
import type { ErrorTier } from "@/lib/diagnostics/errorTiers";
/** How a captured error reached us. */
export type CapturedErrorSource = 
/** A Supabase call resolved with a populated `error` ({ data, error }). */
"supabase-postgrest"
/** A Supabase call threw / its promise rejected (network, abort, etc.). */
 | "supabase-exception"
/** An uncaught error reached `window` 'error' (runtime exception). */
 | "runtime-exception"
/**
 * A failure the `@ai-matrx/chat` package reported through its host
 * diagnostics port (`capture(error, { area, code })`, filed by
 * providers/ChatHostAdapter.tsx); `name` is `chat:<area>`.
 */
 | "chat"
/** An Applet's host (`@ai-matrx/applets/platform` reportError) — `callSite` names where. */
 | "applet"
/** An unhandled promise rejection reached `window`. */
 | "unhandled-rejection"
/** A `console.error(...)` call (noise-filtered). */
 | "console-error"
/** A messaging engine operation failed without a lower-level captured error. */
 | "messaging"
/** A shell navigation icon name was not present in the closed icon registry. */
 | "shell-navigation"
/** A Python-backend call returned a non-2xx HTTP status. */
 | "api-http"
/** A Python-backend call failed at the network layer (timeout, DNS, abort). */
 | "api-network"
/** A same-origin Next.js `/api/*` route answered non-2xx or was unreachable (captureAppApiFetch). */
 | "app-api-http"
/** A React component threw during render and an error boundary caught it. */
 | "react-render"
/**
 * The server's `context_receipt` disagreed with what the composer showed the
 * person (common-docs context-delivery RULES.md §6) — the screen promised
 * one thing and the server did another.
 */
 | "context-truth"
/** A typed `error` event from the stream (ErrorPayload — fatal). */
 | "agent-stream-error"
/** A typed `warning` event from the stream (WarningPayload). */
 | "agent-stream-warning"
/** A `tool_event` with `event: "tool_error"` (a tool failed). */
 | "agent-stream-tool-error"
/** A `provider_retry` event that reached a terminal/paused state. */
 | "agent-stream-provider-retry"
/**
 * A `record_update` with `status: "failed"` — an optimistically-reserved row
 * reached a terminal failed state. Usually the row IS written (provider
 * error in its structured `error` column); rarely a real rollback via
 * fail_all_pending. The wire payload can't distinguish the two yet.
 */
 | "agent-stream-record-failed"
/**
 * After a Stop, the persisted answer holds less text than the screen showed
 * (settleAfterStop). A Stop is `cancelled`, never a failed record — this has
 * its own source so the inspector never names a Stop a failure.
 */
 | "agent-stop-save-shorter"
/** A typed `data` event carrying an error (search_error, memory_error, …). */
 | "agent-stream-data-error"
/**
 * Stream transport failure surfaced by the NDJSON parser (BackendApiError) —
 * the response body died before the server's terminal event. This is the ONE
 * row for such a failure: the parser re-throws after capturing, and
 * `callApi`'s catch stands down via `wasStreamErrorCaptured` rather than
 * adding a poorer `api-network` duplicate. Genuinely red — a clean
 * end-of-stream close never reaches here (measured in production
 * 2026-08-11: `end` → body close in 1 ms, zero captures).
 */
 | "agent-stream-transport"
/** Client-side stream death (heartbeat loss, total-timeout, fetch failure). */
 | "agent-stream-client-error"
/**
 * The server declared the request terminal (user_request completion, fatal
 * error event, or `end`) but never closed the response socket within the
 * grace window — the client closed it locally so the awaited request could
 * settle (D130: the headless image pipeline hung >8 min on a run the server
 * had fully completed). Firing means a SERVER defect: the streaming
 * response was held open (e.g. its heartbeat task outliving send_end).
 */
 | "agent-stream-terminal-guard"
/** An expiring/private media URL reached a render/store path (durability defect). */
 | "media-durability"
/**
 * `@ai-matrx/media`'s diagnostics port fired — a terminal media failure
 * (refused resolve, failed private-pixel bytes, a load error the ONE
 * recovery retry couldn't fix, a failed session mint) or the
 * ephemeral-cookie-secret warning. The package latches one capture per
 * media identity and its payload never carries a signed URL. Bound once in
 * `features/files/media-client/ports.tsx`. This is the port whose ABSENCE
 * made the 2026-08-30 private-image outage invisible to this inspector.
 */
 | "media"
/**
 * A media render DIED on its primary lane and the heal ladder served it
 * anyway (`@ai-matrx/media` 0.6 `phase: "heal", healed: true`). Its own
 * family on purpose: a render that fixes itself is still an incident to be
 * counted and burned down — never the quiet norm. `code` carries the named
 * root cause (`healed:<diagnosis>`), `raw.attempts` the whole ladder.
 */
 | "media-healed"
/**
 * `@ai-matrx/agents/catalog`'s errorSink fired — the ONE agent picker's
 * catalogue read, tier-2 search, favourite write, or mandate default-row
 * resolution failed, or a row arrived with no identity and was dropped.
 * Bound once in `lib/agents/catalog.ts`. Without this port the picker's
 * failures would only reach the console.
 */
 | "agent-catalog"
/**
 * `@ai-matrx/agents/models`' errorSink fired — the ONE model picker's catalog
 * read (user or admin variant) or a model-favorite write failed. Bound once
 * in `lib/ai-models/modelCatalog.ts`; without this port the picker's failures
 * would only reach the console.
 */
 | "model-catalog"
/** `@ai-matrx/agents/skills`' errorSink fired — a skill list / skill / category read failed. Bound in `lib/skills/skillCatalog.ts`. */
 | "skill-catalog"
/**
 * The model's chain-of-thought (`<thinking>`/`<reasoning>`) leaked into the
 * ANSWER text — i.e. it survived the render-block type-split and reached the
 * canonical JSON-extraction / answer-text path. This firing means the stream
 * block accumulator failed to isolate reasoning (an unclosed tag, a novel
 * inline shape); the answer/reasoning boundary is the load-bearing invariant
 * of the single-path streaming model, so this is a real defect to find, not
 * something to silently strip. */
 | "reasoning-leak"
/**
 * Stored data violated the generated wire/DB contract at a read ingress
 * (e.g. a JSONB column failed validation against the OpenAPI schema). The
 * offending value was excluded, not passed through — this firing means a
 * write path produced a non-conforming shape and must be found and fixed.
 */
 | "data-shape"
/**
 * A `?panels=` deep-link token was hydrated but no window ever registered a
 * urlSync entry for it, so the link opened nothing. The token is kept in the
 * address bar and the person is told; this row is the diagnostic. Firing
 * means either a window whose registry `urlSync.key` and hydrator disagree,
 * or a lazy chunk that took longer than the mount deadline to arrive.
 */
 | "url-panel-unopened"
/**
 * The active-org single-source-of-truth was MISSING from Redux when an
 * org-scoped write needed it, so `ensureOrgId` fell back to the personal-org
 * RPC. The `appContextPolicy` sync engine is supposed to keep the org present
 * before any write runs — this firing means a real defect got past it.
 */
 | "org-resolution"
/**
 * A `seo.*` topical-map RPC or table call refused or failed. These functions
 * raise sentences written FOR the caller (22023 argument rules, 23514
 * attachment policies, 42501 `<fn>_denied`, P0002 unknown slug), so the
 * capture carries the message verbatim alongside the SQLSTATE.
 */
 | "topical-map-rpc"
/**
 * A `platform.feature_knob` enum row answered with a value outside the
 * vocabulary this build knows — an admin (or a migration) chose something no
 * screen implements. The reader falls back to the row's own `default_value`
 * and the screen keeps working; this capture is how anyone finds out, and it
 * carries the knob address and the offending value so the fix is one line.
 */
 | "feature-knob-vocabulary"
/**
 * A user-facing `toast.error(...)`. Showing a failure to the user describes
 * handling, not severity; these stay red unless a specific downgrade rule
 * proves that exact toast is expected noise.
 */
 | "user-toast"
/**
 * The marketing crawler/scraper boundary (features/marketing/crawler):
 * a direct scraper command failed (HTTP error, stream error event, broken
 * stream), or a server-side "initialize site" step reported a failure in
 * `web.site.initialization.errors`. These are real cross-service failures —
 * the site UI shows a friendly message, but the underlying cause must land
 * in the inspector with its status/step intact.
 */
 | "marketing-crawler"
/** A scraper NDJSON response completed but carried a failed/invalid page result. */
 | "scraper"
/** An RTK rejected thunk (action type ending in /rejected) — a real failure. */
 | "redux-rejected"
/**
 * The content-ir system (features/content-ir): kind-registry schema loads
 * failing, stream-vs-static parity mismatches (shadow telemetry), or
 * envelope assembly defects. A firing means the canonical structured-
 * content path degraded — streaming keeps working via fallbacks, but the
 * cause must be found.
 */
 | "content-ir"
/**
 * The surface-writeback seam (features/surfaces/runtime/surface-writeback):
 * an agent result / kind-component action tried to write into the page and
 * the contract broke — unknown target, declared target with no registered
 * handler, or the page's apply handler threw. Every firing is a real defect
 * in either the caller or the surface's write wiring.
 */
 | "surface-writeback"
/** Code names a surface absent from the database catalog. */
 | "surface-registration"
/**
 * A Matrx Alchemy contract break reported through the host's `diagnostics`
 * port (`components/agent-copy/alchemy-host-ports.ts`): a declaration, write,
 * operation, action or menu the package could not honour.
 */
 | "alchemy"
/**
 * A runaway markdown delimiter reached a renderer: a stray/unpaired `$$`
 * that would have made remark-math swallow prose into a math node (KaTeX
 * then dumps it as red `.katex-error` text), or an unclosed `[` that would
 * have turned a whole section into one link label. The guard escaped it and
 * the message still renders — but the producer emitting broken delimiters is
 * a real defect to find. See `lib/markdown/delimiter-guard.ts`.
 */
 | "markdown-delimiters"
/**
 * The Assists system (features/assists): an assist chip's action failed —
 * unregistered action kind, handler failure, or a decide/receipt write
 * failing after the action ran. Every firing is a real defect in the
 * producer's action binding or the registry wiring.
 */
 | "assists"
/**
 * A bounded-height chain broke: a scrollable surface overflowed a clipping
 * (`overflow: hidden`) ancestor, so rows past the fold are unreachable and
 * no scrollbar exists. One non-flex wrapper anywhere in the ancestor chain
 * causes it, and nothing else in the app notices. See
 * `lib/layout/useClippedContentGuard.ts`; the static half is
 * `pnpm check:scroll-chain`.
 */
 | "layout-scroll-chain"
/**
 * A headless agent run (`runHeadlessAgentJson`) finished without a usable
 * structured result — the caller got an error instead of data, and a paid
 * model call was thrown away. Every firing is a real defect: the agent's
 * instructions and the kind it targets have drifted apart, the model
 * produced only reasoning and no answer, or the extraction path lost the
 * object it had already committed. The capture carries the diagnostics
 * (answer-text length, extracted types, request status) needed to tell
 * those apart without re-running the agent.
 */
 | "agent-json-result"
/** Unsaved user work existed only in a browser buffer after repeated save failure or identity drift. */
 | "unsaved-work"
/**
 * A DURABLE run row (a server-owned AI pass the client rejoins after a
 * reload) could not be rejoined, applied, or settled. Firing means the row
 * now disagrees with what actually happened on the server — a run stuck at
 * "running" forever, or an output the surface produced and could not save.
 */
 | "durable-run"
/**
 * A single-record read returned ZERO rows (`lib/records/recordUnavailable.ts`).
 * The user sees an honest "deleted, or an org you can't reach" message — but
 * the cause is either a real access gap (the over-tightening defect class:
 * D133, the owner blocked from his own sites) or a stale id handed to the
 * router. Both are defects to find, so every firing lands here with its
 * entity, id, and whether deletion was actually PROVEN.
 */
 | "record-unavailable"
/**
 * The `@ai-matrx/associations` package's required errorSink port fired —
 * a degraded port path, a guard rejection recovery, a create-then-attach
 * partial failure, or the `demanded_schema_violation` scream (the DB this
 * client points at does not answer a demanded RPC). Bound once in
 * `features/scopes/host/errorSink.ts`.
 */
 | "associations"
/**
 * A hard-coded agent FAST PATH (an SSR seed, a seed-mirror fallback, a
 * manifest role default) ran — or picked what runs — and its id did not
 * match the Holder its Mandate resolves to right now, or the Mandate could
 * not be resolved to check it. The one compliant exception to "nothing
 * works around the mandate system" is a fast path VERIFIED AT RUNTIME; this
 * is that verification failing. Filed by
 * `features/mandates/fast-path-guard.ts`.
 */
 | "mandate-fast-path"
/**
 * Component code stored in the database (a tool display, an applet slot
 * or app, an emit renderer, a kind component) imported a name the sandbox
 * allowlist could not supply. It still renders, with a visible stand-in in
 * that spot; this row names the import path and the origin (`relation`).
 * Filed by `lib/diagnostics/captureUnresolvedImports.ts`.
 */
 | "sandbox-unresolved-import";
/** A Supabase DML verb, or "rpc" for a function call. */
export type CapturedOperation = "select" | "insert" | "update" | "upsert" | "delete" | "rpc" | "unknown";
export interface CapturedError {
    /** Stable id for React keys + dedupe targeting. */
    id: string;
    source: CapturedErrorSource;
    /** Epoch ms of the FIRST occurrence in this dedupe group. */
    firstAt: number;
    /** Epoch ms of the MOST RECENT occurrence. */
    lastAt: number;
    /** How many times this exact signature has fired (deduped). */
    count: number;
    /** `window.location.pathname` at capture time. */
    route: string;
    /** `window.location.href` at capture time. */
    url: string;
    /** Loaded document identity at the latest occurrence, never at flush time. */
    browserProvenance?: BrowserProvenance;
    /** select / insert / rpc / … when known. */
    operation: CapturedOperation;
    /** Postgres schema if the call went through `.schema(name)`. */
    schema?: string;
    /** Table name, or RPC function name. */
    relation?: string;
    /** PostgREST / Postgres error code, e.g. "42501", "PGRST116". */
    code?: string;
    /** Primary error message. */
    message: string;
    /** PostgREST `details`. */
    details?: string;
    /** PostgREST `hint`. */
    hint?: string;
    /** HTTP status when available. */
    status?: number;
    /**
     * The human-friendly message the server intends for end users (stream
     * `user_message`, API `user_message`) — distinct from the technical
     * `message`. This is the field a future user-facing surface would show.
     */
    userMessage?: string;
    /**
     * The PRODUCER's own severity verdict, when it ships one (server stream
     * warnings carry `level` + `recoverable`). Kept as first-class fields, not
     * folded into `details`, so `errorTierRules` can actually match on them —
     * a self-declared recoverable warning that lands red is a classification
     * bug, and it can only be fixed if the classifier can see the claim.
     */
    recoverable?: boolean;
    /** Producer-declared level, e.g. "low" | "medium" | "high". */
    level?: string;
    /** Backend request id (X-Request-ID / serverDetail.request_id) for log correlation. */
    requestId?: string;
    /** Conversation id when the error belongs to an agent run. */
    conversationId?: string;
    /** Error.name for thrown exceptions. */
    name?: string;
    /** Stack trace for thrown exceptions (the error's own stack). */
    stack?: string;
    /**
     * Cleaned application call-site — where the failing query was issued from
     * (component / hook / service frames, node_modules stripped). This is the
     * "which component" answer for PostgREST errors that carry no JS stack.
     */
    callSite?: string;
    /** Full JSON-safe dump of the original error object — future-proof. */
    raw?: unknown;
    /**
     * What the client knew about its own Supabase session when this fired
     * (DD-237): `attached`, `pre_attach` (the auth cookie says this browser is
     * signed in but no session was in hand — racing at boot, or lapsed in a
     * long-lived tab), `signed_out`, or `unknown`.
     *
     * It is a FIRST-CLASS field, not a line in `details`, for the same reason
     * `recoverable` is: a tier rule and the server-side triage query both have
     * to be able to see it. Until 2026-09-14 a client read refused for having no
     * identity reached `ops.system_error` as a bare `42501 permission denied`,
     * indistinguishable from a real grant gap, and three lanes spent a day each
     * re-deriving which one it was. Stamped by `supabaseErrorCapture.ts` and
     * persisted into `context.session_state`.
     */
    sessionState?: string;
    /** False keeps an expected recovery visible locally without filing a system_error. */
    durable?: boolean;
    /** red (loud) · orange (dot) · yellow (silent). Default red. */
    tier: ErrorTier;
    /** The downgrade rule id that set this tier, if any. */
    tierRuleId?: string;
    /** The downgrade rule's reason, for display. */
    tierReason?: string;
    /**
     * Cached dedupe key (see `signatureOf`). Computed once at capture and reused
     * on every later occurrence: a transport storm fires the same signature
     * hundreds of times in under a second, and rebuilding the key for all ~300
     * held entries on each occurrence turned the collapse itself into the cost.
     * Internal — never rendered.
     */
    dedupeKey: string;
    /**
     * True for a row brought back from this tab's sessionStorage after a reload
     * (see "Tab-session persistence" below). It was already filed to the server
     * by the page that captured it, so `persistCapturedErrors` never files it
     * again; a recurrence on the new page clears the flag (fresh evidence).
     */
    restoredFromPreviousPage?: true;
}
/** The minimal input a capture site provides; the store fills the rest. */
export interface CaptureInput {
    source: CapturedErrorSource;
    operation?: CapturedOperation;
    schema?: string;
    relation?: string;
    code?: string;
    message: string;
    details?: string;
    hint?: string;
    status?: number;
    userMessage?: string;
    /** Producer-declared "the run survived this" — see CapturedError.recoverable. */
    recoverable?: boolean;
    /** Producer-declared level, e.g. "low" | "medium" | "high". */
    level?: string;
    requestId?: string;
    conversationId?: string;
    name?: string;
    stack?: string;
    callSite?: string;
    raw?: unknown;
    /** DD-237 — see CapturedError.sessionState. */
    sessionState?: string;
    /** Set false only for expected, successfully handled diagnostics. Default true. */
    durable?: boolean;
    /**
     * Separates failures that share a visible signature but belong to distinct
     * server requests. Leave unset for repeatable local failures, which should
     * continue to collapse into one occurrence.
     */
    dedupeDiscriminator?: string;
}
export interface CapturedErrorStats {
    /** Distinct entries currently held (after dedupe). */
    total: number;
    /** Sum of every occurrence (counts the deduped repeats). */
    occurrences: number;
    /** Occurrences since the inspector was last marked seen. */
    unseen: number;
    /** Distinct red (Clear Error) entries. */
    red: number;
    /** Distinct orange (Minor) entries. */
    orange: number;
    /** Distinct yellow (Silent) entries. */
    yellow: number;
    /** Unseen occurrences at the red tier (pulses the red badge). */
    unseenRed: number;
    /** Unseen occurrences at the orange tier (pulses the orange dot). */
    unseenOrange: number;
}
/**
 * Capture an error into the store. Idempotent-friendly: identical consecutive
 * signatures are deduped (count++ / lastAt updated) and floated to the top
 * instead of flooding the buffer — essential during a cutover where one broken
 * query fires on a loop.
 */
/**
 * DD-237 — what the client knew about its own Supabase session, for captures
 * that do not carry it themselves.
 *
 * The Supabase wrapper stamps `sessionState` on its own captures because it
 * holds the call context. Every OTHER adapter — the Redux middleware, the
 * Python-backend client, `identity_unavailable`, a thunk's rejection — reaches
 * this store without it, and those are exactly the rows where "was there a
 * session at all?" is the first question anyone asks. Measured on production
 * 2026-09-14, in the first three hours after the barrier shipped: 61 client
 * rows, every one from an adapter that could not answer it.
 *
 * A PROBE, not an import: `sessionBarrier` imports `captureError` from this
 * module, so a static edge back would be a cycle. The barrier registers this at
 * install time; until then, and on the server, it is simply absent.
 */
type SessionStateProbe = () => string | undefined;
export declare function setSessionStateProbe(probe: SessionStateProbe | null): void;
export declare function captureError(rawInput: CaptureInput): string;
export interface CapturedErrorResolution {
    conversationId?: string;
    name?: string;
    stack?: string;
    /** Replace the technical summary when a later resolver learned the truth. */
    message?: string;
    /** Replace the human sentence when the resolved state changes it. */
    userMessage?: string;
    /** Replace the raw structured object with the resolver-enriched payload. */
    raw?: unknown;
}
/**
 * Reconcile an existing capture after a later structured resolver learns more.
 * This is NOT another occurrence: identity/count/timestamps stay intact. The
 * same row is reclassified through the canonical tier rules and its unseen
 * tier counters move with it, so a handled result cannot leave a stale red
 * badge behind. Unknown/unmatched outcomes remain red by default.
 */
export declare function resolveCapturedError(id: string, resolution: CapturedErrorResolution): void;
/** Subscribe to any change. Returns an unsubscribe fn. */
export declare function subscribe(listener: () => void): () => void;
/** Current newest-first snapshot. Identity changes only when contents change. */
export declare function getSnapshot(): CapturedError[];
/** SSR snapshot — always the same empty reference. */
export declare function getServerSnapshot(): CapturedError[];
/** Current stats snapshot. Identity-stable until a value changes. */
export declare function getStatsSnapshot(): CapturedErrorStats;
/** Wipe everything. */
export declare function clearCapturedErrors(): void;
/** Remove a single entry by id. */
export declare function dismissCapturedError(id: string): void;
/** Reset the unseen counters — call when the inspector is opened/viewed. */
export declare function markAllSeen(): void;
export {};
