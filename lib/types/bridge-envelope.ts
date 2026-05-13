/**
 * Bridge envelope wire-format — single source of truth.
 *
 * The matrx-extend Chrome extension and this app coordinate via two
 * substrates that share one envelope shape:
 *
 *   1. `chrome.runtime.sendMessage` (same machine, page → extension SW)
 *      — carries the `FRONTEND_RPC` envelope.
 *   2. Supabase Broadcast on `matrx-extension-bridge:<userId>`
 *      (cross-machine, page ↔ extension SW) — carries the
 *      direction-tagged `BridgeEnvelope`.
 *
 * Both shapes plus the API route's request/response schemas live here so
 * every consumer (hook, API route, demo page, future bridge code)
 * imports the same definitions.
 *
 * Canonical reference: `docs/MATRX_EXTEND_CONNECTION.md`.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Channel naming — Supabase Broadcast substrate
// ---------------------------------------------------------------------------

/**
 * Prefix for the per-user Supabase Broadcast channel. The full channel
 * name is `${BRIDGE_CHANNEL_PREFIX}:${userId}`. Build it via
 * {@link bridgeChannelName} rather than concatenating manually so a
 * single edit here propagates to every consumer.
 */
export const BRIDGE_CHANNEL_PREFIX = "matrx-extension-bridge" as const;

/**
 * Fixed broadcast event name used on every bridge channel. The channel
 * name itself is per-user; this event name is shared so both directions
 * (`frontend->extension` and `extension->frontend`) ride on the same
 * `event`. Mirrors the `channel: "FRONTEND_RPC"` field on the
 * {@link FrontendRpcEnvelope} that's used over `chrome.runtime.sendMessage`.
 *
 * If you change this constant you MUST also update the matching constant
 * on the matrx-extend extension side or the substrates desync.
 */
export const BRIDGE_BROADCAST_EVENT = "FRONTEND_RPC" as const;

/**
 * Build the per-user Supabase Broadcast channel name. Single source of
 * truth — every consumer (hook, server, demo page, extension) should
 * derive the channel name from this helper.
 */
export function bridgeChannelName(userId: string): string {
  return `${BRIDGE_CHANNEL_PREFIX}:${userId}`;
}

// ---------------------------------------------------------------------------
// BridgeEnvelope — Supabase Broadcast wire shape
// ---------------------------------------------------------------------------

/**
 * Direction tag used by the cross-machine Broadcast substrate.
 *
 * `frontend->extension` is published by this app; `extension->frontend`
 * by the extension SW. Subscribers see both — handlers that only want
 * inbound traffic must filter on `direction` themselves (the
 * `useExtensionBridgeChannel` hook does this).
 */
export const BridgeDirectionSchema = z.enum([
  "frontend->extension",
  "extension->frontend",
]);

export type BridgeDirection = z.infer<typeof BridgeDirectionSchema>;

/**
 * Direction-tagged envelope carried over the
 * `matrx-extension-bridge:<userId>` Supabase Broadcast channel.
 *
 * Wire shape:
 *   - `direction` — which side published this envelope
 *   - `action` — dot-namespaced action name (e.g. `panel.open`)
 *   - `requestId` — UUID; replies match the originating request by this
 *   - `payload` — opaque per-action payload
 *   - `timestamp` — ms since epoch when the sender published
 *
 * `payload` is intentionally `unknown` here — per-action payload schemas
 * live with the per-action handler. Do not narrow this schema globally.
 */
export const BridgeEnvelopeSchema = z.object({
  direction: BridgeDirectionSchema,
  action: z.string().min(1),
  requestId: z.string().min(1),
  payload: z.unknown(),
  /** ms since epoch when the sender published. */
  timestamp: z.number(),
});

export type BridgeEnvelope<TPayload = unknown> = Omit<
  z.infer<typeof BridgeEnvelopeSchema>,
  "payload"
> & { payload: TPayload };

// ---------------------------------------------------------------------------
// FrontendRpcEnvelope — chrome.runtime.sendMessage wire shape
// ---------------------------------------------------------------------------

/**
 * Envelope used over `chrome.runtime.sendMessage` (same-machine
 * substrate). The `channel` field is a literal discriminator so the
 * extension SW can route messages without inspecting `action`.
 *
 * Note: this shape has no `direction` field — `chrome.runtime.sendMessage`
 * is inherently directional (page → SW), and the SW replies via the
 * sendResponse callback.
 */
