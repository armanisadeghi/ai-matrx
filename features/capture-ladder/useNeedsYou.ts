"use client";

/**
 * features/capture-ladder/useNeedsYou.ts
 *
 * "How many pages are waiting for a person right now?" — the ONE reader behind
 * the tray chip and `/capture/needs-you`. CONTRACT.md §8.1.
 *
 * Reads `media.capture_handoff` DIRECTLY through supabase-js (§3): org-scoped,
 * `status in ('waiting','needs_drive')`. Never through the Python server —
 * there is no outbound channel from aidream to a browser, and routing this read
 * through the server would buy nothing and break the extension's half of the
 * same queue.
 *
 * LIVENESS — two mechanisms, deliberately:
 *   • Postgres Changes on the table for this org, via `@ai-matrx/realtime`'s
 *     `useChannel` (the ONLY sanctioned door; a fresh `.channel(` in this repo
 *     is a review defect). A row event re-reads the list rather than patching
 *     it, because the events that matter here MOVE a row in or out of the queue
 *     — a claim, a needs-drive, a capture — and a patched list would need every
 *     one of those transitions re-implemented on the client.
 *   • A POLL FLOOR (60s, visible tabs only). Not belt-and-braces. VERIFIED
 *     2026-09-17 against the live database: `media.capture_handoff` is NOT in
 *     the `supabase_realtime` publication (`select … from
 *     pg_publication_tables where pubname='supabase_realtime'` returns no
 *     `media` row at all). A subscription to an unpublished table joins, says
 *     SUBSCRIBED and delivers NOTHING, forever, with no error anywhere — which
 *     is precisely the silent lie this feature is not allowed to tell. So the
 *     floor is not a backstop today, it is THE mechanism; realtime is the
 *     optimisation that switches itself on the day somebody runs
 *       ALTER PUBLICATION supabase_realtime ADD TABLE media.capture_handoff;
 *     `onBackfill` is what makes it true after a laptop sleep.
 *
 *     Because of that, `liveness` below never claims "live" on the strength of
 *     a SUBSCRIBED status alone: a screen says what it can prove.
 *
 * realtime-publication: media.capture_handoff
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  CAPTURE_HANDOFF_SCHEMA,
  CAPTURE_HANDOFF_TABLE,
  droppedRowsSentence,
  fetchNeedsYouHandoffs,
} from "@/features/capture-ladder/captureHandoffTable";
import type { CaptureHandoff } from "@/features/capture-ladder/types";

/** One place names this channel — a second, different declaration throws. */
const needsYouChannel = defineChannelNamespace({
  namespace: "capture-handoff-needs-you",
  parts: ["organizationId"],
  description:
    "media.capture_handoff rows for one organization — the pages waiting for a person's own browser",
});

/** A burst of row events deserves ONE re-read. */
const REFETCH_DEBOUNCE_MS = 300;

/** The poll floor. Realtime is the fast path; this is the one that cannot lie. */
const POLL_INTERVAL_MS = 60_000;

/**
 * How fresh this list actually is, in terms a screen can say out loud.
 *
 * `polling` is the HONEST default, not a failure: the table is not published
 * for realtime, so a minute is genuinely the resolution we have. `degraded` is
 * the connection itself being down, which also costs us `onBackfill` — the
 * list is then only as fresh as the last poll that landed.
 */
export type NeedsYouLiveness = "live" | "polling" | "degraded";

export type NeedsYouState =
  /** No organization selected yet — nothing to read, and not an error. */
  | { kind: "no_organization" }
  | { kind: "loading" }
  | {
      kind: "ready";
      handoffs: CaptureHandoff[];
      /** Rows the ingress parse refused. Announced, never silently missing. */
      dropped: number;
    }
  /** The table does not exist on this database yet. Said out loud, never as an empty list. */
  | { kind: "not_provisioned"; sentence: string }
  | { kind: "failed"; sentence: string };

