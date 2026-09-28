"use client";

// features/crm/pitch-advisories/usePitchAdvisories.ts
//
// Runs the ONE shared pitch check for a surface and hands the result to
// <PitchAdvisoryPanel>. `recordGoAhead` is what the host's action button calls
// before it acts: it records the warnings the person saw, and it NEVER stops
// the action — a failed record is announced and the action proceeds.

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import {
  checkPitchAdvisories,
  recordAdvisoryGoAhead,
  type PitchAdvisoryReport,
  type PitchAdvisoryRequest,
} from "./service";

export interface PitchAdvisoryState {
  report: PitchAdvisoryReport | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  /** Call from the action button before acting. Resolves once recorded (or failed loudly). */
  recordGoAhead: (entity?: {
    entityType?: string | null;
    entityId?: string | null;
    choice?: string;
  }) => Promise<void>;
}

export function usePitchAdvisories(
  organizationId: string | null | undefined,
  request: PitchAdvisoryRequest | null,
): PitchAdvisoryState {
  const [report, setReport] = useState<PitchAdvisoryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // One identity for "the same question": re-asked only when an input changes.
  const key = organizationId && request ? JSON.stringify(request) : null;

  useEffect(() => {
    if (!key || !organizationId) {
      setReport(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    checkPitchAdvisories(organizationId, JSON.parse(key) as PitchAdvisoryRequest)
      .then((next) => {
        if (!cancelled) setReport(next);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setReport(null);
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, organizationId, attempt]);

  async function recordGoAhead(entity?: {
    entityType?: string | null;
    entityId?: string | null;
    choice?: string;
  }) {
    if (!organizationId || !request || !report) return;
    const failure = await recordAdvisoryGoAhead({
      organizationId,
      surface: request.surface,
      entityType: entity?.entityType,
      entityId: entity?.entityId,
      advisories: report.advisories ?? [],
      choice: entity?.choice,
    });
    if (failure) {
      // Loud, never blocking: the action still goes ahead.
      toast.warning(
        `Going ahead — but we could not record that you saw the pitch warnings (${failure.message}).`,
      );
    }
  }

  return {
    report,
    loading,
    error,
    retry: () => setAttempt((n) => n + 1),
    recordGoAhead,
  };
}
