"use client";

/**
 * The Press Room — the data layer.
 *
 * ONE seam. Every component below this file is a pure function of DB rows, and
 * this hook is the only place that knows where the rows came from. Swapping the
 * fixture module for a Supabase select (or a react-query hook against
 * `features/marketing/data`) is a change to `loadPressRoom` and nothing else.
 *
 * The states are NOT decoration and they are not skipped because the rows are
 * fixtures (ground-rules §1 still binds for everything except the row source):
 *
 *   loading  → skeleton that matches the real layout, so nothing shifts
 *   stalled  → the load is taking abnormally long; we say so and offer a retry
 *              WITHOUT abandoning the in-flight attempt
 *   error    → designed, named, retryable
 *   empty    → the honest "no angles yet" with the one action that fixes it
 *
 * `?data=` on the route forces a state so a reviewer can actually SEE each one
 * without breaking the backend. It defaults to the real path.
 *
 * `now` lives here too. It is resolved after mount (never during SSR) so the
 * countdowns cannot hydrate-mismatch, and it re-ticks every 30 seconds so the
 * deadline rail is genuinely live rather than a rendering of page-load time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Json } from "@/types/database.types";

import { buildPressRoomFixture, type PressRoomData } from "./fixtures";
import type { PressRoomScenario } from "./scenario";
import {
  readEvidenceRefs,
  readMissingEvidence,
  readProofRequired,
  type AngleStatus,
  type SourceRequestStatus,
} from "./types";


/** How long a load may run before we tell the user it is unusually slow. */
const STALL_AFTER_MS = 8_000;
/** Deadline countdowns re-render on this cadence. */
const TICK_MS = 30_000;

type LoadState =
  | { status: "loading" }
  | { status: "stalled" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: PressRoomData };

export interface PressRoomController {
  state: LoadState;
  /** Mount-resolved wall clock, re-ticked every 30s. */
  now: Date;
  reload: () => void;
  /** Real, in-memory status transition. Returns false when the row is gone. */
  setAngleStatus: (id: string, status: AngleStatus) => boolean;
  setRequestStatus: (id: string, status: SourceRequestStatus) => boolean;
  /**
   * Move one `missing_evidence` entry into `evidence_refs` — "I have this now".
   * A real transition over the real columns: the ladder, the evidence count,
   * and the "N things away from pitchable" line all recompute from it.
   */
  resolveMissingEvidence: (angleId: string, key: string) => boolean;
}

function loadPressRoom(
  scenario: PressRoomScenario,
  now: Date,
  signal: AbortSignal,
): Promise<PressRoomData> {
  // The fixture seam. A real implementation awaits supabase here; the shape of
  // the promise, the abort handling, and every consumer stay identical.
  return new Promise<PressRoomData>((resolve, reject) => {
    if (scenario === "stalled") {
      // Deliberately never settles — this is what a hung read looks like.
      signal.addEventListener("abort", () =>
        reject(new Error("Load cancelled")),
      );
      return;
    }
    const timer = setTimeout(() => {
      if (signal.aborted) return;
      if (scenario === "error") {
        reject(
          new Error(
            "seo.story_angle: permission denied for schema seo (RLS). The site you opened may not belong to your organization.",
          ),
        );
        return;
      }
      if (scenario === "empty") {
        resolve({ angles: [], requests: [], coverage: [] });
        return;
      }
      resolve(buildPressRoomFixture(now));
    }, 260);
    signal.addEventListener("abort", () => clearTimeout(timer));
  });
}