export const FrontendRpcEnvelopeSchema = z.object({
  channel: z.literal("FRONTEND_RPC"),
  action: z.string().min(1),
  payload: z.unknown(),
  requestId: z.string().min(1),
});

export type FrontendRpcEnvelope<TPayload = unknown> = Omit<
  z.infer<typeof FrontendRpcEnvelopeSchema>,
  "payload"
> & { payload: TPayload };

/**
 * Reply shape returned by the extension SW for a `FRONTEND_RPC`
 * envelope. Older extension builds may return the raw result instead
 * of this normalized shape — consumers (`chrome-rpc.ts`,
 * `useExtensionBridgeChannel`) coerce both into this canonical form.
 */
export const FrontendRpcResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  requestId: z.string().min(1).optional(),
});

export type FrontendRpcResponse<TResult = unknown> = Omit<
  z.infer<typeof FrontendRpcResponseSchema>,
  "result"
> & { result?: TResult };

// ---------------------------------------------------------------------------
// Known FRONTEND_RPC actions (documentation only — bridge actions are open-ended)
// ---------------------------------------------------------------------------

/**
 * Documentation-only enumeration of the actions currently understood by
 * the matrx-extend extension SW. NOT enforced as a Zod enum — the bridge
 * is open-ended by design and new actions can be added on either side
 * without a coordinated frontend release.
 *
 * Use this for autocomplete / UI surfaces (the demo page lists these in
 * a dropdown), but never assert against it at runtime.
 */
export const KNOWN_FRONTEND_RPC_ACTIONS = [
  "ping",
  "capabilities",
  "openPanel",
  "callTool",
] as const;

export type KnownFrontendRpcAction = (typeof KNOWN_FRONTEND_RPC_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Per-action payload shapes (documentation hints — the bridge envelope's
// `payload` field is `unknown` so handlers narrow at the dispatch boundary)
// ---------------------------------------------------------------------------

/**
 * Payload shape for the `openPanel` action. The matrx-extend extension
 * publishes one of these envelopes when it wants this app to surface a
 * specific window-panels overlay. The `panelId` MUST be a registered
 * overlayId — see `features/window-panels/registry/overlay-ids.ts`.
 *
 * Consumed by `lib/extension-bridge/openPanelHandler.ts`, which validates
 * with this schema before dispatching `openOverlay(...)`.
 *
 *   - `panelId`     — the overlayId (e.g. `"notes"`, `"feedbackDialog"`).
 *   - `instanceId`  — optional; multi-instance overlays use this to keep
 *                     each open instance isolated. Singleton overlays
 *                     ignore it (defaults to `"default"` downstream).
 *   - `data`        — opaque per-overlay payload, written into the
 *                     overlay's instance data on open. Each overlay
 *                     defines its own data shape.
 */
export const OpenPanelPayloadSchema = z.object({
  panelId: z.string().min(1),
  instanceId: z.string().min(1).optional(),
  data: z.unknown().optional(),
});

export type OpenPanelPayload = z.infer<typeof OpenPanelPayloadSchema>;

// ---------------------------------------------------------------------------
// /api/extension/append-message — request / response schemas
// ---------------------------------------------------------------------------

/**
 * Single content block — `{type: string, ...}`. The cx_message.content
 * column is a `jsonb` array of arbitrary blocks; we only require a
 * `type` discriminator and pass the rest through.
 */
const ContentBlockSchema = z
  .object({ type: z.string() })
  .passthrough();

/**
 * Append-message request body for `POST /api/extension/append-message`.
 *
 * `content` accepts:
 *   - `string` — coerced into `[{ type: "text", text: <string> }]`.
 *   - single block object — wrapped in a one-element array.
 *   - array of blocks — passed through verbatim.
 *
 * `metadata`, `source`, and `agentId` are optional. Caller is
 * responsible for matching the cx_message column shape when passing
 * raw blocks.
 */
export const AppendMessageRequestSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(["user", "assistant", "system", "tool", "output"]),
  content: z.union([
    z.string().min(1),
    ContentBlockSchema,
    z.array(ContentBlockSchema).min(1),
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /**
   * Optional override for the source column on cx_message; defaults to
   * `extension` so admin queries can see where the row came from.
   */
  source: z.string().min(1).max(64).optional(),
  /**
   * Optional agent_id stamping when the message represents an agent
   * speaking (e.g. an extension-scheduled agenda run echoing into the
   * thread).
   */
  agentId: z.string().uuid().optional(),
});

export type AppendMessageRequest = z.infer<typeof AppendMessageRequestSchema>;

/** Subset of the cx_message row returned in the success response. */
const AppendMessageRowSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.string(),
  content: z.unknown(),
  metadata: z.unknown(),
  position: z.number(),
  source: z.string().nullable(),
  agentId: z.string().nullable(),
  createdAt: z.string(),
});

