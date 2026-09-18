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

/** The `__kind` the server stamps on this column today. Never stripped, never faked. */
export const GOOGLE_CAPABILITY_HEALTH_KIND =
  "google_connection_capability_health";

/**
 * 🚨 THE COLUMN IS SHARED, SO ITS MARKER IS BECOMING PROVIDER-NEUTRAL
 * (VERIFY-U-P2-R4, V13-6). `users.integration_connections.capability_health`
 * defaults to `{"__kind":"google_connection_capability_health"}` on a table that
 * already holds Google, GitHub and Bing rows, so every non-Google row declares
 * itself a Google kind. Lane B-17 renames the server's kind to
 * `connection_capability_health` and keeps the schema declaring it; this reader
 * accepts BOTH spellings now, so that landing needs no client change and no row
 * is unreadable in either direction during the rollout.
 *
 * Accept-and-ignore, never strip: the marker that was READ is carried on the
 * parsed value (`kind`), whichever one it was (kind-marker law,
 * `common-docs/systems/content-ir-system/KINDS_EVERYWHERE_PLAN.md` §4.2a).
 */
export const CONNECTION_CAPABILITY_HEALTH_KIND = "connection_capability_health";

export const CAPABILITY_HEALTH_KINDS = [
  CONNECTION_CAPABILITY_HEALTH_KIND,
  GOOGLE_CAPABILITY_HEALTH_KIND,
] as const;

export function isCapabilityHealthKind(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (CAPABILITY_HEALTH_KINDS as readonly string[]).includes(value)
  );
}

/** One capability's last answered call. */
export interface GoogleCapabilitySuccess {
  at: string;
  /** The hub's own action vocabulary (`calendar.agenda`). Never rendered raw. */
  action: string;
}

/**
 * One capability's last CONSENT that (re-)granted its scopes. A grant is not a
 * call: the hub used to write a re-approval into `last_success`, so one
 * minute after an account-level reconnect every product on it claimed a "last
 * successful use" that never happened (aidream verifier N12). This slot keeps
 * the approval as its own fact, so `lastSuccessAt` stays the property of a real
 * provider call and a row that has never been CALLED — only granted — says so.
 */
export interface GoogleCapabilityGrant {
  /** Null when the server wrote something that is not a timestamp (N14's rule
   * applied to this slot too: an unreadable grant is not a grant). */
  at: string | null;
  action: string;
}

/** One capability's last refused call, classified by the server. */
export interface GoogleCapabilityRefusal {
  /** Null when the server wrote something that is not a timestamp (N14). */
  at: string | null;
  action: string;
  /**
   * The classified reason, or null when the deployed server sent a code this
   * build has not shipped. Null is NOT "no refusal": the sentence still stands
   * and the row still refuses (V13-4).
   */
  code: ConnectorRefusalCode | null;
  /** One sentence a non-technical person can act on. The server's words. */
  sentence: string;
  httpStatus: number | null;
}

export interface GoogleCapabilityRecord {
  lastSuccess: GoogleCapabilitySuccess | null;
  lastRefusal: GoogleCapabilityRefusal | null;
  lastGrant: GoogleCapabilityGrant | null;
}