export function usePressRoom(
  scenario: PressRoomScenario,
): PressRoomController {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [now, setNow] = useState<Date>(() => new Date(0));
  const [attempt, setAttempt] = useState(0);
  const dataRef = useRef<PressRoomData | null>(null);

  // Scenario changed (a URL edit, not a remount): reset to loading DURING
  // RENDER rather than in an effect — the sanctioned "adjust state when a prop
  // changes" pattern, and the reason no effect below calls setState in its body.
  const [loadedScenario, setLoadedScenario] = useState(scenario);
  if (loadedScenario !== scenario) {
    setLoadedScenario(scenario);
    setState({ status: "loading" });
  }

  // The clock ticks from an interval CALLBACK, and its first real value is set
  // when the load settles. `now` therefore starts at epoch on both server and
  // client, so the countdowns cannot hydrate-mismatch, and it is real by the
  // time any deadline is on screen.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const stallTimer = window.setTimeout(() => {
      setState((current) =>
        current.status === "loading" ? { status: "stalled" } : current,
      );
    }, STALL_AFTER_MS);

    loadPressRoom(scenario, new Date(), controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        dataRef.current = data;
        setNow(new Date());
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setNow(new Date());
        setState({ status: "error", error });
      })
      .finally(() => window.clearTimeout(stallTimer));

    return () => {
      window.clearTimeout(stallTimer);
      controller.abort();
    };
  }, [scenario, attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const setAngleStatus = useCallback(
    (id: string, status: AngleStatus): boolean => {
      const data = dataRef.current;
      if (!data) return false;
      const index = data.angles.findIndex((row) => row.id === id);
      if (index < 0) return false;
      const stamp = new Date().toISOString();
      const stampField =
        status === "accepted"
          ? "accepted_at"
          : status === "pitched"
            ? "pitched_at"
            : status === "landed"
              ? "landed_at"
              : status === "dismissed"
                ? "dismissed_at"
                : null;
      const next = [...data.angles];
      next[index] = {
        ...next[index],
        status,
        updated_at: stamp,
        version: next[index].version + 1,
        ...(stampField ? { [stampField]: stamp } : {}),
      };
      dataRef.current = { ...data, angles: next };
      setState({ status: "ready", data: dataRef.current });
      return true;
    },
    [],
  );

  const setRequestStatus = useCallback(
    (id: string, status: SourceRequestStatus): boolean => {
      const data = dataRef.current;
      if (!data) return false;
      const index = data.requests.findIndex((row) => row.id === id);
      if (index < 0) return false;
      const stamp = new Date().toISOString();
      const next = [...data.requests];
      next[index] = {
        ...next[index],
        status,
        updated_at: stamp,
        version: next[index].version + 1,
        ...(status === "submitted" ? { submitted_at: stamp } : {}),
        ...(status === "won" ? { won_at: stamp } : {}),
      };
      dataRef.current = { ...data, requests: next };
      setState({ status: "ready", data: dataRef.current });
      return true;
    },
    [],
  );

  const resolveMissingEvidence = useCallback(
    (angleId: string, key: string): boolean => {
      const data = dataRef.current;
      if (!data) return false;
      const index = data.angles.findIndex((row) => row.id === angleId);
      if (index < 0) return false;
      const angle = data.angles[index];
      const missing = readMissingEvidence(angle.missing_evidence).items;
      const target = missing.find((item) => item.key === key);
      if (!target) return false;

      const stamp = new Date().toISOString();
      const nextMissing = missing.filter((item) => item.key !== key);
      const nextRefs = [
        ...readEvidenceRefs(angle.evidence_refs).items,
        {
          key: target.key,
          label: target.label,
          source: "Confirmed by you",
          url: null,
          captured_at: stamp,
        },
      ];
      // evidence_quality is a real column, and it genuinely improves when a
      // required proof lands. Recomputed from the ladder, never invented.
      const required = Math.max(
        1,
        readProofRequired(angle.proof_required).items.length,
      );
      const held = required - nextMissing.length;
      const next = [...data.angles];
      next[index] = {
        ...angle,
        missing_evidence: nextMissing as unknown as Json,
        evidence_refs: nextRefs as unknown as Json,
        evidence_quality: Math.round((held / required) * 100),
        updated_at: stamp,
        human_reviewed_at: stamp,
        version: angle.version + 1,
      };
      dataRef.current = { ...data, angles: next };
      setState({ status: "ready", data: dataRef.current });
      return true;
    },
    [],
  );

  return useMemo(
    () => ({
      state,
      now,
      reload,
      setAngleStatus,
      setRequestStatus,
      resolveMissingEvidence,
    }),
    [
      state,
      now,
      reload,
      setAngleStatus,
      setRequestStatus,
      resolveMissingEvidence,
    ],
  );
}
