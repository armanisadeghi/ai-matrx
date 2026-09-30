/**
 * Pick a media-desk run back up after a reload, a navigation or a remount.
 *
 * Every media-desk job is a durable command on `seo.collection_run` (aidream
 * `services/media_desk`): the server keeps working and files the result even
 * when the page that started it goes away. A clip or a counsel draft takes
 * minutes, so losing the page must never lose the answer (table stakes:
 * auto-resume). The dialog remembers the run id the moment the server claims
 * it; on the next open it reads the row DIRECT from Supabase (RLS) until the
 * run settles, then shows the stored result — the same document the stream
 * would have delivered.
 */

import { useEffect, useState } from "react";

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

const PREFIX = "matrx:media-desk:run:";
/** Past this, a remembered run is not picked up (the person has moved on). */
export const REJOIN_WINDOW_MS = 30 * 60_000;
const POLL_MS = 4_000;

export interface RememberedRun {
  runId: string;
  startedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberRun(key: string, runId: string, now = Date.now()): void {
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify({ runId, startedAt: now } satisfies RememberedRun));
  } catch {
    // Storage full or blocked: the run still completes and the stream still answers.
  }
}

export function forgetRun(key: string): void {
  try {
    storage()?.removeItem(PREFIX + key);
  } catch {
    // nothing to clean
  }
}

export function readRememberedRun(key: string, now = Date.now()): RememberedRun | null {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    if (!raw) return null;
    const run = JSON.parse(raw) as Partial<RememberedRun>;
    if (typeof run.runId !== "string" || typeof run.startedAt !== "number") return null;
    if (now - run.startedAt > REJOIN_WINDOW_MS) {
      forgetRun(key);
      return null;
    }
    return { runId: run.runId, startedAt: run.startedAt };
  } catch {
    return null;
  }
}

export type RunRow = { status: string; result: unknown; error: unknown };

export async function readRun(runId: string): Promise<RunRow | null> {
  await requireAuthenticatedSupabaseSession(supabase);
  const { data, error } = await supabase
    .schema("seo")
    .from("collection_run")
    .select("status, result, error")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  return (data as RunRow | null) ?? null;
}

function errorText(value: unknown): string {
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message: unknown }).message);
  }
  return "The run failed on the server.";
}

export interface RejoinState<T> {
  /** A remembered run is being followed. */
  following: RememberedRun | null;
  result: T | null;
  error: string | null;
}

export interface RejoinHandle<T> extends RejoinState<T> {
  /** Drop a picked-up result (the person moved on: edit, run again, close). */
  clear: () => void;
}

/**
 * While `active` (the dialog is open and nothing is running live), follow any
 * remembered run for `key` to its end. Returns the stored result once it lands.
 */
export function useRejoinRun<T>(key: string, active: boolean): RejoinHandle<T> {
  const [state, setState] = useState<RejoinState<T>>({ following: null, result: null, error: null });

  useEffect(() => {
    if (!active) return;
    const remembered = readRememberedRun(key);
    if (!remembered) return;
    let cancelled = false;
    setState({ following: remembered, result: null, error: null });
    const tick = async () => {
      try {
        const row = await readRun(remembered.runId);
        if (cancelled) return;
        if (row?.status === "completed") {
          forgetRun(key);
          setState({ following: null, result: row.result as T, error: null });
          return;
        }
        if (row?.status === "failed" || !row) {
          forgetRun(key);
          setState({
            following: null,
            result: null,
            error: row ? errorText(row.error) : "The run you started could not be found.",
          });
          return;
        }
      } catch (failure) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          error: `Could not check on the run (${failure instanceof Error ? failure.message : String(failure)}). Retrying.`,
        }));
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    let timer = window.setTimeout(() => void tick(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, active]);

  return { ...state, clear: () => setState({ following: null, result: null, error: null }) };
}