export interface GoogleConnectionCapabilityHealth {
  /**
   * The marker AS READ, carried through — never dropped, never rewritten to the
   * one this build prefers (V13-6: the server's spelling is changing under us).
   *
   * 🚨 AND NULL WHEN THERE WAS NO MARKER TO READ (VERIFY-U-P2-R5, V17-8). An
   * unrecognised value used to come back carrying the LEGACY GOOGLE spelling,
   * because the `EMPTY` constant was written with it — so this field reported a
   * marker the data never had, in the one file whose stated law is that the
   * marker read is the marker carried. An unrecognised value now carries the
   * string it actually held, and `null` when it held no `__kind` string at all.
   * Nothing is stripped either way (kind-marker law): the value is not ours to
   * rewrite, and a claim about it is not ours to invent.
   */
  kind: string | null;
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

/**
 * The unrecognised answer, carrying the marker AS READ — the value's own
 * `__kind` string when it had one, and `null` when it did not. Never this build's
 * preferred spelling (V17-8).
 */
function unrecognized(raw: unknown): GoogleConnectionCapabilityHealth {
  const asRead =
    isJsonObject(raw) && typeof raw.__kind === "string" ? raw.__kind : null;
  return { kind: asRead, capabilities: {}, recognized: false };
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * 🚨 ONE STRICT TIMESTAMP PARSER FOR BOTH HALVES (VERIFY-U-P2-R3, N14). A
 * success was accepted with ANY non-empty `at`, and every comparison against
 * `NaN` is false — so a success recorded as `"whenever"` made every refusal,
 * however new, stop standing, and the row read "Connected" one line above "no
 * calls recorded yet". Anything that does not parse is not a timestamp.
 */
function timestampField(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = stringField(source, key);
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * A success we cannot date is NOT a success: the record is dropped, so the row
 * says "No calls recorded yet" and any refusal keeps standing.
 */
function parseSuccess(raw: unknown): GoogleCapabilitySuccess | null {
  if (!isJsonObject(raw)) return null;
  const at = timestampField(raw, "at");
  if (!at) return null;
  return { at, action: stringField(raw, "action") ?? "" };
}

/**
 * A grant we cannot date is dropped rather than shown with a fabricated date —
 * the record is still kept as "granted, no calls yet" (via `lastGrant` being
 * non-null with `at: null`) rather than treated as never having happened,
 * because the consent itself is not in doubt, only when it occurred.
 */
function parseGrant(raw: unknown): GoogleCapabilityGrant | null {
  if (!isJsonObject(raw)) return null;
  const action = stringField(raw, "action");
  if (!action) return null;
  return { at: timestampField(raw, "at"), action };
}

/**
 * 🚨 AN UNRECOGNISED CODE NEVER DISCARDS THE REFUSAL (VERIFY-U-P2-R4, V13-4).
 * This returned null whenever `isConnectorRefusalCode` said no, so a server
 * release that classifies a refusal with a code this build has not shipped made
 * the row read "Connected" and threw away the server's own sentence — written for
 * this person — on the way. The sentence and the timestamp are what a person
 * needs; the code only decides which BUTTON is owed, and "we cannot say" is a
 * lawful answer to that (`disposition: null` → the row refuses with a generic
 * remedy and no press). A refusal with no sentence is still dropped: there is
 * nothing anyone could act on.
 */
function parseRefusal(raw: unknown): GoogleCapabilityRefusal | null {
  if (!isJsonObject(raw)) return null;
  const at = stringField(raw, "at");
  const sentence = stringField(raw, "sentence");
  const code = stringField(raw, "code");
  if (!at || !sentence) return null;
  const status = raw.http_status;
  return {
    // Asymmetric on purpose (N14): an unreadable success is discarded, an
    // unreadable refusal is KEPT with no date and stands, because nothing
    // proves a call answered after it.
    at: timestampField(raw, "at"),
    action: stringField(raw, "action") ?? "",
    code: isConnectorRefusalCode(code) ? code : null,
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
  if (!isJsonObject(raw)) return unrecognized(raw);
  if (!isCapabilityHealthKind(raw.__kind)) return unrecognized(raw);
  const kind = raw.__kind as string;
  const capabilities: Record<string, GoogleCapabilityRecord> = {};
  for (const [key, value] of Object.entries(raw)) {
    // The marker is data, and it is not a capability: accept and ignore.
    if (key === "__kind") continue;
    if (!isJsonObject(value)) continue;
    const record: GoogleCapabilityRecord = {
      lastSuccess: parseSuccess(value.last_success),
      lastRefusal: parseRefusal(value.last_refusal),
      lastGrant: parseGrant(value.last_grant),
    };
    if (record.lastSuccess || record.lastRefusal || record.lastGrant) {
      capabilities[key] = record;
    }
  }
  // The marker that was on the value, not the one this build would have written.
  return { kind, capabilities, recognized: true };
}

function newer(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b);
}

/**
 * Has THIS capability's own refusal been overtaken by THIS capability's own
 * success? That question can only be answered per capability, which is why the
 * answer is folded up rather than re-derived from the product's timestamps
 * (N11). A refusal with no readable date stands: nothing proves otherwise.
 */
function refusalStandsFor(record: GoogleCapabilityRecord): boolean {
  const refusal = record.lastRefusal;
  if (!refusal) return false;
  const successAt = record.lastSuccess?.at ?? null;
  if (!successAt) return true;
  if (!refusal.at) return true;
  return Date.parse(refusal.at) > Date.parse(successAt);
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
    let standing: GoogleCapabilityRefusal | null = null;
    let grant: GoogleCapabilityGrant | null = null;
    for (const key of product.capabilityKeys) {
      const record = health.capabilities[key];
      if (!record) continue;
      if (newer(record.lastSuccess?.at ?? null, success?.at ?? null)) {
        success = record.lastSuccess;
      }
      if (newer(record.lastRefusal?.at ?? null, refusal?.at ?? null)) {
        refusal = record.lastRefusal;
      }
      // A GRANT IS NOT A CALL (N12): folded the same way as a success, but into
      // its own slot, so a product that has only ever been GRANTED — never
      // called — can say so honestly rather than borrowing the success label.
      if (
        record.lastGrant &&
        (!grant || newer(record.lastGrant.at, grant.at))
      ) {
        grant = record.lastGrant;
      }
      if (refusalStandsFor(record)) {
        // Undated refusals sort last by `newer`, so prefer whichever standing
        // refusal we can date, and otherwise keep the first one we saw.
        if (!standing || newer(record.lastRefusal?.at ?? null, standing.at)) {
          standing = record.lastRefusal;
        }
      }
    }
    if (!success && !refusal && !grant) continue;
    // A STANDING REFUSAL ON ANY CAPABILITY OWNS THE ROW (N11). Folding the
    // newest success and the newest refusal independently let a `drive_files`
    // success five minutes after a `docs` refusal render the product
    // "Connected" with no Reconnect control, while its own disclosure said
    // "Reconnect it and approve Docs." The three capabilities behind that row
    // need the SAME single scope, so no scope arithmetic can catch it.
    const shown = standing ?? refusal;
    activity[product.key] = {
      lastSuccessAt: success?.at ?? null,
      lastGrantAt: grant?.at ?? null,
      lastRefusal: shown
        ? {
            message: shown.sentence,
            at: shown.at,
            code: shown.code,
            httpStatus: shown.httpStatus,
          }
        : null,
      refusalStands: Boolean(standing),
    };
  }
  return activity;
}
