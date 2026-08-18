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

import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import type { ForeignStreamConsumer } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { useFloatingLiveRun } from "@/features/overlays/openers/liveRunWindow";
import { callApi } from "@/lib/api/call-api";
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
    return {
      runId: parsed.runId,
      startedAt,
      target: typeof parsed.target === "string" ? parsed.target : null,
      settled: parsed.settled === true,
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
  /** Start it. `target` is what the run is about, for rejoin copy. */
  launch: (body: Record<string, unknown>, target?: string) => Promise<void>;
  /** Wipe a finished run's output before a new one (the caller's reset). */
  reset: () => void;
  /** Set an error the surface detected itself (a bad URL, a rejected result). */
  fail: (message: string) => void;
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

  // ── Live adoption plumbing (only used when `live` is set) ────────────────
  // Retention discipline (features/agents/docs/LIVE_RUN_RETENTION.md): the
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
        setState((prev) => ({ ...prev, runId }));
        if (!ctx.rejoin) {
          writePointer(wire, key, {
            runId,
            startedAt: Date.now(),
            target: pendingTargetRef.current,
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
          setState((prev) => ({
            ...prev,
            status: "error",
            stage: null,
            error: "The server returned an incomplete result.",
          }));
          return;
        }
        setState((prev) => ({
          ...prev,
          status: "done",
          stage: null,
          result: parsed,
          error: null,
        }));
      };

      const resultOf =
        wire.resultOf ?? ((d: Record<string, unknown>) => d.result);

      if (name === finalEvent) {
        settleResult(resultOf(data, "final"));
        return;
      }

      // The durable snapshot a rejoin gets once the run is over. It carries the
      // SAME result document the live final event carries, so a reload lands on
      // the finished answer instead of on an empty screen.
      if (name === wire.snapshotEvent) {
        const status = typeof data.status === "string" ? data.status : null;
        if (status === "completed") {
          settleResult(resultOf(data, "snapshot"));
          return;
        }
        clearPointer(wire, key);
        setState((prev) => ({
          ...prev,
          status: "error",
          stage: null,
          error:
            durableRunErrorMessage(data.error) ??
            wire.unfinishedMessage ??
            "This run did not finish.",
        }));
        return;
      }

      if (name === wire.failedEvent) {
        clearPointer(wire, key);
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
        setState((prev) => ({
          ...prev,
          status: "running",
          stage: "This is already running — following it",
          stages: [...prev.stages, "This is already running — following it"],
        }));
        return;
      }

      const line =
        stageLabels[name] ??
        (stageFallback ? stageFallback(name, data) : name);
      if (line === null) return;
      setState((prev) => ({
        ...prev,
        stage: line,
        stages: [...prev.stages, line],
      }));
    },
    [],
  );

  const launch = useCallback(
    async (body: Record<string, unknown>, target?: string): Promise<void> => {
      const { wire, path, scopeOverrides, key } = optionsRef.current;
      pendingTargetRef.current = target ?? null;
      // A new launch retires the previous receipt; the new one lands with the
      // new run's id.
      clearPointer(wire, key);
      setState({ ...initialState<TResult>(), status: "running", stage: "Connecting" });
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
        // keeps going server-side, and the pointer we wrote will rejoin it.
        setState((prev) =>
          prev.status === "done"
            ? prev
            : {
                ...prev,
                status: "error",
                stage: null,
                error:
                  error instanceof Error ? error.message : String(error),
              },
        );
        return;
      }
      // The stream ended without a result and without an error event: the row
      // is the only truth left, and the pointer is how we ask for it.
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
    [dispatch, handleEvent, streamOptions],
  );

  // ── The durable half: rejoin whatever was still running when we arrived ──
  const rejoinedRef = useRef(false);
  useEffect(() => {
    if (rejoinedRef.current) return;
    rejoinedRef.current = true;
    const { wire, key } = optionsRef.current;
    const pointer = readPointer(wire, key);
    if (!pointer) return;
    // A settled pointer is a finished ANSWER being restored, not a run being
    // rejoined: the form stays usable while its result comes back, and the
    // user never sees a spinner for work that is already done.
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
      runId: pointer.runId,
      streamOptions: streamOptions((event) =>
        handleEvent(event, { rejoin: true }),
      ),
      onUnreachable: (message) => {
        clearPointer(wire, key);
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
    setState(initialState<TResult>());
  }, []);

  const fail = useCallback((message: string) => {
    setState((prev) => ({
      ...prev,
      status: "error",
      stage: null,
      error: message,
    }));
  }, []);

  // THE FLOATING LAW: a live run streams into the floating window — never a
  // block above the surface's own content, and never a spinner. No-op when the
  // caller did not ask for live output (`active` stays false).
  const running = state.status === "running" || state.status === "rejoining";
  useFloatingLiveRun({
    active:
      Boolean(options.live) &&
      options.live?.surfaceOwnsDisplay !== true &&
      running,
    instanceId: options.live?.instanceId ?? `durable-run:${options.key}`,
    requestId: state.requestId,
    label: state.stage ?? options.live?.label ?? "AI is working",
  });

  return {
    ...state,
    running,
    launch,
    reset,
    fail,
  };
}

async function rejoinDurableRun({
  dispatch,
  wire,
  runId,
  streamOptions,
  onUnreachable,
}: {
  dispatch: AppDispatch;
  wire: DurableRunWire;
  runId: string;
  /** Either the plain event callback or the adopted-stream consumer. */
  streamOptions:
    | { onStreamEvent: (event: TypedStreamEvent) => void }
    | { consumeStream: ForeignStreamConsumer; signal: AbortSignal };
  onUnreachable: (message: string) => void;
}): Promise<void> {
  try {
    const response = await dispatch(
      callApi({
        path: wire.rejoinPath,
        method: "POST",
        pathParams: { run_id: runId },
        stream: true,
        ...streamOptions,
      }),
    );
    if (response.error) {
      onUnreachable(response.error.message);
    }
  } catch (error) {
    onUnreachable(
      error instanceof Error ? error.message : "Could not rejoin the run.",
    );
  }
}
