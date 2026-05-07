/**
 * features/file-handler/intelligence/telemetry.ts
 *
 * Persist handler events to `public.file_handler_events` (Supabase). The
 * user's directive: telemetry goes to the database — no Sentry, no third
 * parties, no extra services.
 *
 * Writes are best-effort (RLS-restricted to the authenticated user's own
 * rows) and never block the calling code path. A queued-and-batched
 * approach would be over-engineering for the volume — one row per event,
 * fire-and-forget.
 *
 * MIGRATION REQUIRED before telemetry is live in prod: see the
 * `file_handler_events` migration in `migrations/`. Until that lands,
 * this module logs to the console at `debug` level.
 */

import { createClient } from "@/utils/supabase/client";
import type { TelemetryPayload } from "../types";

const TABLE = "file_handler_events";

let migrationConfirmed: boolean | null = null;

async function tableExists(): Promise<boolean> {
  if (migrationConfirmed !== null) return migrationConfirmed;
  try {
    // Bypass typing — `file_handler_events` is not in the generated
    // Database type until the migration lands.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    const { error } = await supabase
      .from(TABLE)
      .select("event_id", { count: "exact", head: true })
      .limit(1);
    migrationConfirmed = !error || error.code !== "42P01";
  } catch {
    migrationConfirmed = false;
  }
  return migrationConfirmed;
}

export function recordTelemetry(payload: TelemetryPayload): void {
  void writeTelemetry(payload);
}

async function writeTelemetry(payload: TelemetryPayload): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const supabase = createClient();
    const ok = await tableExists();
    if (!ok) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[file-handler]", payload.event, payload);
      }
      return;
    }
    const authClient = supabase.auth as unknown as {
      getUser: () => Promise<{ data: { user: { id: string } | null } }>;
    };
    const { data: auth } = await authClient.getUser();
    // The file_handler_events table is not in the generated Database type
    // until the migration lands — bypass typing on this single insert.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any;
    await untyped.from(TABLE).insert({
      event: payload.event,
      file_id: payload.fileId ?? null,
      origin: payload.origin ?? null,
      mime: payload.mime ?? null,
      duration_ms: payload.durationMs ?? null,
      error_message: payload.error ?? null,
      meta: payload.meta ?? {},
      user_id: auth?.user?.id ?? null,
    });
  } catch {
    // Telemetry must never break the caller's flow.
  }
}
