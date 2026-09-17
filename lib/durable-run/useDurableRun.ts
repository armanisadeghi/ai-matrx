"use client";

/**
 * useDurableRun — the ONE client half of a server-owned, rejoinable run.
 *
 * ## The defect it closes
 *
 * THE FLOATING LAW has two halves; a surface that only narrates stages has the
 * first. The run itself was held in an in-tab `await`: navigate away or reload
 * and the user was left with nothing, even though the work kept going. "A run
 * that dies on page refresh is the same defect as a spinner"
 * (`features/window-panels/FEATURE.md`).
 *
 * ## Why there is no client-side durability here
 *
 * There isn't any, and there must never be. The durable half lives SERVER-side,
 * in a domain ledger, and every domain that has one follows the identical shape:
 *
 *   durable row claimed at LAUNCH → the id announced as the FIRST stream event
 *     → heartbeat → terminal status/error/result persisted
 *     → rejoin by id: replay the live channel, or read the durable row.
 *
 * The ONLY thing that belongs in the browser is the run id — a receipt number
 * for a server-owned run, not the run's state. This hook stores that, rejoins on
 * load, and settles from SERVER truth, never from a guess.
 *
 * ## Who consumes it
 *
 * - `features/marketing/seo/durable-run/useSeoCommandRun.ts` — SEO commands over
 *   `seo.collection_run` (`seo.*` wire kinds). Four public tools + the page
 *   analyzer.
 * - `features/masterwork/durable-run/useMasterworkRun.ts` — build / ingest /
 *   ingest-file / audition over `platform.masterwork_run`.
 *
 * A third domain adds a `DurableRunWire` here and a thin face beside its
 * feature. It never forks this file — that would be the second durability
 * mechanism this whole design exists to prevent
 * (`docs/reuse-first.md`).
 *
 * ## Live output — the other half of THE FLOATING LAW
 *
 * Stage lines are what the law PERMITS when there is nothing to show. When the
 * run's MODEL OUTPUT is the point, pass `live` and the hook ADOPTS the stream
 * (`adoptForeignStream`) into the canonical pipeline and floats it in
 * `LiveRunWindow`. The surface parses nothing and renders nothing itself —
 * `features/content-ir/FEATURE.md` § No bespoke stream renderers.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDurationMs } from "@ai-matrx/kit/format";

import { ELAPSED_TICK_MS, formatElapsed } from "@/lib/progress/elapsed";

import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import type { ForeignStreamConsumer } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { useFloatingLiveRun } from "@/features/overlays/openers/liveRunWindow";
import type { LiveRunProgressItem } from "@/features/agents/components/live-run/LiveRunProgress";
import { callApi } from "@/lib/api/call-api";
import type { ApiCallError } from "@/lib/api/call-api";
import { isStreamTransportLost } from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { AppDispatch } from "@/lib/redux/store";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { paths } from "@/types/python-generated/api-types";

/**
 * A pointer older than this is not worth rejoining: every durable run holds a
 * ~5-minute lease it renews every 60s, so an hour-old "running" run is over one
 * way or another and the durable snapshot is the answer. Beyond that we stop
 * asking — a stale receipt should not make a fresh page load do work.
 */
const POINTER_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * 🚨 A LOST STREAM IS NEVER A FAILED RUN.
 *
 * Every durable run streams with `detach_on_disconnect=True`: killing the
 * socket stops DELIVERY, never the work. And the live replay channel
 * (`aidream/services/durable_runs.py`) is per-PROCESS, while the API runs many
 * worker processes — so a rejoin routed to any worker but the one executing the
 * run finds no channel and answers with the durable ROW, which mid-run says
 * `processing`.
 *
 * Both of those used to print a failure here. On 2026-09-12 03:10 a Rulebook
 * ingest (run 4587e534-316c-4db1-af3a-02241f7b551f) lost its socket at exactly
 * +60s, rejoined at 03:11:47, got a `processing` snapshot, and told the person
 * "This run stopped before it finished — nothing was saved. You can start it
 * again." The row went `completed` at 03:15:15 with 115 rules and `error` NULL;
 * the person, believing it dead, paid for a second full distillation.
 *
 * So: the only thing that may produce a failure sentence is the ROW's own
 * terminal status. Everything else reconnects.
 */
export const STREAM_LOST_MESSAGE =
  "Lost the live view — the run is still going on the server. Reconnecting…";

/**
 * What a stopped run says when the server sent no sentence of its own. It names
 * the one thing a person wonders after stopping something mid-way: whether what
 * had already landed survived.
 */
export const STOPPED_MESSAGE =
  "Stopped. Anything that already landed before you stopped it is saved.";

/**
 * 🚨 A DEPLOY IS NOT A LOSS — SAY SO, DON'T JUST SURVIVE IT.
 *
 * The aidream deploy train replaces the ECS task under a run every ~20-30
 * minutes. Before the 2026-09-12 recovery sweep that orphaned the run; now the
 * row is re-queued from its checkpoint and the person never loses work — but
 * silently reconnecting through `STREAM_LOST_MESSAGE` ("Reconnecting…") reads
 * as generic network trouble, not as the specific, reassuring fact that the
 * server itself restarted and nothing already paid for is being repeated.
 * This is that fact, told plainly, both while it is still happening (the live
 * `masterwork_run_draining` event) and after a reload lands on a snapshot
 * whose `metadata._drain` / `metadata._recovery` says the same thing.
 */
export const RESUMING_AFTER_RESTART_MESSAGE = "Resuming after a server restart";
export const RESUMING_AFTER_RESTART_DETAIL =
  "Nothing you've already paid for is repeated.";

/** First reconnect wait; doubles per attempt up to the cap. */
const RECONNECT_BASE_DELAY_MS = 1_500;
const RECONNECT_MAX_DELAY_MS = 15_000;
/**
 * Safety net only. A row whose heartbeat stops is flipped to `failed` by the
 * server after a 5-minute lease, so the loop normally ends on server truth —
 * this is what stops an abandoned tab asking forever.
 */
const RECONNECT_GIVE_UP_MS = 15 * 60 * 1000;
/** Consecutive rejoins that could not even reach the run before we give up. */
const RECONNECT_MAX_UNREACHABLE = 5;
/**
 * How many times a rejoin may come back SUCCESSFUL BUT NOT LIVE before this
 * loop stops claiming it is reconnecting. Five at 1.5s→15s backoff is about a
 * minute of honest trying — long enough to ride out a worker restart, short
 * enough that nobody watches a lie for five minutes.
 */
const RECONNECT_MAX_NOT_LIVE = 5;

/**
 * 🚨 A WORKING SCREEN MAY NEVER KEEP A PROMISE IT HAS ALREADY BROKEN.
 *
 * Every long ingest dialog printed one static sentence — "Working — this takes
 * a minute." — for as long as the run took, with no clock behind it. On
 * 2026-09-12 19:54Z a body-of-work ingest of ONE live URL
 * (`paulgraham.com/simply.html`, corpus item 1a5fd47d) ran for **2m57s** and
 * SUCCEEDED with 13 rules at 19:57:06. The person watching gave up at ~90s and
 * filed it as a hang, because after the first minute the screen said exactly
 * what it had said at second one. Nothing was broken; the copy was.
 *
 * So past `expectedMs * OVERDUE_FACTOR` the sentence stops promising and starts
 * REPORTING — and what it reports is the state we actually hold: a live stream
 * means the job is running on the server, a reconnect loop means we are still
 * asking. The hook never guesses, and it never invents a failure: that remains
 * the row's job alone (see STREAM_LOST_MESSAGE).
 */
const OVERDUE_FACTOR = 3;
/**
 * A caller that states no expectation still may not promise forever. One minute
 * is what every one of these dialogs already told the user out loud.
 */
// KNOB MIRROR of platform.feature_knob "durable_run" "default_expected_ms" — an exported render-path default.
// Change the row, then re-mirror this literal; the value has no sync read path.
export const DEFAULT_EXPECTED_MS = 60_000;

/**
 * "about 3 minutes" — what the screen is allowed to promise, derived from what
 * the runs of this kind ACTUALLY take. No surface writes this sentence itself
 * any more: "Working — this takes a minute." was hardcoded into six dialogs
 * while the live medians (`platform.masterwork_run`, 2026-09-12) were 157s for
 * a source ingest, 156s for a body-of-work ingest and 83s for a dump. The copy
 * was the defect, not the runtime.
 */
export function describeExpected(ms: number): string {
  if (ms < 45_000) return "under a minute";
  if (ms < 90_000) return "about a minute";
  // THE PROSE VOICE, ROUNDED TO NEAREST (kit 0.13.4). This string lands inside
  // a sentence a person reads, so "about 3 min" — `coarse`, a clipped unit —
  // was the wrong register; and `long`'s default floor turns a 157-second
  // median into "about 2 minutes", the too-small promise this whole function
  // exists to stop. An estimate rounds to nearest; elapsed time and countdowns
  // (`formatElapsed` below) keep the floor.
  return `about ${formatDurationMs(ms, { style: "long", round: "nearest" })}`;
}

