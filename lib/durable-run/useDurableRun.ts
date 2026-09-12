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
/** How often the elapsed clock moves while a run is in flight. */
const ELAPSED_TICK_MS = 1_000;
/**
 * A caller that states no expectation still may not promise forever. One minute
 * is what every one of these dialogs already told the user out loud.
 */
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
  return `about ${formatDurationMs(ms, { style: "coarse" })}`;
}

/** "2m 57s" / "48s" — the honest clock a stuck-looking screen owes the reader. */
export function formatElapsed(ms: number): string {
  return formatDurationMs(ms, { style: "compact", round: "down" });
}

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
  "cancelled",
  "canceled",
  "abandoned",
  "timed_out",
  "expired",
  "error",
]);

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
  /** Optional: "this identity is already running elsewhere" (SEO reuses runs). */
  inProgressEvent?: string;
  /** The rejoin endpoint. Takes `run_id` as its only path param. */
  rejoinPath: keyof paths;
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
  | "error";

export interface DurableRunState<TResult> {
  status: DurableRunStatus;
  /** The latest human stage line — real server stages, never invented ones. */
  stage: string | null;
  /** Every stage line so far, for surfaces that show a running log. */
  stages: string[];
  result: TResult | null;
  error: string | null;
  runId: string | null;
  /** What the rejoined run was working on, for "still reading <file>" copy. */
  rejoinedTarget: string | null;
  /**
   * The adopted stream's canonical request id — only with `live`. Everything
   * the model writes is read off this through the canonical selectors; a
   * surface never touches the text itself. Populated whether the run floats
   * or the surface owns its display (`live.surfaceOwnsDisplay`).
   */
  requestId: string | null;
}

interface RunPointer {
  runId: string;
  startedAt: number;
  target: string | null;
  /** Exact request tenancy used by this launch. A rejoin is the same run. */
  scopeOverrides?: Record<string, string>;
  /**
   * The run reached a good terminal state here. The pointer is KEPT so a
   * reload re-reads the finished result off the durable row — losing an answer
   * to a refresh is the same defect as losing the run. Only a fresh launch, a
   * failure, or age retires a pointer.
   */
  settled?: boolean;
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
    const rawScopeOverrides = parsed.scopeOverrides;
    const scopeOverrides =
      rawScopeOverrides &&
      typeof rawScopeOverrides === "object" &&
      Object.values(rawScopeOverrides).every(
        (value) => typeof value === "string",
      )
        ? (rawScopeOverrides as Record<string, string>)
        : undefined;
    return {
      runId: parsed.runId,
      startedAt,
      target: typeof parsed.target === "string" ? parsed.target : null,
      settled: parsed.settled === true,
      ...(scopeOverrides ? { scopeOverrides } : {}),
    };
  } catch {
    // A corrupt pointer must never break the tool it belongs to.
    return null;
  }
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

/** aidream persists a structured error document; show its sentence. */
export function durableRunErrorMessage(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw;
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const field of ["user_message", "message"]) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return null;
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
   * Run the LAST launch again, exactly as it was sent. Every surface that can
   * show a failure owes the reader a way out of it; before this, a failed
   * ingest left the person to rebuild their input by hand. Null until this tab
   * has launched something — a rejoined run's body is not ours to repeat.
   */
  retry: (() => Promise<void>) | null;
  /** Milliseconds since this run began. 0 when nothing is in flight. */
  elapsedMs: number;
  /** The run has been working longer than `expectedMs * OVERDUE_FACTOR`. */
  overdue: boolean;
  /**
   * THE ONE SENTENCE a surface shows while a run works — honest at every
   * moment, including the moments AFTER the promise it opened with expired.
   * Null when nothing is in flight. A surface must never hardcode its own.
   */
  waitMessage: string | null;
}

export interface DurableRunLaunchOptions {
  /** Exact request context for this target; persisted with the run receipt. */
  scopeOverrides?: Record<string, string>;
}

function initialState<TResult>(): DurableRunState<TResult> {
  return {
    status: "idle",
    stage: null,
    stages: [],
    result: null,
    error: null,
    runId: null,
    rejoinedTarget: null,
    requestId: null,
  };
}

export function useDurableRun<TResult>(
  options: UseDurableRunOptions<TResult>,
): DurableRunHandle<TResult> {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<DurableRunState<TResult>>(
    initialState<TResult>,
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
  useEffect(() => {
    statusRef.current = state.status;
  });

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
        };
        const message =
          payload?.user_message ||
          payload?.message ||
          "The run failed on the server.";
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
          });
        }
        return;
      }

      const settleResult = (rawResult: unknown): void => {
        const parsed = parseResult
          ? parseResult(rawResult)
          : (rawResult as TResult | null);
        // Keep the pointer on success (see `RunPointer.settled`): the answer
        // must survive a refresh, not just the run that produced it.
        const pointer = readPointer(wire, key);
        if (pointer) writePointer(wire, key, { ...pointer, settled: true });
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
          startReconnectRef.current?.(snapshotRunId);
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

      void (async () => {
        const deadline = Date.now() + RECONNECT_GIVE_UP_MS;
        let delayMs = RECONNECT_BASE_DELAY_MS;
        let unreachable = 0;
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
              streamOptions: streamOptions((event) =>
                handleEvent(event, { rejoin: true }),
              ),
              onUnreachable: (_message, error) => {
                failure = error ?? null;
              },
            });
            if (signal.aborted || !mountedRef.current) return;
            const now = currentStatus();
            if (now === "done" || now === "error") return;
            unreachable = failure ? unreachable + 1 : 0;
            const giveUp =
              unreachable >= RECONNECT_MAX_UNREACHABLE || Date.now() > deadline;
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
                  "Lost contact with this run. It may still be finishing on the server — reload this page to pick it up before starting another one.",
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
  }, [startReconnect]);

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
      lastLaunchRef.current = { body, target, options: launchOptions };
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      // A new launch retires the previous receipt; the new one lands with the
      // new run's id.
      stopReconnect();
      clearPointer(wire, key);
      runIdRef.current = null;
      statusRef.current = "running";
      setState({
        ...initialState<TResult>(),
        status: "running",
        stage: "Connecting",
      });
      try {
        const response = await dispatch(
          callApi({
            path,
            method: "POST",
            body: body as never,
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
    if (!pointer) return;
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
        // A dropped socket while picking an UNFINISHED run back up is delivery
        // failing again, not the run failing. Keep asking.
        if (!pointer.settled && isStreamTransportLost(error)) {
          startReconnectRef.current?.(pointer.runId);
          return;
        }
        clearPointer(wire, key);
        statusRef.current = "idle";
        setState(initialState<TResult>());
        // Loud, but not in the user's face: nothing was lost that they can act
        // on, and a tool that opens with a red error nobody caused is worse.
        captureError({
          source: "durable-run",
          relation: wire.relation,
          message,
          userMessage: "Could not pick up a background run.",
          raw: { runId: pointer.runId, key },
        });
      },
    });
  }, [dispatch, handleEvent, streamOptions]);

  const reset = useCallback(() => {
    stopReconnect();
    runIdRef.current = null;
    startedAtRef.current = null;
    setElapsedMs(0);
    statusRef.current = "idle";
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
    launch,
    reset,
    fail,
    retry: lastLaunchRef.current ? retry : null,
    elapsedMs: running ? elapsedMs : 0,
    overdue,
    waitMessage,
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
