"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StatelessRatingResponse } from "../api/types";
import { useStatelessCalculate, WcRatingsError } from "../api/hooks";
import {
  buildStatelessPayload,
  evaluateDraftReadiness,
  hashDraft,
} from "./buildStatelessPayload";
import type { RatingDraft } from "./types";

const DEBOUNCE_MS = 350;

export interface LiveRatingState {
  result: StatelessRatingResponse | null;
  status: "idle" | "incomplete" | "calculating" | "ready" | "error";
  reason?: string;
  error?: WcRatingsError;
}

export function useLiveRating(draft: RatingDraft): LiveRatingState {
  const calculate = useStatelessCalculate();
  const calculateRef = useRef(calculate);
  calculateRef.current = calculate;

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const [state, setState] = useState<LiveRatingState>({
    result: null,
    status: "idle",
  });
  const lastFiredHash = useRef<string | null>(null);
  const inFlightRequestId = useRef(0);

  const draftHash = useMemo(() => hashDraft(draft), [draft]);
  const readiness = useMemo(() => evaluateDraftReadiness(draft), [draft]);
  const ready = readiness.ready;
  const reason = readiness.reason;

  useEffect(() => {
    if (!ready) {
      lastFiredHash.current = null;
      setState((prev) => {
        if (prev.status === "incomplete" && prev.reason === reason) return prev;
        return { result: null, status: "incomplete", reason };
      });
      return undefined;
    }

    if (lastFiredHash.current === draftHash) return undefined;

    const payload = buildStatelessPayload(draftRef.current);
    if (!payload) return undefined;

    const requestId = ++inFlightRequestId.current;
    lastFiredHash.current = draftHash;
    setState((prev) => {
      if (prev.status === "calculating") return prev;
      return { ...prev, status: "calculating" };
    });

    const timer = setTimeout(async () => {
      try {
        const result = await calculateRef.current.mutateAsync(payload);
        if (requestId !== inFlightRequestId.current) return;
        setState({ result, status: "ready" });
      } catch (err) {
        if (requestId !== inFlightRequestId.current) return;
        const wcErr =
          err instanceof WcRatingsError
            ? err
            : new WcRatingsError({
                error: {
                  type: "unknown",
                  message: err instanceof Error ? err.message : String(err),
                },
              });
        setState({ result: null, status: "error", error: wcErr });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draftHash, ready, reason]);

  return state;
}