/**
 * "2m 57s" / "48s" — the honest clock a stuck-looking screen owes the reader.
 *
 * It lives in `lib/progress/elapsed.ts` with the tick it moves on, so a durable
 * run and a plain in-tab await (the Triad's deal) format and advance the same
 * clock. Re-exported here because every consumer of this hook already imports
 * from it.
 */
export { formatElapsed } from "@/lib/progress/elapsed";

/** Durable-row statuses that mean the work is still in flight. */
const IN_FLIGHT_STATUSES = new Set([
  "pending",
  "queued",
  "processing",
  "running",
  "started",
  "in_progress",
]);

/** Durable-row statuses that mean the run is over WITHOUT a result. */
const FAILED_STATUSES = new Set([
  "failed",
  "abandoned",
  "timed_out",
  "expired",
  "error",
]);

/**
 * 🚨 A STOP IS NOT A FAILURE.
 *
 * `cancelled` used to sit in the set above, so a run somebody deliberately
 * stopped came back as a red error sentence with a "Try it again" under it —
 * the screen telling a person something went wrong when what actually happened
 * is that they changed their mind. These statuses settle to `stopped`: no
 * alarm, no retry pressure, and the server's own sentence about what was kept.
 */
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * How one domain's runs speak on the wire. Everything domain-specific about a
 * durable run is here; the hook below is the same for all of them.
 */
export interface DurableRunWire {
  /** localStorage namespace, e.g. `matrx.seo-command-run.` (keep it stable — it
   *  is what an in-flight run is found by after a deploy). */
  pointerPrefix: string;
  /** Which field on a data event carries the discriminator. aidream's SEO
   *  commands use `kind`; the typed `DataPayload` families use `type`. */
  discriminator: "kind" | "type";
  /** The event announcing the durable row's id. */
  runStartedEvent: string;
  /** The one-shot durable snapshot a rejoin gets when the run is over. */
  snapshotEvent: string;
  /** The event announcing a live run's failure. */
  failedEvent: string;
  /**
   * Optional: the event a run releases on the LIVE stream the instant a
   * deploy is about to tear down the process under it (aidream's
   * `masterwork_run_draining`). Present only for domains whose runs survive
   * a deploy via checkpoint/resume — absent means this domain has no such
   * recovery and the hook never invents one.
   */
  drainingEvent?: string;
  /** Optional: "this identity is already running elsewhere" (SEO reuses runs). */
  inProgressEvent?: string;
  /** The rejoin endpoint. Takes `run_id` as its only path param. */
  rejoinPath: keyof paths;
  /**
   * The CANCEL endpoint, `run_id` as its only path param. Present = this
   * domain's runs can really be stopped, and `cancel` below is non-null while
   * one is in flight. Absent = the surface must not show a Stop control at all;
   * a button that looks like a stop and only closes a dialog is the lying-screen
   * defect this field exists to make impossible to ship by accident.
   */
  cancelPath?: keyof paths;
  /** The event a LIVE run emits when somebody stops it. */
  cancelledEvent?: string;
  /** The ledger name, for error reporting. */
  relation: string;
  /**
   * Where the result document sits on a terminal event. Defaults to
   * `data.result`, which is what a snapshot always carries. A domain whose LIVE
   * terminal event IS the result (the typed `DataPayload` families) overrides
   * this and reads `source: "final"` — the two differ, and conflating them is
   * how a rejoined run renders an empty answer.
   */
  resultOf?: (
    data: Record<string, unknown>,
    source: "final" | "snapshot",
  ) => unknown;
  /** Human sentence for a snapshot whose status is neither completed nor
   *  a recorded failure. */
  unfinishedMessage?: string;
}

export type DurableRunStatus =
  | "idle"
  /** Rejoining a run this tab did not start (or started before a reload). */
  | "rejoining"
  | "running"
  | "done"
  /** A person stopped it. Terminal, and deliberately NOT `error`. */
  | "stopped"
  | "error";

/**
 * The server restarted under this run and it is picking back up. Distinct
 * from `stage`/`waitMessage`: it is a FACT about what happened to the
 * process, not a narration of what the run is doing, and it must read
 * identically whether it arrived live (mid-stream) or was reconstructed from
 * a rejoin snapshot after a reload — so both paths always produce this exact
 * shape, never a paraphrase of the server's own wording.
 */
export interface RunInterruption {
  /** Always exactly `RESUMING_AFTER_RESTART_MESSAGE`. */
  message: string;
  /** Always exactly `RESUMING_AFTER_RESTART_DETAIL`. */
  detail: string;
}

export interface DurableRunState<TResult> {
  status: DurableRunStatus;
  /** The latest human stage line — real server stages, never invented ones. */
  stage: string | null;
  /** Every stage line so far, for surfaces that show a running log. */
  stages: string[];
  result: TResult | null;
  error: string | null;
  /**
   * What the server said about a run a person stopped. Non-null only in
   * `stopped`. It is separate from `error` on purpose: a surface that showed
   * this through the failure channel would be telling somebody their own
   * decision went wrong.
   */
  stoppedMessage: string | null;
  runId: string | null;
  /** What the rejoined run was working on, for "still reading <file>" copy. */
  rejoinedTarget: string | null;
  /**
   * Non-null exactly when the server itself restarted under this run — a live
   * `drainingEvent`, or a rejoin snapshot whose `metadata._drain`/`_recovery`
   * says so. Never cleared back to null while the SAME run keeps going, so it
   * stays true through the reconnect that usually follows a drain; a fresh
   * `launch()` or `reset()` clears it like every other field.
   */
  interruption: RunInterruption | null;
  /**
   * The adopted stream's canonical request id — only with `live`. Everything
   * the model writes is read off this through the canonical selectors; a
   * surface never touches the text itself. Populated whether the run floats
   * or the surface owns its display (`live.surfaceOwnsDisplay`).
   */
  requestId: string | null;
  /**
   * WHAT THE RUN WAS LAUNCHED WITH that the answer cannot rebuild.
   *
   * A durable run restores its ANSWER on a reload — but a surface whose next
   * request needs the ORIGINAL input had nothing to restore it from, because
   * that input lives in mount-local `useState` the reload threw away. The Bad
   * Example Probe is the proven case: its rounds came back from the durable
   * row while the case brief they were about came back empty, so the button
   * that sends the next round could not build a request at all and the
   * Expert's typing vanished (cold walk 3, 2026-09-16).
   *
   * So a launch may hand over the few strings the NEXT request will need
   * (`launch(body, target, { memo })`); they ride on the run's own receipt and
   * come back here on a rejoin or a settled restore. Small and string-only on
   * purpose — it is a memo, not a second copy of the request.
   */
  memo: Record<string, string> | null;
}

interface RunPointer {
  runId: string;
  startedAt: number;
  target: string | null;
  /** Exact request tenancy used by this launch. A rejoin is the same run. */
  scopeOverrides?: Record<string, string>;
  /**
   * The launch's memo — the few input strings the NEXT request needs and the
   * answer cannot rebuild. See `DurableRunState.memo`.
   */
  memo?: Record<string, string>;
  /**
   * The run reached a good terminal state here. The pointer is KEPT so a
   * reload re-reads the finished result off the durable row — losing an answer
   * to a refresh is the same defect as losing the run. Only a fresh launch, a
   * failure, or age retires a pointer.
   */
  settled?: boolean;
  /**
   * When the live view was FIRST lost for this run, in epoch ms.
   *
   * The give-up clock used to be a local in each `startReconnect` call, so a
   * page reload reset it to zero and the loop could never age out — which is
   * exactly what "Reconnecting… forever, even after a reload" was. Carried on
   * the pointer, the ceiling is real wall-clock time.
   */
  lostLiveViewAt?: number;
  /**
   * 🚨 THE PERSON CLOSED THE SURFACE THAT WAS FOLLOWING THIS RUN, and does not
   * want it dragged back open (cold walk 7, finding 3, 2026-09-17).
   *
   * Every durable-run dialog carries an auto-reopen latch so a live run
   * started elsewhere surfaces instead of hiding behind an armed Start button.
   * The "I closed it" half of that lived in a `useRef` at the call site —
   * per MOUNT. `/masterwork/[id]` is one component instance across client-side
   * navigation, and a plain later visit is a fresh mount either way, so the
   * dismissal was forgotten every time while the RECEIPT survived in
   * localStorage for an hour. The walk closed a completed Shadow-the-inbox
   * sitting and had it reopen on top of the Rulebook page three separate
   * times on later, unrelated visits with no query param — once claiming a
   * finished run was "still going on the server. Reconnecting…" — each time
   * blocking a real control underneath it.
   *
   * A dismissal is a fact about the RUN, so it lives on the run's receipt
   * beside every other fact about it. The next run still surfaces: a fresh
   * launch writes a fresh pointer with no dismissal on it.
   */
  dismissed?: boolean;
}

