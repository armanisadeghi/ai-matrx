// features/connectors/google-capability-health.ts
//
// GOOGLE'S PER-CAPABILITY CALL RECORD, READ FROM THE CONNECTION ROW.
//
// Part of the Google adapter (the only part of the connector primitive allowed
// to name Google — see `google-adapter.ts`, which is this file's only consumer).
// It turns the `users.integration_connections.capability_health` jsonb column
// into the provider-agnostic `ConnectorActivityByProduct` map `health.ts`
// already accepts, so no component learns a capability key or a Google shape.
//
// THE SERVER SIDE OF IT. Every Google provider call the platform makes runs
// inside one recording seam — `aidream/aidream/services/google_integrations/
// call_health.py` — which writes, per capability key, the last call Google
// ANSWERED and the last call Google REFUSED (with a classified code, a
// person-facing sentence and the HTTP status). The column is
// `jsonb NOT NULL DEFAULT '{"__kind":"google_connection_capability_health"}'`.
//
// 🚨 THE MARKER STAYS IN THE DATA. `__kind` is part of the value, not noise to
// strip: this reader ACCEPTS-AND-IGNORES it as a capability key and carries it
// on the parsed value (`kind`), per the kind-marker law
// (`common-docs/systems/content-ir-system/KINDS_EVERYWHERE_PLAN.md` §4.2a).
//
// 🚨 WHAT AN ABSENT FACT MEANS. Absent is "nothing recorded", never "it
// worked" and never "it failed". A connection whose column is still the bare
// default — which every one of the eleven live Google connections was on
// 2026-09-17, because the recording server had not yet deployed — produces an
// EMPTY activity map, and the health row says "No calls recorded yet" in its
// own words rather than showing a green line it cannot support (law 4).

import { isJsonObject } from "@/types/json";
import type { ConnectorProviderConfig } from "./provider-config";
import {
  isConnectorRefusalCode,
  type ConnectorActivityByProduct,
  type ConnectorProductActivity,
  type ConnectorRefusalCode,
} from "./health";

/** The `__kind` the server stamps on this column. Never stripped, never faked. */
export const GOOGLE_CAPABILITY_HEALTH_KIND =
  "google_connection_capability_health";

/** One capability's last answered call. */
export interface GoogleCapabilitySuccess {
  at: string;
  /** The hub's own action vocabulary (`calendar.agenda`). Never rendered raw. */
  action: string;
}

/** One capability's last refused call, classified by the server. */
export interface GoogleCapabilityRefusal {
  at: string;
  action: string;
  code: ConnectorRefusalCode;
  /** One sentence a non-technical person can act on. The server's words. */
  sentence: string;
  httpStatus: number | null;
}

export interface GoogleCapabilityRecord {
  lastSuccess: GoogleCapabilitySuccess | null;
  lastRefusal: GoogleCapabilityRefusal | null;
}

export interface GoogleConnectionCapabilityHealth {
  /** The marker, carried through — never dropped from the parsed value. */
  kind: string;
  /** Keyed by SERVER capability key (`drive_files`, `youtube_analytics`). */
  capabilities: Record<string, GoogleCapabilityRecord>;
  /**
   * False when the stored value is not the shape this reader knows — a column
   * that lost its marker, or a provider row that never had one. The activity
   * map is then empty and the rows say nothing was recorded, which is the only
   * honest reading of a value we cannot vouch for.
   */
  recognized: boolean;
}

const EMPTY: GoogleConnectionCapabilityHealth = {
  kind: GOOGLE_CAPABILITY_HEALTH_KIND,
  capabilities: {},
  recognized: false,
};

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseSuccess(raw: unknown): GoogleCapabilitySuccess | null {
  if (!isJsonObject(raw)) return null;
  const at = stringField(raw, "at");
  if (!at) return null;
  return { at, action: stringField(raw, "action") ?? "" };
}

function parseRefusal(raw: unknown): GoogleCapabilityRefusal | null {
  if (!isJsonObject(raw)) return null;
  const at = stringField(raw, "at");
  const sentence = stringField(raw, "sentence");
  const code = stringField(raw, "code");
  // A refusal with no sentence is a refusal nobody can act on, and a code this
  // client does not know is a server that moved ahead of it. Either way the row
  // says "nothing recorded" rather than rendering half a fact.
  if (!at || !sentence || !isConnectorRefusalCode(code)) return null;
  const status = raw.http_status;
  return {
    at,
    action: stringField(raw, "action") ?? "",
    code,
    sentence,
    httpStatus: typeof status === "number" ? status : null,
  };
}

/**
 * Read the stored column. `capability_health` arrives as an unknown jsonb value
 * — narrowed here, never cast (the `type-safety` skill, Pattern 4).
 */
export function parseGoogleCapabilityHealth(
  raw: unknown,
): GoogleConnectionCapabilityHealth {
  if (!isJsonObject(raw)) return EMPTY;
  if (raw.__kind !== GOOGLE_CAPABILITY_HEALTH_KIND) return EMPTY;
  const capabilities: Record<string, GoogleCapabilityRecord> = {};
  for (const [key, value] of Object.entries(raw)) {
    // The marker is data, and it is not a capability: accept and ignore.
    if (key === "__kind") continue;
    if (!isJsonObject(value)) continue;
    const record: GoogleCapabilityRecord = {
      lastSuccess: parseSuccess(value.last_success),
      lastRefusal: parseRefusal(value.last_refusal),
    };
    if (record.lastSuccess || record.lastRefusal) capabilities[key] = record;
  }
  return { kind: GOOGLE_CAPABILITY_HEALTH_KIND, capabilities, recognized: true };
}

function newer(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b);
}

/**
 * Fold the per-CAPABILITY record into the per-PRODUCT activity map the health
 * rows take. A product may cover several capabilities (Workspace files covers
 * `drive_files`, `docs` and `sheets`; YouTube covers `youtube` and
 * `youtube_analytics`), so the row shows the MOST RECENT success and the MOST
 * RECENT refusal across the capabilities behind it — the row is about the
 * product the person sees, and the keys never reach them (D6).
 */
export function googleActivityByProduct(
  provider: ConnectorProviderConfig,
  health: GoogleConnectionCapabilityHealth,
): ConnectorActivityByProduct {
  const activity: Record<string, ConnectorProductActivity> = {};
  for (const product of provider.products) {
    let success: GoogleCapabilitySuccess | null = null;
    let refusal: GoogleCapabilityRefusal | null = null;
    for (const key of product.capabilityKeys) {
      const record = health.capabilities[key];
      if (!record) continue;
      if (newer(record.lastSuccess?.at ?? null, success?.at ?? null)) {
        success = record.lastSuccess;
      }
      if (newer(record.lastRefusal?.at ?? null, refusal?.at ?? null)) {
        refusal = record.lastRefusal;
      }
    }
    if (!success && !refusal) continue;
    activity[product.key] = {
      lastSuccessAt: success?.at ?? null,
      lastRefusal: refusal
        ? {
            message: refusal.sentence,
            at: refusal.at,
            code: refusal.code,
            httpStatus: refusal.httpStatus,
          }
        : null,
    };
  }
  return activity;
}
