"use client";

/**
 * useSeoCommandRun — the ONE way a surface runs a durable SEO command.
 *
 * ## The defect it closes
 *
 * THE FLOATING LAW has two halves; these surfaces only had the first. They
 * narrate real stages (which the law permits), but the run was held in an
 * in-tab `await`: navigate away or reload and the user was left with nothing,
 * even though the work itself kept going. "A run that dies on page refresh is
 * the same defect as a spinner" (`features/window-panels/FEATURE.md`).
 *
 * ## Why no new durability was invented
 *
 * The durable half already exists SERVER-side and is proven — the same shape
 * `useSiteCommandRun` consumes for crawls:
 *
 *   durable row opened at LAUNCH → find it again → rejoin it → settle from
 *   SERVER truth, never from a guess.
 *
 * Every SEO command claims a `seo.collection_run` row BEFORE its first paid or
 * AI call and announces its id on the wire as `seo.command_run` (aidream
 * `services/seo/command_runs.py`). The stream detaches on client disconnect —
 * `create_streaming_response(detach_on_disconnect=True)` — so the work never
 * stopped, only our delivery did. `POST /seo/collections/{run_id}/rejoin`
 * replays the live channel when the run is still executing and emits one
 * durable `seo.run_snapshot` (status + error + result) when it is over.
 *
 * So the ONLY missing piece was on this side: remember the run id and rejoin
 * it on load. That pointer is the one thing that belongs in the browser — it
 * is a receipt number for a server-owned run, not the run's state.
 *
 * ## Anonymous surfaces work too
 *
 * `/seo/page-audit`, `/seo/robots-tester` and `/seo/structured-data` serve
 * signed-out visitors. A guest is an ordinary `auth.users` row minted by
 * aidream's AuthMiddleware from the browser's stable `X-Fingerprint-ID`, so a
 * guest OWNS its command rows — no Supabase session anywhere in the picture.
 *
 * 🚨 `POST /seo/collections/{run_id}/rejoin` is NOT that route: its router is
 * mounted behind `require_authenticated` and answers a guest 401
 * `token_required` (measured against production, 2026-08-17). The guest-safe
 * twin is `POST /seo/public/runs/{run_id}/rejoin` — same `rejoin_stream`, same
 * `collection_run_readable` ownership check, guest-or-above gate. Every
 * consumer here uses it, signed in or not: one path, and the ownership check
 * (not the gate) is what keeps a run private.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { AppDispatch } from "@/lib/redux/store";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { paths } from "@/types/python-generated/api-types";

const REJOIN_PATH = "/seo/collections/{run_id}/rejoin" satisfies keyof paths;

/**
 * A pointer older than this is not worth rejoining: every command holds a
 * 5-minute lease it renews every 60s, so an hour-old "running" run is over one
 * way or another and the durable snapshot is the answer. Beyond that we stop
 * asking — a stale receipt should not make a fresh page load do work.
 */
const POINTER_MAX_AGE_MS = 60 * 60 * 1000;

const POINTER_PREFIX = "matrx.seo-command-run.";

export type SeoCommandStatus =
  | "idle"
  /** Rejoining a run this tab did not start (or started before a reload). */
  | "rejoining"
  | "running"
  | "done"
  | "error";

export interface SeoCommandRunState<TResult> {
  status: SeoCommandStatus;
  /** The human stage line — real server stages, never invented ones. */
  stage: string | null;
  result: TResult | null;
  error: string | null;
  runId: string | null;
  /** What the rejoined run was working on, for "still auditing <url>" copy. */
  rejoinedTarget: string | null;
}

interface RunPointer {
  runId: string;
  startedAt: number;
  target: string | null;
  /**
   * The run reached a good terminal state here. The pointer is KEPT so a
   * reload re-reads the finished result off the durable row — losing an answer
   * to a refresh is the same defect as losing the run that produced it. Only a
   * fresh launch, a failure, or age retires a pointer.
   */
  settled?: boolean;
}

function pointerKey(key: string): string {
  return `${POINTER_PREFIX}${key}`;
}

