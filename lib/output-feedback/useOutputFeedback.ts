"use client";

/**
 * useOutputFeedback — the hook every thumbs button uses.
 *
 * Gives the current verdict, an optimistic `setVerdict` (clicking the active
 * verdict retracts it), and `captureCorrection` for the corrected-output pair.
 * Loads its own subject on mount when nothing has hydrated it; a surface that
 * shows many subjects at once should call `useHydrateOutputFeedback` with all
 * of the ids so the reads collapse into one query.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearOutputFeedback,
  fetchOutputFeedbackForSubjects,
  saveOutputFeedback,
  type SaveOutputFeedbackArgs,
} from "./service";
import {
  getOutputFeedbackRevision,
  hydrateOutputFeedback,
  peekOutputFeedback,
  setOutputFeedbackRecord,
  subscribeOutputFeedback,
} from "./store";
import type {
  OutputFeedbackRecord,
  OutputFeedbackSubject,
  OutputFeedbackVerdict,
} from "./types";

export interface UseOutputFeedbackOptions extends OutputFeedbackSubject {
  /** Replay handle — the agent request that produced this output. */
  requestId?: string | null;
  /** Surfaces-registry name of the capturing UI. */
  surfaceName?: string | null;
  /**
   * The output as the model produced it. Sent with the first write so the
   * frozen original is captured even when the user never edits — a later
   * correction then has something to be a correction *of*.
   */
  originalContent?: string | null;
  /** Skip the per-subject fetch (a parent already hydrated in batch). */
  skipFetch?: boolean;
}

export interface UseOutputFeedbackResult {
  record: OutputFeedbackRecord | null;
  verdict: OutputFeedbackVerdict | null;
  isLoaded: boolean;
  isSaving: boolean;
  /** Passing the currently-active verdict retracts it. */
  setVerdict: (verdict: OutputFeedbackVerdict) => Promise<void>;
  /** Store the corrected-output pair without touching an explicit verdict. */
  captureCorrection: (args: {
    correctedContent: string;
    originalContent?: string | null;
    correctedRefType?: string | null;
    correctedRefId?: string | null;
  }) => Promise<void>;
}

function useStoreRecord(
  subject: OutputFeedbackSubject,
): OutputFeedbackRecord | null | undefined {
  const { subjectType, subjectId } = subject;
  const revision = useSyncExternalStore(
    subscribeOutputFeedback,
    getOutputFeedbackRevision,
    () => 0,
  );
  // `revision` is the subscription; the value comes from the store map.
  void revision;
  return peekOutputFeedback({ subjectType, subjectId });
}

/** Batch-load feedback for many subjects at once (one query for a whole list). */
export function useHydrateOutputFeedback(
  subjectType: string,
  subjectIds: string[],
): void {
  const key = subjectIds.join(",");
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const missing = ids.filter(
      (id) => peekOutputFeedback({ subjectType, subjectId: id }) === undefined,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void fetchOutputFeedbackForSubjects(subjectType, missing)
      .then((found) => {
        if (!cancelled) hydrateOutputFeedback(subjectType, missing, found);
      })
      .catch((error: unknown) => {
        // Loud: a swallowed failure here renders every thumb as "no verdict".
        // eslint-disable-next-line no-console
        console.error("[useHydrateOutputFeedback] load failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectType, key]);
}

export function useOutputFeedback(
  options: UseOutputFeedbackOptions,
): UseOutputFeedbackResult {
  const {
    subjectType,
    subjectId,
    requestId,
    surfaceName,
    originalContent,
    skipFetch,
  } = options;
  const subject = { subjectType, subjectId };
  const stored = useStoreRecord(subject);
  const [isSaving, setIsSaving] = useState(false);

  // `originalContent` changes identity every render on some hosts; the write
  // path only needs the latest value, never a re-subscription.
  const originalRef = useRef(originalContent);
  originalRef.current = originalContent;

  useEffect(() => {
    if (skipFetch) return;
    if (peekOutputFeedback({ subjectType, subjectId }) !== undefined) return;
    let cancelled = false;
    void fetchOutputFeedbackForSubjects(subjectType, [subjectId])
      .then((found) => {
        if (!cancelled) {
          hydrateOutputFeedback(subjectType, [subjectId], found);
        }
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[useOutputFeedback] load failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectType, subjectId, skipFetch]);

  const write = useCallback(
    async (args: Omit<SaveOutputFeedbackArgs, "subjectType" | "subjectId">) => {
      const previous = peekOutputFeedback({ subjectType, subjectId }) ?? null;
      setIsSaving(true);
      try {
        const saved = await saveOutputFeedback({
          subjectType,
          subjectId,
          requestId,
          surfaceName,
          originalContent: args.originalContent ?? originalRef.current,
          ...args,
        });
        setOutputFeedbackRecord({ subjectType, subjectId }, saved);
      } catch (error) {
        setOutputFeedbackRecord({ subjectType, subjectId }, previous);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [subjectType, subjectId, requestId, surfaceName],
  );

  const setVerdict = useCallback(
    async (verdict: OutputFeedbackVerdict) => {
      const current = peekOutputFeedback({ subjectType, subjectId }) ?? null;
      if (current?.verdict === verdict) {
        // Toggle off — retract.
        setOutputFeedbackRecord({ subjectType, subjectId }, null);
        setIsSaving(true);
        try {
          await clearOutputFeedback({ subjectType, subjectId });
        } catch (error) {
          setOutputFeedbackRecord({ subjectType, subjectId }, current);
          throw error;
        } finally {
          setIsSaving(false);
        }
        return;
      }
      // Optimistic: paint the new verdict before the round trip.
      if (current) {
        setOutputFeedbackRecord({ subjectType, subjectId }, {
          ...current,
          verdict,
        });
      }
      await write({ verdict });
    },
    [subjectType, subjectId, write],
  );

  const captureCorrection = useCallback(
    async (args: {
      correctedContent: string;
      originalContent?: string | null;
      correctedRefType?: string | null;
      correctedRefId?: string | null;
    }) => {
      await write({
        correctedContent: args.correctedContent,
        originalContent: args.originalContent ?? originalRef.current,
        correctedRefType: args.correctedRefType,
        correctedRefId: args.correctedRefId,
      });
    },
    [write],
  );

  return {
    record: stored ?? null,
    verdict: stored?.verdict ?? null,
    isLoaded: stored !== undefined,
    isSaving,
    setVerdict,
    captureCorrection,
  };
}