function pointerKey(wire: DurableRunWire, key: string): string {
  return `${wire.pointerPrefix}${key}`;
}

function readPointer(wire: DurableRunWire, key: string): RunPointer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(pointerKey(wire, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunPointer>;
    if (typeof parsed.runId !== "string" || !parsed.runId) return null;
    const startedAt =
      typeof parsed.startedAt === "number" ? parsed.startedAt : 0;
    if (!startedAt || Date.now() - startedAt > POINTER_MAX_AGE_MS) {
      window.localStorage.removeItem(pointerKey(wire, key));
      return null;
    }
    const stringMap = (raw: unknown): Record<string, string> | undefined =>
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Object.values(raw as Record<string, unknown>).every(
        (value) => typeof value === "string",
      )
        ? (raw as Record<string, string>)
        : undefined;
    const scopeOverrides = stringMap(parsed.scopeOverrides);
    const memo = stringMap(parsed.memo);
    return {
      runId: parsed.runId,
      startedAt,
      target: typeof parsed.target === "string" ? parsed.target : null,
      settled: parsed.settled === true,
      dismissed: parsed.dismissed === true,
      ...(typeof parsed.lostLiveViewAt === "number"
        ? { lostLiveViewAt: parsed.lostLiveViewAt }
        : {}),
      ...(scopeOverrides ? { scopeOverrides } : {}),
      ...(memo ? { memo } : {}),
    };
  } catch {
    // A corrupt pointer must never break the tool it belongs to.
    return null;
  }
}

/**
 * Is there a run worth rejoining under this key — WITHOUT mounting the hook?
 *
 * A surface that owns several keys (the Masterwork "add rules from a source"
 * dialog owns `ingest` and `timeline`) has to know which one is alive BEFORE it
 * decides which one to mount, or it watches the wrong pointer and hides a live
 * run. `settled: true` is a FINISHED run whose answer the hook re-reads when
 * the user comes back to that lane; it is not a reason to drag the page
 * somewhere by itself, so it is reported as `live: false`.
 *
 * Reads (and prunes) exactly what the hook reads — never a second pointer
 * format. Returns null on the server, where there is no storage.
 */
export function peekDurableRun(
  wire: DurableRunWire,
  key: string,
): {
  runId: string;
  startedAt: number;
  live: boolean;
  /** The person already closed the surface following this run. */
  dismissed: boolean;
} | null {
  const pointer = readPointer(wire, key);
  if (!pointer) return null;
  return {
    runId: pointer.runId,
    startedAt: pointer.startedAt,
    live: pointer.settled !== true,
    dismissed: pointer.dismissed === true,
  };
}

function writePointer(
  wire: DurableRunWire,
  key: string,
  pointer: RunPointer,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pointerKey(wire, key), JSON.stringify(pointer));
  } catch {
    /* private mode / quota — the run still works, it just cannot be rejoined */
  }
}

function clearPointer(wire: DurableRunWire, key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(pointerKey(wire, key));
  } catch {
    /* nothing to do */
  }
}

function eventRecord(event: TypedStreamEvent): Record<string, unknown> | null {
  if (event.event !== "data") return null;
  const data = event.data as unknown;
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

/**
 * The specific thing that went wrong, when the server named one.
 *
 * aidream pipelines put it in `details` — the judge's exception, the model that
 * could not be resolved. It is the difference between "this did not finish" and
 * a sentence the reader can act on, so it rides alongside the headline instead
 * of being dropped (W37, 2026-09-12). A reason already contained in the
 * headline is not repeated.
 */
export function durableRunErrorDetail(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const details = (raw as Record<string, unknown>).details;
  if (!details || typeof details !== "object") return null;
  for (const field of ["reason", "message", "error"]) {
    const value = (details as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** aidream persists a structured error document; show its sentence. */
export function durableRunErrorMessage(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw;
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const field of ["user_message", "message"]) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) {
        return withDetail(
          withRemedy(value, record.remedy),
          durableRunErrorDetail(raw),
        );
      }
    }
  }
  return null;
}

/** One sentence, then the server's own reason — never a reason on its own. */
function withDetail(headline: string, detail: string | null): string {
  if (!detail) return headline;
  if (headline.toLowerCase().includes(detail.toLowerCase())) return headline;
  return `${headline} (${detail})`;
}

/**
 * A run genuinely lost to a deploy (`type: "run_lost"`) is failed with the
 * server's OWN sentence AND its own remedy — what to actually do about it.
 * Dropping the remedy is exactly the class this closes: a `user_message`
 * that already says "this was not your fault" with no next step attached is
 * still a dead end. Never invented, never reworded — appended verbatim.
 */
function withRemedy(headline: string, remedy: unknown): string {
  if (typeof remedy !== "string" || !remedy.trim()) return headline;
  if (headline.toLowerCase().includes(remedy.toLowerCase())) return headline;
  return `${headline} ${remedy.trim()}`;
}

export interface UseDurableRunOptions<TResult> {
  /** How this domain's runs speak. */
  wire: DurableRunWire;
  /**
   * Stable per-surface key for the browser-side pointer, e.g. `"page-audit"` or
   * `` `ingest:${packId}` ``. Two surfaces must never share one — a rejoin
   * would land on the wrong screen.
   */
  key: string;
  /** The run's own streaming endpoint. */
  path: keyof paths;
  /** The event carrying the finished result, e.g. `seo.page_audit_result`. */
  finalEvent: string;
  /**
   * Keep the finished run's pointer so a return to this lane re-reads its
   * answer (default). Pass `false` when the answer lives somewhere durable
   * the surface already reads — then a finished run must NOT re-float its
   * "Done" window on every later visit (the strategy brief: the document IS
   * the answer, and the window covered it on a phone).
   */
  keepFinished?: boolean;
  /** Wire event name → the sentence a human reads. */
  stageLabels: Record<string, string>;
  /**
   * Turn an event into a stage line when `stageLabels` has no entry for it.
   * Returning null drops the event. Defaults to the event name.
   */
  stageFallback?: (
    name: string,
    data: Record<string, unknown>,
  ) => string | null;
  /** Narrow/validate the result document. Return null to reject it loudly. */
  parseResult?: (raw: unknown) => TResult | null;
  /** Consume a validated terminal result at the stream/rejoin boundary. */
  onResult?: (result: TResult) => void;
  /**
   * PROGRESSIVE RESULTS — every domain data event, before stage/terminal
   * handling. Some runs answer in PIECES (the Masterwork checkup emits one
   * finding at a time over minutes); making the surface wait for the terminal
   * document would put a spinner over work the user could already be doing.
   * The terminal document is still the truth — a surface that consumes this
   * merges by id and lets the final result win. Never use it to hand-render
   * model text (`features/content-ir/FEATURE.md` § No bespoke stream
   * renderers); pass `live` for that.
   */
  onDomainEvent?: (
    name: string,
    data: Record<string, unknown>,
    ctx: { rejoin: boolean },
  ) => void;
  /** Extra body fields every launch and rejoin needs (e.g. `scopeOverrides`). */
  scopeOverrides?: Record<string, string>;
  /**
   * How long a run of THIS kind normally takes. It is not a timeout and it
   * never ends anything — it is the promise the screen is ALLOWED to make.
   * Past `expectedMs * OVERDUE_FACTOR` the hook's `waitMessage` stops promising
   * and reports the state we actually hold. Defaults to `DEFAULT_EXPECTED_MS`.
   */
  expectedMs?: number;
  /** The sentence shown while the run works and is still inside expectation. */
  workingMessage?: string;
  /** The sentence shown while a rejoined run is being picked back up. */
  rejoiningMessage?: string;
  /**
   * Adopt the stream and float it. Pass this when the run's OUTPUT is the point
   * — it then renders token by token in `LiveRunWindow` through the canonical
   * pipeline instead of showing a stage line over an invisible model. Omit it
   * for a run with nothing to show (a fetch, a validator): a stage line is the
   * right answer there.
   */
  live?: {
    /** What the user is watching, e.g. "Keyword classifier". */
    label: string;
    /** Stable window id. */
    instanceId?: string;
    /** Closing line in the window when the run settles. */
    completeMessage?: string;
    /**
     * The caller renders the adopted stream ITSELF and the generic floating
     * window must not open.
     *
     * THE FLOATING LAW's earned exception, and it is narrow: a surface may
     * claim it only when it is purpose-built for this run's output, more
     * specialized than the generic window, and cannot shift content the user
     * is working in. The Final Checkup is the exemplar — it is already a
     * `WindowPanel` whose entire body IS the finding stream, with per-finding
     * Approve / Improve / Reject / Edit that the generic window cannot offer;
     * floating a second copy beside it would show the same findings twice.
     *
     * The stream is still ADOPTED — `requestId` is populated exactly as it is
     * for a floated run, and the caller renders it through the ONE canonical
     * pipeline (`<MarkdownStream requestId />`). This flag decides WHERE the
     * canonical renderer is mounted; it never permits a bespoke one.
     */
    surfaceOwnsDisplay?: boolean;
  };
}

