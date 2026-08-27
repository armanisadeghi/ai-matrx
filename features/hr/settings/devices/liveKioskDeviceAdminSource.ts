// features/hr/settings/devices/liveKioskDeviceAdminSource.ts
//
// The LIVE implementation of `KioskDeviceAdminSource`, which route 75a injects into L3's panels.
//
// 🚨 THIS IS THE INJECTION POINT L3 DESIGNED FOR, NOT A SECOND IMPLEMENTATION.
// `features/hr/time/devices/deviceAdminSource.ts` is deliberately an interface, and its header
// says why: when it was written the four administrator-side RPCs did not exist, so the panels were
// built against a contract and "the route injects an implementation". The route is L1's
// (EXECUTION §3 — settings shells are this lane's), so the implementation lives here, beside the
// page that supplies it, rather than inside the Time lane's component folder.
//
// 🚨 THAT FILE'S DEBT NOTE IS STALE, AND CHECKING BEAT BELIEVING. It records
// `hr_kiosk_device_list`, `hr_kiosk_pairing_code_create`, `hr_kiosk_device_set_trust` and
// `hr_kiosk_device_set_capture` as "DEBT, owed to the SQL lane", and R-L3 U-09 records four
// `hr.kiosk_device` pairing columns as owed DDL. Read live 2026-08-26: **all four RPCs exist**
// (authenticated-only — `anon` has EXECUTE on none of them) and **all four columns are on the
// table**. The kiosk builder landed both. Nothing here re-creates them.
//
// 🚨 A REFUSAL IS DATA. Every `public.hr_*` door answers `{ok: false, reason, detail}` rather than
// raising, because Postgres has no autonomous transactions and a door that wrote its audit row and
// then RAISED would roll the audit back with the exception. `supabase.rpc()` therefore does NOT
// throw on a refusal. The panels' contract is a promise that rejects, so each method below turns a
// refusal into a thrown `Error` carrying the server's own sentence — the ONE place in this lane
// where a refusal becomes an exception, and only because the interface it implements says so.

"use client";

import { supabase } from "@/utils/supabase/client";
import type {
  KioskDeviceAdminSource,
  KioskPairingCode,
} from "@/features/hr/time/devices/deviceAdminSource";
import type { KioskDeviceRow, KioskTrustState } from "@/features/hr/time/api/types";

/** The envelope every `public.hr_*` door returns. `ok:false` is an answer, not a fault. */
type Envelope = Record<string, unknown> & {
  ok?: boolean;
  reason?: string;
  detail?: string;
  message?: string;
  /** The kiosk family nests its refusal: `{ok:false, error:{code, message}}`. */
  error?: unknown;
};

function asEnvelope(value: unknown): Envelope {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Envelope) : {};
}

/**
 * Turn a door's answer into either its payload or a thrown Error carrying the server's sentence.
 *
 * `fallback` is what to say when the server refused without one — never a bare reason code, which
 * is not an answer to "what went wrong?".
 */
