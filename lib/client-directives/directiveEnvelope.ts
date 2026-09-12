/**
 * THE platform client-directive wire contract.
 *
 * ONE system, not a settings feature. Anything on the platform that needs to
 * tell a RUNNING client "this changed, react" says it here, on one topic, in
 * one typed envelope — instead of each feature inventing a poll.
 *
 * WHY THIS EXISTS (Arman, 2026-09-10): "we push code updates, and some of those
 * updates include breaking changes that ensure anyone who is logged into a
 * browser is likely to get an error at some point. But we fail to send
 * something to the browser to tell it to refresh or to ask the user to do
 * that… The key is to have a single system that manages all of that."
 *
 * THE TOPIC is `matrx-server-bus:<audience>` — the bus aidream's
 * `services/cross_component/publisher.py` reserved and marked "not yet
 * activated". This file activates it. Two audiences, two rooms, one
 * subscriber:
 *   - `matrx-server-bus:<userId>`  — this user's every running client
 *   - `matrx-server-bus:platform`  — every running client of every user
 * (an organization-wide change is fanned out BY THE SERVER to its members'
 * user rooms — organizations are finite; "every user" is a room, not a loop.)
 * Nothing on this bus is secret: a directive names WHAT changed, never the
 * new value. A receiver always re-reads through its own normal path, so a
 * lost, duplicated or out-of-order directive is harmless and the existing
 * TTL/poll is the correctness backstop.
 *
 * WHO PUBLISHES: only the server. Postgres triggers on the settings tables
 * (`platform.feature_knob`, `platform.knob_override`, `public.app_config`)
 * fire a NOTIFY that aidream's wake listener turns into a broadcast — so a
 * write from THIS browser, from the server, or from a migration announces
 * itself exactly once, and this client has no publish path at all.
 *
 * THE WIRE is the v2 `CrossComponentEnvelope` (`lib/types/bridge-envelope.ts`,
 * mirrored in aidream / matrx-local / matrx-extend) with
 * `kind: "directive"`. Raw wire, exactly like the extension bridge: three
 * other programs already publish and parse this shape and none of them reads
 * a Matrx envelope.
 *
 * ADDING A KIND is one entry in `DIRECTIVE_PAYLOAD_SCHEMAS` plus its payload
 * schema below, the Python twin in aidream's `cross_component/directives.py`,
 * and a handler registration at the consumer. The one contract doc:
 * common-docs/systems/platform/realtime/CLIENT-DIRECTIVES.md. Consumers are OPT-IN:
 * nothing receives a directive it did not register for, and an unhandled
 * directive is announced (see `directiveRegistry.ts`) rather than dropped.
 */

import { defineChannelNamespace } from "@ai-matrx/realtime";
import { z } from "zod";
import {
  CrossComponentEnvelopeSchema,
  type CrossComponentEnvelope,
} from "@/lib/types/bridge-envelope";

// ---------------------------------------------------------------------------
// Topic
// ---------------------------------------------------------------------------

/** The shared room every client joins beside its own. */
export const PLATFORM_AUDIENCE = "platform" as const;

/**
 * The reserved server-bus prefix. Full topic: `${PREFIX}:${audience}`.
 * 🚨 The string is aidream's and matrx-local's contract, not ours — it is
 * declared with `foreignTopic` for the same reason the extension bridge is
 * (see `EXTENSION_BRIDGE_CHANNEL`): renaming it to an `mx:` name would put
 * this app alone in a room while every publisher kept talking to the old one,
 * with nothing failing loudly on either side.
 */
export const SERVER_BUS_PREFIX = "matrx-server-bus" as const;

export const SERVER_BUS_CHANNEL = defineChannelNamespace({
  namespace: "server-bus",
  parts: ["audience"],
  description:
    "The platform client-directive channel: server → every running client (a user's room, or the shared platform room).",
  foreignTopic: SERVER_BUS_PREFIX,
});

/** `matrx-server-bus:<userId>` or `matrx-server-bus:platform`. */
export function serverBusChannelName(audience: string): string {
  return SERVER_BUS_CHANNEL.topic({ audience });
}

/**
 * The broadcast event name on this bus. `"message"` is what
 * `aidream/services/cross_component/publisher.py` already posts and what
 * matrx-local's `on_broadcast(event="message")` already listens for — the
 * directive channel joins that convention rather than forking it.
 */
export const DIRECTIVE_BROADCAST_EVENT = "message" as const;

// ---------------------------------------------------------------------------
// Actions and their payloads
// ---------------------------------------------------------------------------

/**
 * `settings_changed` — a registry key's value changed. Names the key and the
 * scope it changed at; never the value. The receiver drops its cache and
 * re-reads. Published ONLY for keys whose `platform.feature_knob.propagation`
 * is `'instant'` — a `'next_load'` key (the default) must never appear here.
 * Mirrors aidream `SettingsChangedPayload` field for field.
 */