export interface DurableRunHandle<TResult> extends DurableRunState<TResult> {
  /** True while the run is working — launched here or rejoined. */
  running: boolean;
  /**
   * True from the first paint of a mount that found a durable pointer until
   * that rejoin resolves: there IS a run here and this mount cannot yet say
   * what it holds. A surface must not offer to START anything while it is
   * true — that is how a probe rendered its setup screen and a live round at
   * the same time (cold walk 5, finding 3).
   */
  restoring: boolean;
  /** Start it. Per-launch scope wins and is retained for rejoin. */
  launch: (
    body: Record<string, unknown>,
    target?: string,
    options?: DurableRunLaunchOptions,
  ) => Promise<void>;
  /** Wipe a finished run's output before a new one (the caller's reset). */
  reset: () => void;
  /** Set an error the surface detected itself (a bad URL, a rejected result). */
  fail: (message: string) => void;
  /**
   * STOP the run on the server. Non-null only while one is actually in flight
   * AND this domain's wire declares a `cancelPath` — so a surface can ask
   * `cancel ? ... : ...` and is structurally unable to render a Stop button
   * over a domain that cannot stop anything.
   *
   * It is not "close the dialog": the durable row goes terminal with the
   * person's reason and the worker stops at its next chunk. What had already
   * been written stays written, which is what the stopped sentence says.
   */
  cancel: ((reason?: string) => Promise<void>) | null;
  /** True from the click until the server has answered. */
  cancelling: boolean;
  /**
   * Run the LAST launch again, exactly as it was sent. Every surface that can
   * show a failure owes the reader a way out of it; before this, a failed
   * ingest left the person to rebuild their input by hand. Null until this tab
   * has launched something — a rejoined run's body is not ours to repeat.
   */
  retry: (() => Promise<void>) | null;
  /** Milliseconds since this run began. 0 when nothing is in flight. */
  elapsedMs: number;
  /**
   * WHEN the run in flight began, epoch ms — the launch instant, or the
   * instant on the receipt for a run this tab only rejoined. Null when nothing
   * is in flight. Surfaces hand it straight to `<WorkingNotice>` so the clock
   * a person watches survives a reload with the run.
   */
  startedAt: number | null;
  /** How long a run of this kind usually takes — the measured expectation. */
  expectedMs: number;
  /** The run has been working longer than `expectedMs * OVERDUE_FACTOR`. */
  overdue: boolean;
  /**
   * THE ONE SENTENCE a surface shows while a run works — honest at every
   * moment, including the moments AFTER the promise it opened with expired.
   * Null when nothing is in flight. A surface must never hardcode its own.
   */
  waitMessage: string | null;
  /**
   * SHOULD A SURFACE PULL ITSELF OPEN FOR THIS RUN?
   *
   * True only when there is a run in flight under this key that the person has
   * not already closed away from. Every durable-run dialog's auto-reopen latch
   * asks this instead of `running` (cold walk 7, finding 3): `running` is also
   * true for `"rejoining"`, which is the state a restored receipt sits in, so
   * latching on it reopened completed sittings on unrelated later visits.
   */
  surfacing: boolean;
  /**
   * The person closed the surface that was following this run — remember it on
   * the RECEIPT, not in this mount, so a later visit does not drag the same
   * finished sitting back onto the screen. The next run still surfaces.
   */
  dismiss: () => void;
}

export interface DurableRunLaunchOptions {
  /** Exact request context for this target; persisted with the run receipt. */
  scopeOverrides?: Record<string, string>;
  /**
   * Values for the `{param}` placeholders in `path` (e.g. `{brand_id}`).
   * Without this a parameterised command path was sent LITERALLY — the
   * server received "/seo/brands/{brand_id}/…" and answered with a uuid cast
   * error (2026-09-14). Persisted with the launch so `retry` replays it.
   */
  pathParams?: Record<string, string>;
  /**
   * The few input strings the NEXT request will need and this run's answer
   * cannot rebuild — carried on the run's own receipt and handed back as
   * `memo` after a rejoin or a settled restore. See `DurableRunState.memo`.
   */
  memo?: Record<string, string>;
}

function initialState<TResult>(): DurableRunState<TResult> {
  return {
    status: "idle",
    stage: null,
    stages: [],
    result: null,
    error: null,
    stoppedMessage: null,
    runId: null,
    rejoinedTarget: null,
    interruption: null,
    requestId: null,
    memo: null,
  };
}

/**
 * The rejoin/live-snapshot half of `RESUMING_AFTER_RESTART_MESSAGE`: the
 * durable row's own `metadata` after a deploy drain, per the CONTEXT this
 * hook was built against — `_drain: { reason: "deploy_drain" }` while still
 * draining, `_recovery: { reason: "resumed_after_shutdown" }` once the
 * recovery sweep has re-queued it. Either shape reads the same way to a
 * person: the server restarted, and this is the same run continuing.
 */
function interruptionFromMetadata(raw: unknown): RunInterruption | null {
  if (!raw || typeof raw !== "object") return null;
  const metadata = raw as Record<string, unknown>;
  const drain = metadata._drain;
  const drainReason =
    drain && typeof drain === "object"
      ? (drain as Record<string, unknown>).reason
      : null;
  if (drainReason === "deploy_drain") {
    return {
      message: RESUMING_AFTER_RESTART_MESSAGE,
      detail: RESUMING_AFTER_RESTART_DETAIL,
    };
  }
  const recovery = metadata._recovery;
  const recoveryReason =
    recovery && typeof recovery === "object"
      ? (recovery as Record<string, unknown>).reason
      : null;
  if (recoveryReason === "resumed_after_shutdown") {
    return {
      message: RESUMING_AFTER_RESTART_MESSAGE,
      detail: RESUMING_AFTER_RESTART_DETAIL,
    };
  }
  return null;
}