function readPointer(key: string): RunPointer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(pointerKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunPointer>;
    if (typeof parsed.runId !== "string" || !parsed.runId) return null;
    const startedAt =
      typeof parsed.startedAt === "number" ? parsed.startedAt : 0;
    if (!startedAt || Date.now() - startedAt > POINTER_MAX_AGE_MS) {
      window.localStorage.removeItem(pointerKey(key));
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

function writePointer(key: string, pointer: RunPointer): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pointerKey(key), JSON.stringify(pointer));
  } catch {
    /* private mode / quota — the run still works, it just cannot be rejoined */
  }
}

function clearPointer(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(pointerKey(key));
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

export interface UseSeoCommandRunOptions<TResult> {
  /**
   * Stable per-tool key for the browser-side pointer, e.g. `"page-audit"`.
   * Two tools must never share one — a rejoin would land on the wrong screen.
   */
  key: string;
  /** The command's own streaming endpoint. */
  path: keyof paths;
  /** The event kind carrying the finished result, e.g. `seo.page_audit_result`. */
  finalKind: string;
  /** Wire stage kind → the sentence a human reads. */
  stageLabels: Record<string, string>;
  /** Narrow/validate the result document. Return null to reject it loudly. */
  parseResult?: (raw: unknown) => TResult | null;
  /** Extra body fields every launch and rejoin needs (e.g. `scopeOverrides`). */
  scopeOverrides?: Record<string, string>;
}

export interface SeoCommandRunHandle<TResult>
  extends SeoCommandRunState<TResult> {
  /** True while the command is working — launched here or rejoined. */
  running: boolean;
  /** Start it. `target` is what the run is about (a URL), for rejoin copy. */
  launch: (body: Record<string, unknown>, target?: string) => Promise<void>;
  /** Wipe a finished run's output before a new one (the caller's reset). */
  reset: () => void;
  /** Set an error the tool detected itself (a bad URL, a rejected result). */
  fail: (message: string) => void;
}

export function useSeoCommandRun<TResult>(
  options: UseSeoCommandRunOptions<TResult>,
): SeoCommandRunHandle<TResult> {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<SeoCommandRunState<TResult>>({
    status: "idle",
    stage: null,
    result: null,
    error: null,
    runId: null,
    rejoinedTarget: null,
  });

  // Latest-value refs so the stream handler never closes over stale options
  // and the mount effect never re-runs because a parent re-rendered.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  /** The target of the launch in flight, read when the run id arrives. */
  const pendingTargetRef = useRef<string | null>(null);

  const handleEvent = useCallback(
    (event: TypedStreamEvent, ctx: { rejoin: boolean }): void => {
      const {
        key,
        finalKind,
        stageLabels,
        parseResult,
      } = optionsRef.current;

      if (event.event === "error") {
        const payload = event.data as {
          message?: string;
          user_message?: string;
        };
        const message =
          payload?.user_message ||
          payload?.message ||
          "The command failed on the server.";
        clearPointer(key);
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
      const kind = typeof data.kind === "string" ? data.kind : null;
      if (!kind) return;

      // The durable row now exists — remember the receipt before anything else.
      if (kind === "seo.command_run" && typeof data.run_id === "string") {
        const runId = data.run_id;
        setState((prev) => ({ ...prev, runId }));
        if (!ctx.rejoin) {
          writePointer(key, {
            runId,
            startedAt: Date.now(),
            target: pendingTargetRef.current,
          });
        }
        return;
      }

      const settleResult = (raw: unknown): void => {
        const parsed = parseResult ? parseResult(raw) : (raw as TResult | null);
        // Keep the pointer on success (see `RunPointer.settled`): the answer
        // must survive a refresh, not just the run that produced it.
        const pointer = readPointer(key);
        if (pointer) writePointer(key, { ...pointer, settled: true });
        if (parsed === null || parsed === undefined) {
          clearPointer(key);
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

      if (kind === finalKind) {
        settleResult(data.result);
        return;
      }

      // The durable snapshot a rejoin gets once the run is over. It carries the
      // SAME result document the live final event carries, so a reload lands on
      // the finished answer instead of on an empty screen.
      if (kind === "seo.run_snapshot") {
        const status = typeof data.status === "string" ? data.status : null;
        if (status === "completed") {
          settleResult(data.result);
          return;
        }
        clearPointer(key);
        setState((prev) => ({
          ...prev,
          status: "error",
          stage: null,
          error: seoErrorMessage(data.error) ?? "This run did not finish.",
        }));
        return;
      }

      if (kind === "seo.command_failed") {
        clearPointer(key);
        setState((prev) => ({
          ...prev,
          status: "error",
          stage: null,
          error:
            seoErrorMessage(data.error) ?? "The command failed on the server.",
        }));
        return;
      }

      // The same command is already running elsewhere (another tab, another
      // device). Say so plainly — it is not an error, and re-issuing would be
      // fenced by the run's lease anyway.
      if (kind === "seo.run_in_progress") {
        setState((prev) => ({
          ...prev,
          status: "running",
          stage: "This is already running — following it",
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        stage: stageLabels[kind] ?? kind,
      }));
    },
    [],
  );

  const launch = useCallback(
    async (body: Record<string, unknown>, target?: string): Promise<void> => {
      const { path, scopeOverrides, key } = optionsRef.current;
      pendingTargetRef.current = target ?? null;
      // A new launch retires the previous receipt; the new one lands with the
      // new run's id.
      clearPointer(key);
      setState({
        status: "running",
        stage: "Connecting",
        result: null,
        error: null,
        runId: null,
        rejoinedTarget: null,
      });
      try {
        const response = await dispatch(
          callApi({
            path,
            method: "POST",
            body: body as never,
            ...(scopeOverrides ? { scopeOverrides } : {}),
            stream: true,
            onStreamEvent: (event) => handleEvent(event, { rejoin: false }),
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
    [dispatch, handleEvent],
  );

  // ── The durable half: rejoin whatever was still running when we arrived ──
  const rejoinedRef = useRef(false);
  useEffect(() => {
    if (rejoinedRef.current) return;
    rejoinedRef.current = true;
    const { key } = optionsRef.current;
    const pointer = readPointer(key);
    if (!pointer) return;
    // A settled pointer is a finished ANSWER being restored, not a run being
    // rejoined: the form stays usable while its result comes back, and the
    // user never sees a spinner for work that is already done.
    setState({
      status: pointer.settled ? "idle" : "rejoining",
      stage: pointer.settled ? null : "Picking up where you left off",
      result: null,
      error: null,
      runId: pointer.runId,
      rejoinedTarget: pointer.target,
    });
    void rejoinSeoCommandRun({
      dispatch,
      runId: pointer.runId,
      onEvent: (event) => handleEvent(event, { rejoin: true }),
      onUnreachable: (message) => {
        clearPointer(key);
        setState({
          status: "idle",
          stage: null,
          result: null,
          error: null,
          runId: null,
          rejoinedTarget: null,
        });
        // Loud, but not in the user's face: nothing was lost that they can act
        // on, and a tool that opens with a red error nobody caused is worse.
        captureError({
          source: "durable-run",
          relation: "seo.collection_run",
          message,
          userMessage: "Could not pick up a background SEO run.",
          raw: { runId: pointer.runId, key },
        });
      },
    });
  }, [dispatch, handleEvent]);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      stage: null,
      result: null,
      error: null,
      runId: null,
      rejoinedTarget: null,
    });
  }, []);

  const fail = useCallback((message: string) => {
    setState((prev) => ({
      ...prev,
      status: "error",
      stage: null,
      error: message,
    }));
  }, []);

  return {
    ...state,
    running: state.status === "running" || state.status === "rejoining",
    launch,
    reset,
    fail,
  };
}

/** aidream persists a structured error document; show its sentence. */
function seoErrorMessage(raw: unknown): string | null {
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

async function rejoinSeoCommandRun({
  dispatch,
  runId,
  onEvent,
  onUnreachable,
}: {
  dispatch: AppDispatch;
  runId: string;
  onEvent: (event: TypedStreamEvent) => void;
  onUnreachable: (message: string) => void;
}): Promise<void> {
  try {
    const response = await dispatch(
      callApi({
        path: REJOIN_PATH,
        method: "POST",
        pathParams: { run_id: runId },
        stream: true,
        onStreamEvent: onEvent,
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