/** Success body for `POST /api/extension/append-message` (HTTP 200). */
export const AppendMessageSuccessResponseSchema = z.object({
  ok: z.literal(true),
  message: AppendMessageRowSchema,
});

/** Failure body for `POST /api/extension/append-message` (4xx / 5xx). */
export const AppendMessageErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  /** Present when the failure was a Zod validation error (HTTP 400). */
  issues: z.array(z.unknown()).optional(),
});

/**
 * Discriminated union of the success / error response shapes. Use
 * `parsed.ok` to narrow.
 */
export const AppendMessageResponseSchema = z.discriminatedUnion("ok", [
  AppendMessageSuccessResponseSchema,
  AppendMessageErrorResponseSchema,
]);

export type AppendMessageResponse = z.infer<typeof AppendMessageResponseSchema>;

// ---------------------------------------------------------------------------
// Cross-component envelope (v2) — superset of BridgeEnvelope
// ---------------------------------------------------------------------------
//
// The schemas above describe the existing extension ↔ frontend bridge with
// its narrow direction enum and rpc-only semantics. The v2 schema below
// extends that to all four components (extension, local, frontend, server)
// with an explicit `kind` discriminator and instance disambiguation.
//
// Back-compat: v1 publishers don't set `kind` (defaults to `"rpc"`) and
// don't set `fromInstance` (defaults to `unknown / unknown`). The schemas
// above keep working unchanged — this is purely additive.
//
// `kind:"task"` is intentionally absent. Cross-component tasks live in the
// `sch_task` table (matrx-scheduler), not in bus envelopes. Wake envelopes
// carry `payload: {taskId: string}` pointing at the durable row.

/**
 * v2 direction string — free-form because cross-component traffic flows
 * between arbitrary (src, dst) pairs (`server->extension`, `local->frontend`,
 * etc.). The legacy {@link BridgeDirectionSchema} closed enum still applies
 * for v1 envelopes.
 */
export const CrossComponentDirectionSchema = z.string().min(1);

/**
 * Identifies a specific running instance of a component. The `component`
 * field is the surface identifier (`extension`, `local`, `frontend`,
 * `server`); `instanceId` is a per-process UUID minted at startup.
 */
export const InstanceRefSchema = z.object({
  component: z.string(),
  instanceId: z.string(),
});

export type InstanceRef = z.infer<typeof InstanceRefSchema>;

/**
 * The v2 cross-component envelope. Carried over Supabase Broadcast on
 * the per-user buses (`matrx-extension-bridge:<userId>`,
 * `matrx-local-bridge:<userId>`, `matrx-server-bus:<userId>`).
 *
 * Defaults applied when v1 publishers send minimal payloads:
 *  - `kind` → `"rpc"`
 *  - `payload` → `null`
 *  - `fromInstance` → `{component: "unknown", instanceId: "unknown"}`
 *  - `toInstance` → undefined (treated as broadcast to any instance)
 */
export const CrossComponentEnvelopeSchema = z.object({
  kind: z.enum(["rpc", "wake", "presence"]).default("rpc"),
  direction: CrossComponentDirectionSchema,
  action: z.string(),
  requestId: z.string(),
  payload: z.unknown().optional().default(null),
  timestamp: z.number(),
  fromInstance: InstanceRefSchema.default({ component: "unknown", instanceId: "unknown" }),
  toInstance: InstanceRefSchema.partial({ instanceId: true }).optional(),
});

export type CrossComponentEnvelope = z.infer<typeof CrossComponentEnvelopeSchema>;

/**
 * Parse a raw broadcast payload (from `chrome.runtime.sendMessage`,
 * Supabase Broadcast event, or any wire source) into a fully-typed v2
 * envelope. v1 payloads parse cleanly thanks to the defaults above.
 *
 * Throws (Zod error) if required fields (`direction`, `action`,
 * `requestId`, `timestamp`) are missing.
 */
export function parseEnvelope(raw: unknown): CrossComponentEnvelope {
  return CrossComponentEnvelopeSchema.parse(raw);
}
