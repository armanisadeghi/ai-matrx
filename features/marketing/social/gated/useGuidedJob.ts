"use client";

/**
 * Live status of ONE capture job (a `media.capture_handoff` row).
 *
 * Realtime is the fast path (`@ai-matrx/realtime`'s `useChannel`, the one
 * sanctioned door, same publication the needs-you tray uses); a short poll and
 * a re-read on tab focus are the floor that cannot lie — the person leaves for
 * the other tab and comes back, and the result has to be here WITHOUT them
 * touching anything. Polling stops once the job is terminal.
 *
 * realtime-publication: media.capture_handoff
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import { createClient } from "@/utils/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAPTURE_HANDOFF_SCHEMA,
  CAPTURE_HANDOFF_TABLE,
  parseCaptureHandoff,
} from "@/features/capture-ladder/captureHandoffTable";
import type { CaptureHandoff } from "@/features/capture-ladder/types";
import { guidedView, type GuidedView } from "./guidedJob";

const guidedJobChannel = defineChannelNamespace({
  namespace: "social-guided-capture-job",
  parts: ["jobId"],
  description: "One media.capture_handoff row: the guided capture the person is on",
});

const POLL_MS = 4_000;
const DEBOUNCE_MS = 250;

export interface UseGuidedJobResult {
  row: CaptureHandoff | null;
  view: GuidedView | null;
  /** A sentence when the status could not be read; never an empty "all fine". */
  readError: string | null;
}

export function useGuidedJob(
  jobId: string | null,
  initial?: CaptureHandoff | null,
): UseGuidedJobResult {
  const [row, setRow] = useState<CaptureHandoff | null>(initial ?? null);
  const [readError, setReadError] = useState<string | null>(null);
  const token = useRef(0);

  const load = useCallback(async () => {
    if (!jobId) return;
    const mine = ++token.current;
    const client = createClient() as unknown as SupabaseClient;
    const { data, error } = await client
      .schema(CAPTURE_HANDOFF_SCHEMA)
      .from(CAPTURE_HANDOFF_TABLE)
      .select("*")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();
    if (token.current !== mine) return;
    if (error) {
      setReadError(`We could not check on this capture just now: ${error.message}`);
      return;
    }
    setReadError(null);
    const parsed = data ? parseCaptureHandoff(data) : null;
    if (parsed) setRow(parsed);
  }, [jobId]);

  const loadRef = useRef(load);
  loadRef.current = load;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void loadRef.current();
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    setRow(initial && initial.id === jobId ? initial : null);
    setReadError(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, load]);

  const view = row ? guidedView(row) : null;
  const terminal = view?.terminal ?? false;

  // The floor: poll while the job can still change, and re-read the moment the
  // person comes back to this tab.
  useEffect(() => {
    if (!jobId || terminal) return;
    const id = setInterval(() => {
      if (!document.hidden) void loadRef.current();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void loadRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [jobId, terminal]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useChannel(
    jobId && !terminal
      ? {
          topic: guidedJobChannel.topic({ jobId }),
          postgresChanges: [
            {
              event: "*",
              schema: CAPTURE_HANDOFF_SCHEMA,
              table: CAPTURE_HANDOFF_TABLE,
              rowId: (r) => (typeof r.id === "string" ? r.id : undefined),
              onChange: () => schedule(),
            },
          ],
          onBackfill: () => schedule(),
        }
      : null,
  );

  return { row, view, readError };
}