export interface UseNeedsYouResult {
  state: NeedsYouState;
  /** The rows, or `[]` in every state that has none. Convenience for the tray. */
  handoffs: CaptureHandoff[];
  /** How many pages need a person or their browser right now. */
  count: number;
  /** Of those, how many the person must click through themselves. */
  needsDriveCount: number;
  /** Re-read now. Safe to call from anywhere; the hook owns the in-flight state. */
  refresh: () => void;
  /** How fresh this list is. The screen says it; it is never assumed. */
  liveness: NeedsYouLiveness;
  /** That freshness as ONE sentence, or `null` when there is nothing to say. */
  livenessSentence: string | null;
  /** Rows the ingress parse refused, as a sentence, or `null` when none were. */
  droppedSentence: string | null;
}

/** The one place the liveness sentences are worded. */
export function livenessSentenceFor(liveness: NeedsYouLiveness): string | null {
  switch (liveness) {
    case "live":
      return null;
    case "polling":
      return "This list checks for new pages every minute rather than the instant they arrive. Press refresh if you are waiting on one.";
    case "degraded":
      return "The live connection is down, so this list is only as new as its last check a minute ago. Press refresh to check right now.";
  }
}

export function useNeedsYou(): UseNeedsYouResult {
  const organizationId = useAppSelector(selectOrganizationId);
  const [state, setState] = useState<NeedsYouState>(
    organizationId ? { kind: "loading" } : { kind: "no_organization" },
  );

  // Guards a read's result against landing after the org changed underneath it.
  const readToken = useRef(0);

  const load = useCallback(async () => {
    if (!organizationId) {
      setState({ kind: "no_organization" });
      return;
    }
    const token = ++readToken.current;
    const result = await fetchNeedsYouHandoffs(organizationId);
    if (readToken.current !== token) return;
    if (result.kind === "ok") {
      setState({
        kind: "ready",
        handoffs: result.handoffs,
        dropped: result.dropped,
      });
      return;
    }
    setState(result);
  }, [organizationId]);

  // ── The debounced re-read every liveness path funnels through ──────────────
  const loadRef = useRef(load);
  loadRef.current = load;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void loadRef.current();
    }, REFETCH_DEBOUNCE_MS);
  }, []);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // ── The poll floor ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadRef.current();
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [organizationId]);

  // ── Postgres Changes ──────────────────────────────────────────────────────
  const { status: channelStatus } = useChannel(
    organizationId
      ? {
          topic: needsYouChannel.topic({ organizationId }),
          postgresChanges: [
            {
              event: "*",
              schema: CAPTURE_HANDOFF_SCHEMA,
              table: CAPTURE_HANDOFF_TABLE,
              filter: `organization_id=eq.${organizationId}`,
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              onChange: () => scheduleReload(),
            },
          ],
          // Realtime has no replay: reconnect, tab wake, network restore and
          // queue overflow all re-read rather than leave a chip that lies.
          onBackfill: () => scheduleReload(),
        }
      : null,
  );

  const handoffs = state.kind === "ready" ? state.handoffs : EMPTY;

  // THE HONEST ANSWER. A SUBSCRIBED channel on an unpublished table delivers
  // nothing while looking perfectly healthy, so "connected" is NOT allowed to
  // buy the word "live" here — see the header. The day the table is published,
  // flip REALTIME_PUBLISHED and this reads "live" with no other change.
  const liveness: NeedsYouLiveness = !organizationId
    ? "polling"
    : channelStatus === "connected"
      ? REALTIME_PUBLISHED
        ? "live"
        : "polling"
      : "degraded";
  const needsDriveCount = useMemo(
    () => handoffs.filter((h) => h.status === "needs_drive").length,
    [handoffs],
  );

  return {
    state,
    handoffs,
    count: handoffs.length,
    needsDriveCount,
    refresh: scheduleReload,
    liveness,
    livenessSentence: livenessSentenceFor(liveness),
    droppedSentence:
      state.kind === "ready" ? droppedRowsSentence(state.dropped) : null,
  };
}

/**
 * Whether `media.capture_handoff` is in the `supabase_realtime` publication.
 *
 * `false`, verified against the live database on 2026-09-17. This constant
 * exists so the claim a SCREEN makes about freshness is a fact somebody
 * checked, not an inference from a channel status that cannot see the
 * publication. Flip it in the same change that runs the ALTER PUBLICATION.
 */
const REALTIME_PUBLISHED = false;

/** One frozen empty array — a fresh `[]` per render re-runs every memo below it. */
const EMPTY: CaptureHandoff[] = [];