export const SettingsChangedPayloadSchema = z.object({
  /** Which registry the key lives in. */
  registry: z.enum(["feature_knob", "knob_override", "user_preference"]),
  /** The feature the key belongs to, e.g. `"chat"`. */
  feature: z.string().min(1),
  /** The key inside that feature, e.g. `"max_attachments"`. */
  key: z.string().min(1),
  /**
   * The ladder rung the write landed on, when the write was an override
   * (`{kind: "organization", id: "…"}`). Absent for a platform-level write.
   */
  scope: z
    .object({ kind: z.string().min(1), id: z.string().min(1) })
    .nullish(),
  /** The owning organization of an override rung; null at the platform rung. */
  organization_id: z.string().nullish(),
});
export type SettingsChangedPayload = z.infer<typeof SettingsChangedPayloadSchema>;

/**
 * `app_config_changed` — a `public.app_config` row was written. The receiver
 * re-fetches its own row; it never trusts a value off the wire.
 */
export const AppConfigChangedPayloadSchema = z.object({
  /** The `app_config.app` slug that changed, e.g. `"matrx-local"`. */
  app: z.string().min(1),
});
export type AppConfigChangedPayload = z.infer<
  typeof AppConfigChangedPayloadSchema
>;

/**
 * `refresh_required` — the running client is (or is about to be) on code that
 * no longer matches the platform.
 *
 * 🚨 This is a REQUEST TO ASK, never a command to reload. `components/errors/`
 * carries the one law — *never reload a live session on the user's behalf* —
 * because an auto-reload once destroyed a page full of unsaved work. The web
 * handler routes this into the EXISTING consent toast (Refresh / Not now) and
 * there is no code path from a directive to `location.reload()`.
 */
export const RefreshRequiredPayloadSchema = z.object({
  /** Why, in machine terms — for logs and for a receiver that filters. */
  reason: z.enum(["deploy", "breaking_change", "operator"]),
  /** Optional operator copy. Omitted → the client's own default wording. */
  title: z.string().min(1).nullish(),
  body: z.string().min(1).nullish(),
});
export type RefreshRequiredPayload = z.infer<
  typeof RefreshRequiredPayloadSchema
>;

/** Every directive action, and the schema its payload must satisfy. */
export const DIRECTIVE_PAYLOAD_SCHEMAS = {
  settings_changed: SettingsChangedPayloadSchema,
  app_config_changed: AppConfigChangedPayloadSchema,
  refresh_required: RefreshRequiredPayloadSchema,
} as const;

export const DIRECTIVE_ACTIONS = Object.keys(
  DIRECTIVE_PAYLOAD_SCHEMAS,
) as readonly DirectiveAction[];

export type DirectiveAction = keyof typeof DIRECTIVE_PAYLOAD_SCHEMAS;

export type DirectivePayload<A extends DirectiveAction> = z.infer<
  (typeof DIRECTIVE_PAYLOAD_SCHEMAS)[A]
>;

/** A parsed, typed directive — an envelope whose action and payload agree. */
export type Directive<A extends DirectiveAction = DirectiveAction> = {
  [K in A]: {
    action: K;
    payload: DirectivePayload<K>;
    envelope: CrossComponentEnvelope;
  };
}[A];

// ---------------------------------------------------------------------------
// Parse / build
// ---------------------------------------------------------------------------

export type DirectiveParseFailure =
  | { ok: false; reason: "not_an_envelope"; detail: string }
  | { ok: false; reason: "not_a_directive"; detail: string }
  | { ok: false; reason: "unknown_action"; detail: string }
  | { ok: false; reason: "bad_payload"; detail: string };

export type DirectiveParseResult =
  | { ok: true; directive: Directive }
  | DirectiveParseFailure;

/**
 * Parse a raw broadcast payload into a typed directive.
 *
 * Never throws and never guesses: every rejection names which of the four
 * gates it failed, so a caller can say the useful thing out loud instead of
 * dropping a message in silence.
 */
export function parseDirective(raw: unknown): DirectiveParseResult {
  const envelope = CrossComponentEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return {
      ok: false,
      reason: "not_an_envelope",
      detail: envelope.error.issues.map((i) => i.path.join(".")).join(", "),
    };
  }
  if (envelope.data.kind !== "directive") {
    return {
      ok: false,
      reason: "not_a_directive",
      detail: `kind=${envelope.data.kind}`,
    };
  }
  const action = envelope.data.action as DirectiveAction;
  const schema = DIRECTIVE_PAYLOAD_SCHEMAS[action];
  if (!schema) {
    return { ok: false, reason: "unknown_action", detail: envelope.data.action };
  }
  const payload = schema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return {
      ok: false,
      reason: "bad_payload",
      detail: payload.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return {
    ok: true,
    directive: {
      action,
      payload: payload.data,
      envelope: envelope.data,
    } as Directive,
  };
}
