/**
 * How long a client waits for the server to START answering a run — per output
 * kind, as an organization knob.
 *
 * 🚨 THE DEFECT (2026-09-22). Pressing Run in the agent builder on an image
 * agent ("Product Photo Studio", Gemini 3.1 Flash Image) died on the client with
 * "Connection timed out after 15000ms". The builder's manual path was the only
 * agent stream path carrying a fixed 15-second `connectTimeoutMs`, and that
 * timer does not measure a TCP connect: aidream's prepared-streaming routes
 * (`create_prepared_streaming_response`) finish request PREPARATION — auth, the
 * request lane, conversation create, resolving attached files — BEFORE the
 * response headers go out. A busy server or a draining deploy pushed prep past
 * 15 s, the client aborted, and aborting before the headers dropped the server
 * run with it (conversation created, no messages).
 *
 * THE RULE. A generation is a job, not a request with a stopwatch:
 *   - Once the stream is open there is NO wall-clock cap — the server heartbeat
 *     (every 5 s) keeps the watchdog fed and the run ends on the stream's own
 *     `end` event.
 *   - The one cap that remains — "the server never started answering" — is an
 *     organization knob per output kind (`agents.run_wait.<kind>_seconds`),
 *     with generous agent-set defaults registered in the knob table, never a
 *     constant here.
 *   - When that cap is actually hit, the person is told the truth: which model,
 *     how long we waited, and that the server may still be working — with a
 *     door to the conversation, because the run can finish without us.
 *
 * If the knob snapshot cannot be read the wait falls back to the stream
 * lifetime backstop (announced loudly), never to a number nobody chose.
 */

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

/** What a run produces. Anything but text is a job (seconds to minutes). */
export type RunOutputKind = "text" | "image" | "video" | "audio";

export const RUN_WAIT_KNOB_FEATURE = "agents.run_wait";

/**
 * Stream lifetime backstop — the same 24 hours the agent run path
 * (`runAiStream`) has always used. It is the ceiling for a stream that keeps
 * heartbeating forever, not a wait anyone tunes; the heartbeat watchdog is the
 * real liveness check. Also the first-response wait when the knob cannot be
 * read (setTimeout's own ceiling is ~24.8 days, so this stays safe).
 */
export const RUN_STREAM_LIFETIME_BACKSTOP_MS = 24 * 60 * 60 * 1000;

export function isJobOutputKind(kind: RunOutputKind): boolean {
  return kind !== "text";
}

/**
 * The output kind from a model's declared output modalities (the parsed
 * `capabilities.output` list). Video outranks image outranks audio: a model
 * that can emit several is waited on as its slowest.
 */
export function runOutputKindFromModalities(
  output: readonly string[] | null | undefined,
): RunOutputKind {
  const set = new Set((output ?? []).map((m) => m.toLowerCase()));
  if (set.has("video")) return "video";
  if (set.has("image")) return "image";
  if (set.has("audio")) return "audio";
  return "text";
}

export function runWaitKnobKey(kind: RunOutputKind): string {
  return `${kind}_seconds`;
}

export interface RunWait {
  /** Milliseconds the client waits for the stream to open. */
  firstResponseMs: number;
  /** Seconds as configured, or null when the knob could not be read. */
  seconds: number | null;
  kind: RunOutputKind;
}

/**
 * Resolve the first-response wait for one run from the organization's knob.
 * Never throws — a run is never refused because a setting could not load; the
 * failure is announced and the wait becomes the lifetime backstop.
 */
export async function resolveRunWait(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  kind: RunOutputKind,
): Promise<RunWait> {
  const key = runWaitKnobKey(kind);
  if (!organizationId) {
    // The organization-less guest lane has no organization setting to read.
    // It waits on the lifetime backstop — no invented first-response limit.
    return { firstResponseMs: RUN_STREAM_LIFETIME_BACKSTOP_MS, seconds: null, kind };
  }
  try {
    const raw = await ensureEffectiveKnob(organizationId, userId ?? null, {
      feature: RUN_WAIT_KNOB_FEATURE,
      key,
    });
    const seconds = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error(`it resolves to ${JSON.stringify(raw)}, not a number of seconds`);
    }
    return { firstResponseMs: Math.round(seconds * 1000), seconds, kind };
  } catch (error) {
    console.error(
      `[run-wait] The "${RUN_WAIT_KNOB_FEATURE}.${key}" setting could not be read — ` +
        `${error instanceof Error ? error.message : String(error)}. This run waits ` +
        "for the server without a first-response limit (the 24-hour stream backstop) " +
        "instead of inventing one. Remedy: seed the knob (matrx-frontend " +
        "migrations/agents_run_wait_knobs.sql) or fix the knob snapshot read.",
    );
    return {
      firstResponseMs: RUN_STREAM_LIFETIME_BACKSTOP_MS,
      seconds: null,
      kind,
    };
  }
}

/** "45 seconds", "5 minutes", "1 minute 30 seconds". */
export function describeSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes === 0) return part(rest, "second");
  if (rest === 0) return part(minutes, "minute");
  return `${part(minutes, "minute")} ${part(rest, "second")}`;
}

const KIND_NOUN: Record<RunOutputKind, string> = {
  text: "a reply",
  image: "an image",
  video: "a video",
  audio: "audio",
};

/** "Generating an image with Gemini 3.1 Flash Image" — the job's working line. */
export function runJobLabel(kind: RunOutputKind, modelLabel: string | null): string {
  const what =
    kind === "text" ? "Writing a reply" : `Generating ${KIND_NOUN[kind]}`;
  return modelLabel ? `${what} with ${modelLabel}` : what;
}

/**
 * The honest sentence for a first-response timeout. The server may still
 * finish the run, so the sentence says so and the caller attaches a door to
 * the conversation.
 */
export function runWaitTimeoutMessage(
  kind: RunOutputKind,
  modelLabel: string | null,
  seconds: number | null,
): string {
  const waited =
    seconds != null ? `within ${describeSeconds(seconds)}` : "in time";
  const who = modelLabel ? ` (${modelLabel})` : "";
  return (
    `The server did not start ${kind === "text" ? "answering" : `generating ${KIND_NOUN[kind]}`}` +
    `${who} ${waited}, so this page stopped waiting. The run may still finish on ` +
    "the server — open the conversation to check before running it again. " +
    "An organization admin can lengthen this wait in the organization's configuration settings."
  );
}