function unwrap(data: unknown, error: { message?: string } | null, fallback: string): Envelope {
  if (error) throw new Error(error.message || fallback);
  const envelope = asEnvelope(data);
  if (envelope.ok !== false) return envelope;

  // 🚨 THERE ARE TWO REFUSAL SHAPES ON THIS SURFACE, AND READING ONLY ONE THREW AWAY THE
  // SERVER'S SENTENCE. This lane's doors answer flat — `{ok:false, reason, detail}` — but the
  // kiosk family answers NESTED: `{ok:false, error:{code, message}}`. The G2 verifier caught the
  // consequence: pairing refused with `hr_kiosk_location_required` and the genuinely useful
  // sentence *"A kiosk belongs to a work location: that is what its punches are checked against
  // and what cross-location flagging compares to"*, and the dialog said **"We could not generate
  // a pairing code."** The server did its job (SPEC-ACCESS §4.2 — a denial names what was
  // missing); this function deleted it.
  const nested = asEnvelope(envelope.error);
  const sentence =
    [envelope.detail, nested.message, envelope.message].find(
      (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? null;
  const code =
    [envelope.reason, nested.code].find(
      (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? null;

  throw new Error(sentence ?? `${fallback}${code ? ` (${code})` : ""}`);
}

function str(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function num(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

/**
 * The door returns camelCase already — `hr_kiosk_device_list` builds its rows to
 * `KioskDeviceRow`'s shape on purpose, so this is a narrowing rather than a rename. Every field is
 * read defensively anyway: a wire shape that drifts should render a device with a missing label,
 * never crash a fleet table an administrator is using to revoke something.
 */
function toRow(raw: unknown): KioskDeviceRow {
  const r = asEnvelope(raw);
  return {
    id: String(r.id ?? ""),
    deviceName: str(r, "deviceName") ?? "Unnamed clock",
    locationId: str(r, "locationId"),
    locationName: str(r, "locationName"),
    trustState: (str(r, "trustState") ?? "pending") as KioskTrustState,
    lastSeenAt: str(r, "lastSeenAt"),
    lastSeenIp: str(r, "lastSeenIp"),
    clockSkewSeconds: num(r, "clockSkewSeconds", 0),
    maxClockSkewSeconds: num(r, "maxClockSkewSeconds", 300),
    requirePhoto: bool(r, "requirePhoto"),
    requireGeo: bool(r, "requireGeo"),
    pairingCodeExpiresAt: str(r, "pairingCodeExpiresAt"),
    pairingClaimedAt: str(r, "pairingClaimedAt"),
    registeredByName: str(r, "registeredByName"),
  };
}

/**
 * Bind the four live doors to one employer.
 *
 * The organization is captured here rather than passed per call, so no panel can be handed one
 * employer's device and another employer's id — in a strictly single-employer module that is the
 * compliance defect the whole context bar exists to prevent.
 */
export function liveKioskDeviceAdminSource(organizationId: string): KioskDeviceAdminSource {
  return {
    async list(): Promise<KioskDeviceRow[]> {
      const { data, error } = await supabase.rpc("hr_kiosk_device_list" as never, {
        p_organization_id: organizationId,
      } as never);
      const envelope = unwrap(data, error, "We could not load this organization's time clocks.");
      const rows = envelope.rows;
      return Array.isArray(rows) ? rows.map(toRow) : [];
    },

    async createPairingCode(input): Promise<KioskPairingCode> {
      const { data, error } = await supabase.rpc("hr_kiosk_pairing_code_create" as never, {
        p_organization_id: organizationId,
        p_device_name: input.deviceName,
        p_location_id: input.locationId,
      } as never);
      const envelope = unwrap(data, error, "We could not generate a pairing code.");
      // 🚨 The generic sentence above is the FALLBACK, never the answer when the server gave one.
      // The G2 verifier caught this file replacing a named, actionable refusal —
      // `hr_kiosk_location_required`: "A kiosk belongs to a work location: that is what its punches
      // are checked against and what cross-location flagging compares to." — with "We could not
      // generate a pairing code." `unwrap` now surfaces the server's `detail` whenever there is
      // one (see its body), which is SPEC-ACCESS §4.2's denial-names-what-was-missing rule.
      const code = str(envelope, "code");
      const deviceId = str(envelope, "deviceId");
      if (!code || !deviceId) {
        // 🚨 The code is shown ONCE and only its hash is stored — there is no re-read path by
        // design. If the door answered without one, saying so is the only honest move: a dialog
        // showing a blank code would send somebody to a tablet with nothing to type.
        throw new Error(
          "The pairing code did not come back. Nothing was paired — generate a new one.",
        );
      }
      return {
        deviceId,
        code,
        expiresAt: str(envelope, "expiresAt") ?? "",
      };
    },

    async setTrust(input): Promise<KioskDeviceRow> {
      const { data, error } = await supabase.rpc("hr_kiosk_device_set_trust" as never, {
        p_device_id: input.deviceId,
        p_trust_state: input.trustState,
        p_reason: input.reason,
      } as never);
      unwrap(data, error, "We could not change this clock's trust state.");
      // The door answers with the change, not the row. Re-read so the table shows what the
      // SERVER now holds rather than what the client hoped it would.
      const rows = await this.list();
      const row = rows.find((candidate) => candidate.id === input.deviceId);
      if (!row) throw new Error("That clock is no longer in this organization's fleet.");
      return row;
    },

    async setCapture(input): Promise<KioskDeviceRow> {
      const { data, error } = await supabase.rpc("hr_kiosk_device_set_capture" as never, {
        p_device_id: input.deviceId,
        p_require_photo: input.requirePhoto,
        p_require_geo: input.requireGeo,
      } as never);
      unwrap(data, error, "We could not change what this clock captures.");
      const rows = await this.list();
      const row = rows.find((candidate) => candidate.id === input.deviceId);
      if (!row) throw new Error("That clock is no longer in this organization's fleet.");
      return row;
    },
  };
}