export function useDurableRun<TResult>(
  options: UseDurableRunOptions<TResult>,
): DurableRunHandle<TResult> {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<DurableRunState<TResult>>(
    initialState<TResult>,
  );

  /**
   * 🚨 THIS MOUNT HAS A POINTER AND DOES NOT YET KNOW WHAT IT HOLDS.
   *
   * Cold walk 5, finding 3 (2026-09-16): a Bad Example probe reloaded mid-round
   * rendered its SETUP screen — a spinning, disabled "Write the first one" over
   * "Up to 5 rounds…" — at the same time as an in-progress row reading "Writing
   * round 2 — a version of this work that looks right and is not." with a Stop
   * button, for about nine seconds. Two contradictory states, in one paint, on
   * one screen. A surface decides "has this started?" from its own restored
   * CONTENT, which arrives only when the rejoin resolves, while `running` is
   * true from the first paint — so the two answers disagree for exactly as long
   * as the rejoin takes.
   *
   * This is the missing third answer, and it belongs to every durable surface,
   * not to the probe: there IS a run here, and this mount cannot describe it
   * yet. A surface must not offer to START anything while it is true. Computed
   * before the first paint from the same pointer the rejoin effect reads, so
   * there is no frame in which it is wrong.
   *
   * 🚨 AND IT ENDS WHEN THE RUN CAN BE DESCRIBED, NOT WHEN THE REJOIN REQUEST
   * RETURNS (cold walk 6, finding 3, 2026-09-17). The first cut cleared this in
   * the rejoin's `.finally`, which is a different moment entirely: a rejoin
   * routed to any worker but the one executing the run answers immediately with
   * the durable ROW saying `processing` and hands back nothing to render, and a
   * rejoin whose socket never lands answers with an error. Either way the
   * request was over in a second or two while the run had a minute left to go —
   * so `restoring` went false, the surface still held no content, `running` was
   * still true, and the probe painted its setup screen over a live round for a
   * second time. Reproduced live 2026-09-17 on a brand-new Rulebook by dropping
   * the first rejoin after a reload: "Write the first one" sat on screen for
   * 87 seconds while round 2 was being written and paid for.
   *
   * So it is cleared by exactly three things, all of them answers: this mount
   * LAUNCHED something, the run reached a terminal state (done / error /
   * stopped — see the effect below), or there turned out to be no run here.
   */
  const [restoring, setRestoring] = useState<boolean>(
    () => peekDurableRun(options.wire, options.key) !== null,
  );

  // Latest-value refs so the stream handler never closes over stale options
  // and the mount effect never re-runs because a parent re-rendered.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  /** The target of the launch in flight, read when the run id arrives. */
  const pendingTargetRef = useRef<string | null>(null);
  /** The exact tenant context of the launch in flight, retained for rejoin. */
  const pendingScopeOverridesRef = useRef<Record<string, string> | undefined>(
    undefined,
  );
  /** The memo of the launch in flight, written onto the receipt with it. */
  const pendingMemoRef = useRef<Record<string, string> | undefined>(undefined);

  /**
   * When the run in flight began — the launch instant, or, for a run this tab
   * is only rejoining, the instant recorded on its receipt. The elapsed clock
   * that keeps `waitMessage` honest reads this, so a reload does not reset the
   * promise along with the page.
   */
  const startedAtRef = useRef<number | null>(null);
  /** The last launch's exact arguments, so `retry` repeats it and nothing else. */
  const lastLaunchRef = useRef<
    | {
        body: Record<string, unknown>;
        target: string | undefined;
        options: DurableRunLaunchOptions | undefined;
      }
    | null
  >(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // ── Reconnect plumbing (see STREAM_LOST_MESSAGE) ─────────────────────────
  // `statusRef` / `runIdRef` are the SYNCHRONOUS truth the reconnect loop
  // reads between awaits; React state lags a render behind and a loop that
  // asked it would re-ask a run that already settled.
  const statusRef = useRef<DurableRunStatus>("idle");
  /** Read the live status through a call — a bare ref read gets narrowed by
   *  control flow to whatever this function last wrote, which is the opposite
   *  of the point: the STREAM handler writes it between awaits. */
  const currentStatus = useCallback(
    (): DurableRunStatus => statusRef.current,
    [],
  );
  const runIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const reconnectAbortRef = useRef<AbortController | null>(null);
  const reconnectingRef = useRef(false);
  /** Set below; `handleEvent` reaches the loop through this. */
  const startReconnectRef = useRef<((runId: string) => void) | null>(null);
  /** Same, for stopping it: a cancelled run must not keep being asked about. */
  const stopReconnectRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    statusRef.current = state.status;
  });

  /**
   * A TERMINAL RUN CAN BE DESCRIBED — so the restore is over, whatever the
   * rejoin request did. `done` carries the answer, `error` and `stopped` carry
   * the sentence; all three are something the surface can render honestly. This
   * is the ONLY place a resolved run clears it, so every settle path — the live
   * terminal event, the durable snapshot, a stop from another tab, the
   * reconnect loop giving up — is covered by one rule rather than by a
   * `setRestoring` sprinkled through each of them.
   */
  useEffect(() => {
    if (
      state.status === "done" ||
      state.status === "error" ||
      state.status === "stopped"
    ) {
      setRestoring(false);
    }
  }, [state.status]);

  // ── Live adoption plumbing (only used when `live` is set) ────────────────
  // Retention discipline (/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md): the
  // fetch is aborted BEFORE the adopted row is reaped — an orphaned stream
  // draining into a missing row is the disappearing-run class.
  const adoptedRequestIdRef = useRef<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const releaseAdoptedRun = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    if (adoptedRequestIdRef.current) {
      dispatch(removeRequest(adoptedRequestIdRef.current));
      adoptedRequestIdRef.current = null;
    }
  }, [dispatch]);
  useEffect(() => () => releaseAdoptedRun(), [releaseAdoptedRun]);

  /**
   * The stream plumbing for one launch/rejoin: `consumeStream` + `signal` when
   * the caller asked for live output, plain `onStreamEvent` otherwise.
   */
  const streamOptions = useCallback(
    (
      onEvent: (event: TypedStreamEvent) => void,
    ):
      | { onStreamEvent: (event: TypedStreamEvent) => void }
      | { consumeStream: ForeignStreamConsumer; signal: AbortSignal } => {
      if (!optionsRef.current.live) return { onStreamEvent: onEvent };
      releaseAdoptedRun();
      const controller = new AbortController();
      streamAbortRef.current = controller;
      const consumeStream = dispatch(
        adoptForeignStream({
          abortController: controller,
          onAdopted: ({ requestId }) => {
            adoptedRequestIdRef.current = requestId;
            setState((prev) => ({ ...prev, requestId }));
          },
          // Domain events still drive stage/result; CONTENT is never read
          // here — it renders from the adopted row.
          onEvent,
        }),
      );
      return { consumeStream, signal: controller.signal };
    },
    [dispatch, releaseAdoptedRun],
  );

  const handleEvent = useCallback(
    (event: TypedStreamEvent, ctx: { rejoin: boolean }): void => {
      const {
        wire,
        key,
        finalEvent,
        stageLabels,
        stageFallback,
        parseResult,
        onDomainEvent,
        onResult,
      } = optionsRef.current;

      if (event.event === "error") {
        const payload = event.data as {
          message?: string;
          user_message?: string;
          details?: Record<string, unknown>;
        };
        // The server's sentence AND the specific reason behind it — the live
        // path must carry exactly what the durable row carries (W37).
        const message = withDetail(
          payload?.user_message ||
            payload?.message ||
            "The run failed on the server.",
          durableRunErrorDetail(payload),
        );
        clearPointer(wire, key);
        statusRef.current = "error";
        setState((prev) => ({
          ...prev,
          status: "error",
          stage: null,
          error: message,
        }));
        return;
      }

      const data = eventRecord(event);
      if (!data) return;
      const raw = data[wire.discriminator];
      const name = typeof raw === "string" ? raw : null;
      if (!name) return;

      // Progressive results first: a surface that renders pieces as they land
      // must see them whether they arrived live or in a rejoin replay.
      onDomainEvent?.(name, data, ctx);

      // The server restarted under a still-open stream. The work is not lost
      // — it says so, in place, without touching `status` or `stage`: the run
      // is still `running` and still narrating itself, this is additional
      // fact, not a replacement for what it was already saying.
      if (wire.drainingEvent && name === wire.drainingEvent) {
        setState((prev) => ({
          ...prev,
          interruption: {
            message: RESUMING_AFTER_RESTART_MESSAGE,
            detail: RESUMING_AFTER_RESTART_DETAIL,
          },
        }));
        return;
      }

      // The durable row now exists — remember the receipt before anything else.
      if (name === wire.runStartedEvent && typeof data.run_id === "string") {
        const runId = data.run_id;
        runIdRef.current = runId;
        setState((prev) => ({ ...prev, runId }));
        if (!ctx.rejoin) {
          writePointer(wire, key, {
            runId,
            startedAt: Date.now(),
            target: pendingTargetRef.current,
            ...(pendingScopeOverridesRef.current
              ? { scopeOverrides: pendingScopeOverridesRef.current }
              : {}),
            // The memo rides with the receipt, so the input this run was
            // launched with survives everything the answer survives.
            ...(pendingMemoRef.current
              ? { memo: pendingMemoRef.current }
              : {}),
          });
        }
        return;
      }

      /**
       * Settle a run somebody STOPPED. Terminal like `done` and `error`, and
       * loud about the one thing the person will wonder: what happened to the
       * work that had already landed.
       */
      const settleStopped = (raw: unknown): void => {
        clearPointer(wire, key);
        stopReconnectRef.current?.();
        statusRef.current = "stopped";
        setState((prev) => ({
          ...prev,
          status: "stopped",
          stage: null,
          error: null,
          stoppedMessage: durableRunErrorMessage(raw) ?? STOPPED_MESSAGE,
        }));
      };

      const settleResult = (rawResult: unknown): void => {
        const parsed = parseResult
          ? parseResult(rawResult)
          : (rawResult as TResult | null);
        // Keep the pointer on success (see `RunPointer.settled`): the answer
        // must survive a refresh, not just the run that produced it.
        const pointer = readPointer(wire, key);
        if (pointer && optionsRef.current.keepFinished !== false) {
          writePointer(wire, key, { ...pointer, settled: true });
        } else {
          clearPointer(wire, key);
        }
        if (parsed === null || parsed === undefined) {
          clearPointer(wire, key);
          statusRef.current = "error";
          setState((prev) => ({
            ...prev,
            status: "error",
            stage: null,
            error: "The server returned an incomplete result.",
          }));
          return;
        }
        statusRef.current = "done";
        setState((prev) => ({
          ...prev,
          status: "done",
          stage: null,
          result: parsed,
          error: null,
        }));
        onResult?.(parsed);
      };

      const resultOf =
        wire.resultOf ?? ((d: Record<string, unknown>) => d.result);

      if (name === finalEvent) {
        settleResult(resultOf(data, "final"));
        return;
      }

      // The durable snapshot a rejoin gets. It carries the SAME result document
      // the live final event carries, so a reload lands on the finished answer
      // instead of on an empty screen.
      //
      // 🚨 A SNAPSHOT IS NOT A VERDICT — see STREAM_LOST_MESSAGE. A rejoin that
      // lands on a worker not executing the run gets the ROW, and mid-run the
      // row says `processing`. Only a TERMINAL row status may end the run here.
      if (name === wire.snapshotEvent) {
        const status = typeof data.status === "string" ? data.status : null;
        if (status === "completed") {
          settleResult(resultOf(data, "snapshot"));
          return;
        }
        const snapshotRunId =
          typeof data.run_id === "string" ? data.run_id : runIdRef.current;
        if (status && IN_FLIGHT_STATUSES.has(status) && snapshotRunId) {
          // Still working on the server. Say that, keep the receipt, and keep
          // asking — never offer "start it again" over a live run.
          //
          // A REJOIN AFTER A RESTART IS THE SAME FACT AS THE LIVE DRAIN EVENT
          // — the row's own `metadata._drain`/`_recovery` says the deploy
          // train, not this tab's socket, is why we are reconnecting.
          const interruption = interruptionFromMetadata(data.metadata);
          if (interruption) {
            setState((prev) => ({ ...prev, interruption }));
          }
          startReconnectRef.current?.(snapshotRunId);
          return;
        }
        if (status && CANCELLED_STATUSES.has(status)) {
          settleStopped(data.error);
          return;
        }
        clearPointer(wire, key);
        statusRef.current = "error";
        setState((prev) => ({
          ...prev,
          status: "error",
          stage: null,
          error:
            durableRunErrorMessage(data.error) ??
            (status && FAILED_STATUSES.has(status)
              ? (wire.unfinishedMessage ?? "This run did not finish.")
              : // An unrecognized status is not a licence to claim nothing was
                // saved — say exactly what the server said.
                `This run ended without a recorded result (the server reported "${status ?? "unknown"}").`),
        }));
        return;
      }

      // A live run that was stopped. Published by the server the instant the
      // row flips, so every tab following this run — not just the one that
      // clicked — stops saying "working".
      if (wire.cancelledEvent && name === wire.cancelledEvent) {
        settleStopped(data.error);
        return;
      }

      if (name === wire.failedEvent) {
        clearPointer(wire, key);
        statusRef.current = "error";
        setState((prev) => ({
          ...prev,
          status: "error",
          stage: null,
          error:
            durableRunErrorMessage(data.error) ??
            "The run failed on the server.",
        }));
        return;
      }

      // The same run is already going elsewhere (another tab, another device).
      // Say so plainly — it is not an error, and re-issuing would be fenced by
      // the run's lease anyway.
      if (wire.inProgressEvent && name === wire.inProgressEvent) {
        statusRef.current = "running";
        setState((prev) => ({
          ...prev,
          status: "running",
          stage: "This is already running — following it",
          stages: [...prev.stages, "This is already running — following it"],
        }));
        return;
      }

      const line =
        stageLabels[name] ?? (stageFallback ? stageFallback(name, data) : name);
      if (line === null) return;
      setState((prev) => ({
        ...prev,
        stage: line,
        stages: [...prev.stages, line],
      }));
    },
    [],
  );

  /**
   * THE HONEST RECONNECT. Entered whenever DELIVERY was lost but the run was
   * not: a dropped socket, a stream that ended with no terminal event, or a
   * rejoin snapshot that still says the row is in flight.
   *
   * It re-opens the rejoin endpoint for the SAME run id until the row reaches a
   * terminal state — completed settles the result exactly as the live path
   * would, failed/cancelled settles the row's own error. Nothing in here may
   * invent a verdict.
   *
   * It is not `createTransportLossReattacher`
   * (`features/agents/runtime-reconnect`): that one is a 4-attempt toast loop
   * for an adopted CHAT stream and gives up long before a 4-minute
   * distillation lands. This loop's exit condition is server truth.
   */
  const stopReconnect = useCallback(() => {
    reconnectAbortRef.current?.abort();
    reconnectAbortRef.current = null;
    reconnectingRef.current = false;
  }, []);

  const startReconnect = useCallback(
    (runId: string) => {
      if (reconnectingRef.current || !mountedRef.current) return;
      const {
        wire,
        key,
        scopeOverrides: defaultScopeOverrides,
      } = optionsRef.current;
      reconnectingRef.current = true;
      const controller = new AbortController();
      reconnectAbortRef.current = controller;
      const { signal } = controller;
      const pointer = readPointer(wire, key);
      const scopeOverrides =
        pointer?.scopeOverrides ??
        pendingScopeOverridesRef.current ??
        defaultScopeOverrides;

      runIdRef.current = runId;
      statusRef.current = "rejoining";
      setState((prev) => ({
        ...prev,
        status: "rejoining",
        runId,
        error: null,
        stage: STREAM_LOST_MESSAGE,
        stages:
          prev.stages[prev.stages.length - 1] === STREAM_LOST_MESSAGE
            ? prev.stages
            : [...prev.stages, STREAM_LOST_MESSAGE],
      }));

      // THE GIVE-UP CLOCK IS WALL TIME, NOT PER-ATTEMPT TIME.
      //
      // This deadline used to be `Date.now() + RECONNECT_GIVE_UP_MS` computed
      // inside each `startReconnect`, so every page reload — and every
      // snapshot that re-entered this function — started the fifteen minutes
      // over. A user watched "Reconnecting…" for five minutes, reloaded the
      // page, and watched it forever (2026-09-15). The moment the view was
      // first lost is now carried on the run pointer, so the ceiling is real.
      const lostAt = (() => {
        const existing = readPointer(wire, key);
        if (existing?.lostLiveViewAt) return existing.lostLiveViewAt;
        const now = Date.now();
        if (existing) writePointer(wire, key, { ...existing, lostLiveViewAt: now });
        return now;
      })();

      void (async () => {
        const deadline = lostAt + RECONNECT_GIVE_UP_MS;
        let delayMs = RECONNECT_BASE_DELAY_MS;
        let unreachable = 0;
        // A rejoin that SUCCEEDS but hands back a one-shot `processing`
        // snapshot instead of a live follow is a failure to reconnect, and it
        // is the common one: the live channel is a process-local dict on the
        // server, so any worker but the executing one can only ever answer
        // with the row. Counting only transport errors (`unreachable`) meant
        // this loop could re-ask for ever without the ceiling moving.
        let notLive = 0;
        try {
          while (!signal.aborted && mountedRef.current) {
            await waitFor(delayMs, signal);
            if (signal.aborted || !mountedRef.current) return;
            let failure: ApiCallError | null = null;
            await rejoinDurableRun({
              dispatch,
              wire,
              ...(scopeOverrides ? { scopeOverrides } : {}),
              runId,
              // A STOP MUST STICK.
              //
              // `stopReconnect` aborts this controller, but the rejoin request
              // already in flight is not cancelled by that — its response was
              // read from the row BEFORE the cancel landed, so it arrives
              // afterwards still saying `processing`, and the snapshot branch
              // calls `startReconnect` again. The user saw "Stopping…" flicker
              // and "Lost the live view … Reconnecting…" come straight back.
              // Events from an aborted attempt are no longer anybody's truth.
              streamOptions: streamOptions((event) => {
                if (signal.aborted || !mountedRef.current) return;
                handleEvent(event, { rejoin: true });
              }),
              onUnreachable: (_message, error) => {
                failure = error ?? null;
              },
            });
            if (signal.aborted || !mountedRef.current) return;
            const now = currentStatus();
            // "stopped" belongs here: a user who stopped their own run must
            // not have this loop put "Reconnecting…" back on their screen.
            if (now === "done" || now === "error" || now === "stopped") return;
            unreachable = failure ? unreachable + 1 : 0;
            notLive = failure ? notLive : notLive + 1;
            const giveUp =
              unreachable >= RECONNECT_MAX_UNREACHABLE ||
              notLive >= RECONNECT_MAX_NOT_LIVE ||
              Date.now() > deadline;
            if (giveUp) {
              // Loud, and still never a lie: we do not know that it failed, so
              // we do not say it did.
              captureError({
                source: "durable-run",
                relation: wire.relation,
                message: `Gave up reconnecting to ${wire.relation} run ${runId}`,
                userMessage: "Lost contact with a background run.",
                raw: { runId, key, unreachable },
              });
              statusRef.current = "error";
              setState((prev) => ({
                ...prev,
                status: "error",
                stage: null,
                error:
                  "We have lost the live view of this run and cannot get it back. The run itself is recorded on the server and may well have finished — reopen this Rulebook to see where it got to, and stop it here if you would rather start over. Do not start a second one until you have looked.",
              }));
              return;
            }
            delayMs = Math.min(delayMs * 2, RECONNECT_MAX_DELAY_MS);
          }
        } finally {
          if (reconnectAbortRef.current === controller)
            reconnectAbortRef.current = null;
          reconnectingRef.current = false;
        }
      })();
    },
    [currentStatus, dispatch, handleEvent, streamOptions],
  );
  useEffect(() => {
    startReconnectRef.current = startReconnect;
    stopReconnectRef.current = stopReconnect;
  }, [startReconnect, stopReconnect]);

  const launch = useCallback(
    async (
      body: Record<string, unknown>,
      target?: string,
      launchOptions?: DurableRunLaunchOptions,
    ): Promise<void> => {
      const {
        wire,
        path,
        scopeOverrides: defaultScopeOverrides,
        key,
      } = optionsRef.current;
      const scopeOverrides =
        launchOptions?.scopeOverrides ?? defaultScopeOverrides;
      pendingTargetRef.current = target ?? null;
      pendingScopeOverridesRef.current = scopeOverrides;
      pendingMemoRef.current = launchOptions?.memo;
      lastLaunchRef.current = { body, target, options: launchOptions };
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      // A new launch retires the previous receipt; the new one lands with the
      // new run's id.
      stopReconnect();
      clearPointer(wire, key);
      // A NEW run was never dismissed. The receipt is gone, so the dismissal
      // that rode on it is gone with it — this only catches the mount up.
      dismissedRunIdRef.current = null;
      setDismissed(false);
      // A deliberate launch answers the "what is here?" question outright.
      setRestoring(false);
      runIdRef.current = null;
      statusRef.current = "running";
      setState({
        ...initialState<TResult>(),
        status: "running",
        stage: "Connecting",
        memo: launchOptions?.memo ?? null,
      });
      try {
        const response = await dispatch(
          callApi({
            path,
            method: "POST",
            body: body as never,
            ...(launchOptions?.pathParams
              ? { pathParams: launchOptions.pathParams }
              : {}),
            ...(scopeOverrides ? { scopeOverrides } : {}),
            stream: true,
            ...streamOptions((event) => handleEvent(event, { rejoin: false })),
          }),
        );
        if (response.error) throw new Error(response.error.message);
      } catch (error) {
        // A transport failure does NOT mean the run died — it detaches and
        // keeps going server-side. Once the run has announced its id we can ask
        // the server what actually happened, so we do that instead of printing
        // a verdict we do not have.
        if (currentStatus() === "done") return;
        if (runIdRef.current) {
          startReconnectRef.current?.(runIdRef.current);
          return;
        }
        statusRef.current = "error";
        setState((prev) =>
          prev.status === "done"
            ? prev
            : {
                ...prev,
                status: "error",
                stage: null,
                error: error instanceof Error ? error.message : String(error),
              },
        );
        return;
      }
      // The stream ended without a result and without an error event: the row
      // is the only truth left, and the pointer is how we ask for it.
      if (currentStatus() !== "running") return;
      if (runIdRef.current) {
        startReconnectRef.current?.(runIdRef.current);
        return;
      }
      statusRef.current = "error";
      setState((prev) =>
        prev.status === "running"
          ? {
              ...prev,
              status: "error",
              stage: null,
              error: "The run ended without a result. Try it again.",
            }
          : prev,
      );
    },
    [currentStatus, dispatch, handleEvent, streamOptions],
  );

  // ── The durable half: rejoin whatever was still running when we arrived ──
  /**
   * Has the person closed the surface following the run on this receipt?
   * Seeded from the receipt on mount, so it survives navigation exactly as the
   * receipt does. A fresh launch clears it.
   */
  const [dismissed, setDismissed] = useState(false);
  const dismissedRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    const { wire, key } = optionsRef.current;
    const pointer = readPointer(wire, key);
    if (pointer?.dismissed) {
      dismissedRunIdRef.current = pointer.runId;
      setDismissed(true);
    }
    // Once per mount, against the same receipt the rejoin reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    const { wire, key } = optionsRef.current;
    const pointer = readPointer(wire, key);
    if (!pointer) return;
    dismissedRunIdRef.current = pointer.runId;
    writePointer(wire, key, { ...pointer, dismissed: true });
    setDismissed(true);
  }, []);

  const rejoinedRef = useRef(false);
  useEffect(() => {
    if (rejoinedRef.current) return;
    rejoinedRef.current = true;
    const {
      wire,
      key,
      scopeOverrides: defaultScopeOverrides,
    } = optionsRef.current;
    const pointer = readPointer(wire, key);
    if (!pointer) {
      // Nothing to pick up — say so before anyone paints a restoring state.
      setRestoring(false);
      return;
    }
    setRestoring(true);
    // A settled pointer is a finished ANSWER being restored, not a run being
    // rejoined: the form stays usable while its result comes back, and the
    // user never sees a spinner for work that is already done.
    runIdRef.current = pointer.runId;
    startedAtRef.current = pointer.settled ? null : pointer.startedAt;
    setElapsedMs(pointer.settled ? 0 : Math.max(0, Date.now() - pointer.startedAt));
    statusRef.current = pointer.settled ? "idle" : "rejoining";
    setState({
      ...initialState<TResult>(),
      status: pointer.settled ? "idle" : "rejoining",
      stage: pointer.settled ? null : "Picking up where you left off",
      runId: pointer.runId,
      rejoinedTarget: pointer.target,
      // WHAT THIS RUN WAS LAUNCHED WITH comes back with it. Without this a
      // restored surface holds the answer and not the question, and its next
      // request cannot be built at all (`DurableRunState.memo`).
      memo: pointer.memo ?? null,
    });
    void rejoinDurableRun({
      dispatch,
      wire,
      scopeOverrides: pointer.scopeOverrides ?? defaultScopeOverrides,
      runId: pointer.runId,
      streamOptions: streamOptions((event) =>
        handleEvent(event, { rejoin: true }),
      ),
      onUnreachable: (message, error) => {
        // 🚨 AN UNREACHABLE REJOIN IS NEVER A FINISHED RUN (cold walk 6,
        // finding 3, 2026-09-17). This used to keep asking only when
        // `isStreamTransportLost` recognised the failure, and threw the
        // RECEIPT AWAY otherwise — so one dropped rejoin request after a
        // reload deleted the pointer to a live, paid run, reset the surface to
        // empty, and left the Bad Example probe offering "Write the first one"
        // while round 2 was still being written on the server. Nothing on
        // screen said a word, and no later reload could find the run again
        // because the only receipt had been erased. Measured on a brand-new
        // Rulebook: 87 seconds of a start button over a live round.
        //
        // An unfinished run's receipt is the only way back to it, so it is
        // kept and the honest reconnect loop takes over — that loop has its
        // own wall-clock ceiling and says out loud when it truly gives up
        // (see STREAM_LOST_MESSAGE and the give-up branch).
        captureError({
          source: "durable-run",
          relation: wire.relation,
          message,
          userMessage: pointer.settled
            ? "Could not pick up a background run."
            : "Lost the live view of a background run — still asking.",
          raw: {
            runId: pointer.runId,
            key,
            settled: pointer.settled === true,
            transportLost: isStreamTransportLost(error),
          },
        });
        if (!pointer.settled) {
          startReconnectRef.current?.(pointer.runId);
          return;
        }
        // A FINISHED run whose answer we cannot re-read is a different thing:
        // there is nothing still happening, so the surface goes back to idle
        // rather than opening with a red error nobody caused.
        clearPointer(wire, key);
        statusRef.current = "idle";
        setState(initialState<TResult>());
        setRestoring(false);
      },
    }).finally(() => {
      // THE REQUEST RETURNING IS NOT AN ANSWER. A rejoin that handed back a
      // one-shot `processing` snapshot, or that failed and handed the run to
      // the reconnect loop, is still in flight — and `restoring` means "this
      // mount cannot describe what it holds", which is exactly still true. The
      // terminal-status effect above ends it; this only covers the case where
      // the pointer turned out to be nothing at all.
      if (!mountedRef.current) return;
      if (statusRef.current === "rejoining" || statusRef.current === "running") {
        // A stream that ended with neither a terminal event nor an error left
        // nothing watching the run at all. `startReconnect` is a no-op while
        // its loop is already going, so this only ever adds the missing
        // watcher — and that loop is the thing that eventually ends this state
        // one way or the other.
        startReconnectRef.current?.(pointer.runId);
        return;
      }
      setRestoring(false);
    });
  }, [dispatch, handleEvent, streamOptions]);

  const reset = useCallback(() => {
    stopReconnect();
    runIdRef.current = null;
    startedAtRef.current = null;
    setElapsedMs(0);
    statusRef.current = "idle";
    setRestoring(false);
    setState(initialState<TResult>());
  }, [stopReconnect]);

  /**
   * Repeat the last launch verbatim. A failure the person did not cause must
   * never cost them their input a second time.
   */
  const retry = useCallback(async (): Promise<void> => {
    const last = lastLaunchRef.current;
    if (!last) return;
    await launch(last.body, last.target, last.options);
  }, [launch]);

  const fail = useCallback(
    (message: string) => {
      stopReconnect();
      statusRef.current = "error";
      setState((prev) => ({
        ...prev,
        status: "error",
        stage: null,
        error: message,
      }));
    },
    [stopReconnect],
  );

  /**
   * THE STOP. The server's cancel endpoint is the decision — it flips the
   * durable row — so this never guesses: it settles from what came back, and a
   * run that had already finished settles from that instead (its result is
   * safe, and saying "stopped" over it would be a lie).
   */
  const [cancelling, setCancelling] = useState(false);
  const cancel = useCallback(
    async (reason?: string): Promise<void> => {
      const { wire, key } = optionsRef.current;
      const runId = runIdRef.current;
      if (!wire.cancelPath || !runId) return;
      setCancelling(true);
      try {
        const response = await dispatch(
          callApi({
            path: wire.cancelPath,
            method: "POST",
            pathParams: { run_id: runId },
            ...(reason ? { body: { reason } as never } : {}),
          }),
        );
        if (response.error) {
          // The run may well have stopped anyway, so we do not claim it did —
          // and we do not claim it failed either. Say what we know.
          captureError({
            source: "durable-run",
            relation: wire.relation,
            message: `Could not stop ${wire.relation} run ${runId}: ${response.error.message}`,
            userMessage: "Could not stop this run.",
            raw: { runId, key },
          });
          statusRef.current = "error";
          setState((prev) => ({
            ...prev,
            status: "error",
            stage: null,
            error:
              "We could not stop this run — it may still be going on the server. Reload this page to see where it got to.",
          }));
          return;
        }
        const answer = (response.data ?? {}) as {
          cancelled?: boolean;
          status?: string;
          message?: string;
        };
        stopReconnect();
        clearPointer(wire, key);
        if (answer.status === "completed") {
          // It beat us to the finish line. Leave the result alone and let the
          // rejoin path settle it rather than overwriting an answer.
          startReconnectRef.current?.(runId);
          return;
        }
        statusRef.current = "stopped";
        setState((prev) => ({
          ...prev,
          status: "stopped",
          stage: null,
          error: null,
          stoppedMessage: answer.message?.trim() || STOPPED_MESSAGE,
        }));
      } finally {
        setCancelling(false);
      }
    },
    [dispatch, stopReconnect],
  );

  // Nothing may keep asking the server on behalf of a screen that is gone.
  useEffect(
    () => () => {
      mountedRef.current = false;
      stopReconnect();
    },
    [stopReconnect],
  );

  // THE FLOATING LAW: a live run streams into the floating window — never a
  // block above the surface's own content, and never a spinner. No-op when the
  // caller did not ask for live output (`active` stays false).
  const running = state.status === "running" || state.status === "rejoining";
  const settled = state.status === "done" || state.status === "error";

  // 🚨 THE WINDOW MUST NEVER BE BLANK.
  //
  // `LiveRunDisplay` renders STREAMED CONTENT off the requestId. A durable
  // pipeline emits typed progress events and (usually) no assistant text at
  // all, so binding only a requestId gives the user a titled, EMPTY white box
  // for the whole run — and it stays empty after the run settles, because
  // there was never any content to render. That is what "I click play and get
  // a blank window that never renders anything" was: not a hang, not a lost
  // stream, just a window with nothing wired to its body.
  //
  // Every durable run already narrates itself (`state.stages`), so the stages
  // ARE the content. Feeding them in as progress makes the window show the run
  // instead of a void — for every surface on this hook, not just the one that
  // reported it.
  const progress = (() => {
    if (!options.live || options.live.surfaceOwnsDisplay === true) return null;
    if (!running && !settled) return null;
    const seen = new Set<string>();
    const items = state.stages
      .filter((line) => {
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      })
      .map<LiveRunProgressItem>((line, index, all) => ({
        id: `stage-${index}`,
        label: line,
        status: index < all.length - 1 || settled ? "completed" : "running",
      }));
    if (state.status === "error") {
      items.push({
        id: "stage-error",
        label: state.error ?? "The run failed.",
        status: "failed" as const,
      });
    } else if (state.status === "done") {
      items.push({
        id: "stage-done",
        label: options.live.completeMessage ?? "Finished.",
        status: "completed" as const,
      });
    } else if (items.length === 0) {
      // Before the first server stage lands the window still says something.
      items.push({
        id: "stage-connecting",
        label: state.stage ?? "Starting…",
        status: "running" as const,
      });
    }
    return {
      title: options.live.label ?? "AI is working",
      ...(state.rejoinedTarget ? { description: state.rejoinedTarget } : {}),
      items,
    };
  })();

  useFloatingLiveRun({
    // The window stays bound after the run settles so the finished narration —
    // and any failure reason — survives on screen. It is user-dismissed.
    active:
      Boolean(options.live) &&
      options.live?.surfaceOwnsDisplay !== true &&
      (running || settled),
    instanceId: options.live?.instanceId ?? `durable-run:${options.key}`,
    requestId: state.requestId,
    label: state.stage ?? options.live?.label ?? "AI is working",
    progress,
  });

  // ── The honest clock (see OVERDUE_FACTOR) ────────────────────────────────
  // It ends nothing and cancels nothing. It exists so the sentence on screen
  // can stop being a promise the moment the promise expires.
  useEffect(() => {
    if (!running || startedAtRef.current === null) return;
    const tick = (): void => {
      const startedAt = startedAtRef.current;
      if (startedAt === null) return;
      setElapsedMs(Math.max(0, Date.now() - startedAt));
    };
    tick();
    const timer = setInterval(tick, ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const expectedMs = options.expectedMs ?? DEFAULT_EXPECTED_MS;
  const overdue = running && elapsedMs > expectedMs * OVERDUE_FACTOR;

  /**
   * The sentence itself. Note what it never does: it never says the run failed,
   * never offers to "try again" over work that is still going, and never
   * repeats a duration promise it has already outlived. Both overdue branches
   * report the state this hook actually holds — a live stream means the server
   * is still working on it; a reconnect loop means we have lost the view and
   * are still asking. A verdict only ever comes from the row.
   */
  const waitMessage = ((): string | null => {
    if (!running) return null;
    if (!overdue) {
      return state.status === "rejoining"
        ? (options.rejoiningMessage ??
            "Picking this back up — it kept working while you were away.")
        : (options.workingMessage ??
            `Working — this usually takes ${describeExpected(expectedMs)}.`);
    }
    const clock = formatElapsed(elapsedMs);
    return state.status === "rejoining"
      ? `This is taking longer than it should — ${clock} so far, and we have lost the live view. We are still asking the server, and the job may well still be running. You can leave this page: it keeps going, and this picks it back up.`
      : `This is taking longer than it should — ${clock} so far. The job is still running on the server and we are still watching it. You can leave this page: it keeps going, and this picks it back up.`;
  })();

  return {
    ...state,
    running,
    restoring,
    launch,
    reset,
    fail,
    retry: lastLaunchRef.current ? retry : null,
    cancel: options.wire.cancelPath && running && state.runId ? cancel : null,
    cancelling,
    elapsedMs: running ? elapsedMs : 0,
    startedAt: running ? startedAtRef.current : null,
    expectedMs,
    overdue,
    waitMessage,
    surfacing:
      running &&
      Boolean(state.runId) &&
      !(dismissed && state.runId === dismissedRunIdRef.current),
    dismiss,
  };
}

async function rejoinDurableRun({
  dispatch,
  wire,
  scopeOverrides,
  runId,
  streamOptions,
  onUnreachable,
}: {
  dispatch: AppDispatch;
  wire: DurableRunWire;
  /** Same request-context redirection the launch carried — a rejoin is the
   *  SAME conversation, so it must travel under the same organization. Losing
   *  these on rejoin is what made an admin-surface pickup demand a selected
   *  org the surface deliberately does not have. */
  scopeOverrides?: Record<string, string>;
  runId: string;
  /** Either the plain event callback or the adopted-stream consumer. */
  streamOptions:
    | { onStreamEvent: (event: TypedStreamEvent) => void }
    | { consumeStream: ForeignStreamConsumer; signal: AbortSignal };
  onUnreachable: (message: string, error?: ApiCallError) => void;
}): Promise<void> {
  try {
    const response = await dispatch(
      callApi({
        path: wire.rejoinPath,
        method: "POST",
        pathParams: { run_id: runId },
        ...(scopeOverrides ? { scopeOverrides } : {}),
        stream: true,
        ...streamOptions,
      }),
    );
    if (response.error) {
      onUnreachable(response.error.message, response.error);
    }
  } catch (error) {
    onUnreachable(
      error instanceof Error ? error.message : "Could not rejoin the run.",
    );
  }
}
