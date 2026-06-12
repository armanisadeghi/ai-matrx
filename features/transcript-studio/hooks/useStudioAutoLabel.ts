"use client";

/**
 * Auto-label a studio session from its raw transcript content.
 *
 * Strategy: once the FIRST recording finishes (its segment has `endedAt`), make
 * ONE call to the GLiNER2 labeler (`POST /api/content-label` on the Python
 * backend) using that recording's transcript, then persist the returned label
 * to the session row. This is the fast/cheap encoder labeler — not the LLM
 * auto-ingest NER pipeline. We wait for a full recording so the label reflects
 * a complete thought, not the first half-sentence streamed mid-capture.
 *
 * Guard rails (the whole reason this hook is careful):
 *   - Fires AT MOST ONCE per session (`requestedRef`), reset on session change.
 *   - Only when the current title is still a placeholder ("New Session", etc.).
 *     The moment the user picks their own title, the hook stops for good — we
 *     never overwrite a custom label.
 *   - Re-checks the live title at resolve time, so a manual rename DURING the
 *     in-flight call always wins over the late-arriving auto label.
 *   - On any backend failure it falls back to the local prose heuristic
 *     (`generateLabelFromContent`) so a session still gets a usable title.
 */

import { useEffect, useRef } from "react";
import { generateLabelFromContent } from "@/features/notes/hooks/useAutoLabel";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { useBackendApi } from "@/hooks/useBackendApi";
import {
  selectRawSegmentsForRecording,
  selectRecordingSegments,
} from "../redux/selectors";
import { updateSessionThunk } from "../redux/thunks";
import { NEW_SESSION_DEFAULT_TITLE } from "../constants";

const TITLE_MIN_CHARS = 8;
const TITLE_MAX_LEN = 50;
/** Cap the text we send — the head of the transcript is plenty for a label. */
const LABEL_INPUT_MAX_CHARS = 8000;
const PLACEHOLDER_TITLES = new Set([
  NEW_SESSION_DEFAULT_TITLE.toLowerCase(),
  "new studio session",
  "untitled",
  "",
]);

function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLES.has(title.trim().toLowerCase());
}

interface UseStudioAutoLabelOptions {
  sessionId: string;
  currentTitle: string;
}

export function useStudioAutoLabel({
  sessionId,
  currentTitle,
}: UseStudioAutoLabelOptions) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const api = useBackendApi();
  const recordings = useAppSelector(selectRecordingSegments(sessionId));
  const firstRecording = recordings[0] ?? null;
  // The first recording is "done" once its segment carries an `endedAt`
  // (finalize / reconcile stamps it). Only then do we label.
  const firstRecordingDone = Boolean(firstRecording?.endedAt);
  const firstRecordingRaws = useAppSelector(
    selectRawSegmentsForRecording(sessionId, firstRecording?.id ?? null),
  );

  const requestedRef = useRef(false);
  const lastSeenSessionId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight label request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    // Each session gets its own one-shot chance.
    if (lastSeenSessionId.current !== sessionId) {
      lastSeenSessionId.current = sessionId;
      requestedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    }

    if (requestedRef.current) return;

    // Custom title already in place — never auto-label this session.
    if (!isPlaceholderTitle(currentTitle)) {
      requestedRef.current = true;
      return;
    }

    // Wait for the FIRST recording to finish before labeling.
    if (!firstRecordingDone) return;

    // Build the candidate text from that recording's transcript.
    const head = firstRecordingRaws
      .map((s) => s.text)
      .join(" ")
      .trim();
    // Nothing was captured (e.g. a silent first recording) — leave the title as
    // the placeholder for the user to rename. We don't mark the one-shot yet, so
    // if late chunks arrive for this recording we still get a chance.
    if (head.length < TITLE_MIN_CHARS) return;

    // One-shot from here, regardless of outcome.
    requestedRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    /** Persist only if the session is STILL a placeholder (manual rename wins). */
    const persistIfStillPlaceholder = (label: string) => {
      const trimmed = label.trim().slice(0, TITLE_MAX_LEN);
      if (!trimmed) return;
      const liveTitle =
        store.getState().transcriptStudio.byId[sessionId]?.title ??
        currentTitle;
      if (!isPlaceholderTitle(liveTitle)) return;
      if (trimmed.toLowerCase() === liveTitle.trim().toLowerCase()) return;
      void dispatch(
        updateSessionThunk({ id: sessionId, patch: { title: trimmed } }),
      );
    };

    void (async () => {
      try {
        const res = await api.post(
          "/api/content-label",
          {
            text: head.slice(0, LABEL_INPUT_MAX_CHARS),
            content_type: "transcript",
            label_max_chars: TITLE_MAX_LEN,
          },
          controller.signal,
        );
        const data = (await res.json()) as { label?: string };
        const label = (data?.label ?? "").trim();
        if (!label) throw new Error("content-label returned an empty label");
        persistIfStillPlaceholder(label);
      } catch (err) {
        if (controller.signal.aborted) return;
        // Backend unavailable / errored — fall back to the local prose
        // heuristic so the session still gets a usable title.
        // eslint-disable-next-line no-console
        console.warn(
          "[studio] content-label failed; using local heuristic instead:",
          err,
        );
        const generated = generateLabelFromContent(head, TITLE_MAX_LEN);
        if (generated) persistIfStillPlaceholder(generated);
      }
    })();
  }, [
    sessionId,
    currentTitle,
    firstRecordingDone,
    firstRecordingRaws,
    api,
    dispatch,
    store,
  ]);
}
