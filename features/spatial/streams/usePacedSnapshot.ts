"use client";

/**
 * ZOOM-PACED COMMIT — the read-side throttle between a stream source and a
 * tile's render.
 *
 * Every token still lands in the source at full rate. This hook only decides
 * WHEN the tile re-renders what has arrived, by the tile's pace tier:
 *   read → every animation frame · glance / overview → on the tier interval ·
 *   offscreen → never (one catch-up commit on re-entry).
 * Stepping to a more detailed tier commits immediately, so zooming in always
 * shows the latest text without waiting out an interval.
 *
 * Returns the committed snapshot, a monotonically increasing `seq` (bumped per
 * commit, so the tile can land each batch with a reveal) and that reveal's
 * duration for the current tier (0 at read tier: token-level motion IS the
 * animation).
 */

import { useEffect, useRef, useState } from "react";
import { type PaceTier, PACE_MS, revealMsForTier, shouldCommit } from "../engine/lod";
import type { PacedSource, StreamSnapshot } from "./stream-source";

export interface PacedSnapshot {
  snapshot: StreamSnapshot;
  seq: number;
  revealMs: number;
}

export function usePacedSnapshot(source: PacedSource, tier: PaceTier): PacedSnapshot {
  const [committed, setCommitted] = useState<{ snapshot: StreamSnapshot; seq: number }>(() => ({
    snapshot: source.get(),
    seq: 0,
  }));
  const pending = useRef(false);
  const lastCommitAt = useRef(0);
  const lastCommitTier = useRef<PaceTier>(tier);
  /** The snapshot object last handed to React — compared at (re)subscribe to
   * detect a change that arrived while the effect was torn down. */
  const committedSource = useRef<StreamSnapshot>(committed.snapshot);

  useEffect(() => {
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const commit = () => {
      pending.current = false;
      lastCommitAt.current = performance.now();
      lastCommitTier.current = tier;
      const next = source.get();
      committedSource.current = next;
      setCommitted((prev) => ({ snapshot: next, seq: prev.seq + 1 }));
    };

    const evaluate = () => {
      frame = null;
      timer = null;
      const since = performance.now() - lastCommitAt.current;
      if (
        shouldCommit({
          pending: pending.current,
          tier,
          lastCommitTier: lastCommitTier.current,
          msSinceLastCommit: since,
        })
      ) {
        commit();
        return;
      }
      if (!pending.current || tier === "offscreen") return;
      const wait = PACE_MS[tier] - since;
      timer = setTimeout(evaluate, Math.max(16, wait));
    };

    const onChange = () => {
      pending.current = true;
      if (tier === "read") {
        if (frame === null) frame = requestAnimationFrame(evaluate);
      } else if (timer === null && tier !== "offscreen") {
        evaluate();
      }
    };

    // The source may have moved while this effect was torn down (tier change).
    if (source.get() !== committedSource.current) pending.current = true;
    evaluate();
    const unsubscribe = source.subscribe(onChange);
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [source, tier]);

  return {
    snapshot: committed.snapshot,
    seq: committed.seq,
    revealMs: revealMsForTier(tier),
  };
}
