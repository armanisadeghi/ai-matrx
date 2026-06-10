"use client";

/**
 * useCleanupSession — session lifecycle + persistence for the Transcription
 * Cleanup page, entirely on the STUDIO data model so sessions interop with
 * the transcript studio:
 *
 *   raw transcript  → studio_raw_segments   (mic chunk = one 'chunk' row;
 *                                            manual blob edit = replace-all
 *                                            with one 'manual' row)
 *   clean output    → studio_cleaned_segments (full-range pass, versioned via
 *                                            applyCleanupRun supersession)
 *   custom output   → studio_documents      (kind 'cleanup_custom')
 *   agents + context→ studio_session_settings (cleaning_shortcut_id holds the
 *                                            Clean agent id, module_shortcut_id
 *                                            the Custom agent id, context_items
 *                                            the structured items)
 *   runs            → studio_runs            (audit row per agent pass)
 *
 * Sessions are created with `source='cleanup'` so the studio's default list
 * never shows them (and vice versa). A session row is created LAZILY on first
 * content (`ensureSession`) or explicitly via `createNew`.
 *
 * Session selection is URL-driven (`?session=<id>`) via
 * `window.history.replaceState` — no RSC roundtrip on switch; this page is
 * high-volume and switching must be instant.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { getUserId } from "@/utils/auth/getUserId";
import {
  applyCleanupRun,
  createSession,
  deleteRawSegment,
  fetchSessionSettings,
  finalizeAgentRun,
  insertAgentRun,
  insertRawSegment,
  listCleanedSegments,
  listRawSegments,
  listStudioDocuments,
  softDeleteSession,
  updateCleanedSegmentText,
  updateSession,
  upsertSessionSettings,
  upsertStudioDocument,
} from "@/features/transcript-studio/service/studioService";
import {
  sessionRemoved,
  sessionUpserted,
} from "@/features/transcript-studio/redux/slice";
import { fetchSessionsThunk } from "@/features/transcript-studio/redux/thunks";
import {
  selectAllSessions,
  selectFetchStatus,
} from "@/features/transcript-studio/redux/selectors";
import type {
  SessionContextItem,
  StudioSession,
} from "@/features/transcript-studio/types";

export const CLEANUP_DOC_KIND = "cleanup_custom";
const NEW_CLEANUP_TITLE = "New Cleanup";
const RAW_SAVE_DEBOUNCE_MS = 1500;
const TEXT_SAVE_DEBOUNCE_MS = 1200;
const SETTINGS_SAVE_DEBOUNCE_MS = 800;

/** Everything loaded for the active session, in one immutable snapshot. */
export interface LoadedSessionContent {
  sessionId: string;
  rawText: string;
  rawSegmentCount: number;
  cleanText: string;
  customText: string;
  cleanAgentId: string | null;
  customAgentId: string | null;
  contextItems: SessionContextItem[];
  /** Display names for the persisted agent ids (best-effort). */
  agentNames: Record<string, string>;
}

interface AgentSelections {
  cleanAgentId: string;
  customAgentId: string | null;
}

function deriveTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 8).join(" ");
  return words.length > 48 ? `${words.slice(0, 48)}…` : words || NEW_CLEANUP_TITLE;
}

async function fetchAgentNames(
  ids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from("agx_agent")
    .select("id, name")
    .in("id", unique);
  if (error || !data) return {};
  return Object.fromEntries(
    (data as { id: string; name: string | null }[]).map((r) => [
      r.id,
      r.name ?? "Unnamed agent",
    ]),
  );
}

export function useCleanupSession() {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("session");

  const fetchStatus = useAppSelector(selectFetchStatus);
  const allSessions = useAppSelector(selectAllSessions);
  /**
   * Session list scope. "cleanup" (default) = this surface's own sessions;
   * "all" = every session RLS lets the user see — studio sessions, shared /
   * org / public sessions from other users included. Cross-surface access is
   * deliberate: a cleanup session is a real studio session and vice versa.
   */
  const [scope, setScope] = useState<"cleanup" | "all">("cleanup");
  const sessions = useMemo(
    () =>
      scope === "all"
        ? allSessions
        : allSessions.filter((s) => s.source === "cleanup"),
    [allSessions, scope],
  );

  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    urlSessionId,
  );
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [loaded, setLoaded] = useState<LoadedSessionContent | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  // ── Refs: DB row bookkeeping for the active session ───────────────────────
  const sessionRef = useRef<StudioSession | null>(null);
  sessionRef.current = activeSession;
  const rawSegmentsRef = useRef<{ id: string; text: string }[]>([]);
  const chunkIndexRef = useRef(0);
  const activeCleanedRef = useRef<{ id: string; passIndex: number } | null>(
    null,
  );
  const sessionStartedAtRef = useRef<number>(Date.now());
  const creatingRef = useRef<Promise<string> | null>(null);
  const agentsRef = useRef<AgentSelections | null>(null);
  const contextItemsRef = useRef<SessionContextItem[]>([]);
  const loadSeqRef = useRef(0);
  /**
   * Sessions created by THIS mount (ensureSession mid-draft / createNew).
   * Their content lives in local state and in-flight inserts — loading from
   * the DB would clobber it (or race the first insert), so the load effect
   * skips them. A reload/navigation gets the real DB state as usual.
   */
  const locallyCreatedRef = useRef<Set<string>>(new Set());

  // Debounce timers
  const rawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const elapsedSeconds = useCallback(() => {
    const startedAt = sessionRef.current?.startedAt
      ? new Date(sessionRef.current.startedAt).getTime()
      : sessionStartedAtRef.current;
    return Math.max(0, (Date.now() - startedAt) / 1000);
  }, []);

  // ── Session list (refetches when the scope toggles) ───────────────────────
  useEffect(() => {
    dispatch(
      fetchSessionsThunk({ source: scope === "all" ? "all" : "cleanup" }),
    );
  }, [dispatch, scope]);

  // ── URL-driven selection (no RSC roundtrip) ───────────────────────────────
  const setUrlSession = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("session", id);
    else url.searchParams.delete("session");
    window.history.replaceState(null, "", url.toString());
    setActiveSessionId(id);
  }, []);

  // Keep state in sync when the URL changes externally (back/forward).
  useEffect(() => {
    setActiveSessionId(urlSessionId);
  }, [urlSessionId]);

  // ── Load the active session's content ─────────────────────────────────────
  useEffect(() => {
    if (!activeSessionId) {
      setLoaded(null);
      setLoadState("idle");
      rawSegmentsRef.current = [];
      chunkIndexRef.current = 0;
      activeCleanedRef.current = null;
      return;
    }
    if (locallyCreatedRef.current.has(activeSessionId)) {
      // Fresh local session — refs are already correct and the content is in
      // the page's local state. Nothing to load.
      setLoadState("ready");
      return;
    }
    const seq = ++loadSeqRef.current;
    setLoadState("loading");
    (async () => {
      try {
        const [raw, cleaned, docs, settings] = await Promise.all([
          listRawSegments(activeSessionId),
          listCleanedSegments(activeSessionId),
          listStudioDocuments(activeSessionId),
          fetchSessionSettings(activeSessionId),
        ]);
        if (seq !== loadSeqRef.current) return; // superseded by a newer load

        rawSegmentsRef.current = raw.map((s) => ({ id: s.id, text: s.text }));
        chunkIndexRef.current =
          raw.length > 0 ? Math.max(...raw.map((s) => s.chunkIndex)) + 1 : 0;
        const latestCleaned =
          cleaned.length > 0 ? cleaned[cleaned.length - 1] : null;
        activeCleanedRef.current = latestCleaned
          ? {
              id: latestCleaned.id,
              passIndex: Math.max(...cleaned.map((c) => c.passIndex)),
            }
          : null;
        const customDoc =
          docs.find((d) => d.kind === CLEANUP_DOC_KIND) ?? null;

        const cleanAgentId = settings?.cleaningShortcutId ?? null;
        const customAgentId = settings?.moduleShortcutId ?? null;
        const contextItems = settings?.contextItems ?? [];
        contextItemsRef.current = contextItems;
        const agentNames = await fetchAgentNames(
          [cleanAgentId, customAgentId].filter(Boolean) as string[],
        );
        if (seq !== loadSeqRef.current) return;

        setLoaded({
          sessionId: activeSessionId,
          rawText: raw.map((s) => s.text).join("\n\n"),
          rawSegmentCount: raw.length,
          cleanText: cleaned.map((c) => c.text).join("\n\n"),
          customText: customDoc?.content ?? "",
          cleanAgentId,
          customAgentId,
          contextItems,
          agentNames,
        });
        setLoadState("ready");
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        console.error("[cleanup] session load failed:", err);
        toast.error("Could not load the session — try again");
        setLoadState("error");
      }
    })();
  }, [activeSessionId]);

  // ── Create / select / delete ───────────────────────────────────────────────
  const createNew = useCallback(async (): Promise<string | null> => {
    try {
      const userId = getUserId();
      if (!userId) {
        toast.error("Sign in to create a session");
        return null;
      }
      const session = await createSession(
        { title: NEW_CLEANUP_TITLE, source: "cleanup" },
        userId,
      );
      dispatch(sessionUpserted(session));
      locallyCreatedRef.current.add(session.id);
      sessionStartedAtRef.current = Date.now();
      rawSegmentsRef.current = [];
      chunkIndexRef.current = 0;
      activeCleanedRef.current = null;
      setUrlSession(session.id);
      return session.id;
    } catch (err) {
      console.error("[cleanup] createNew failed:", err);
      toast.error("Could not create a session");
      return null;
    }
  }, [dispatch, setUrlSession]);

  /**
   * Lazily create a session the moment the first real content appears.
   * Concurrent callers (mic completion + draft debounce) share one create.
   */
  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionRef.current) return sessionRef.current.id;
    if (activeSessionId) return activeSessionId;
    if (creatingRef.current) return creatingRef.current;
    const create = (async () => {
      const userId = getUserId();
      if (!userId) throw new Error("Not signed in");
      const session = await createSession(
        { title: NEW_CLEANUP_TITLE, source: "cleanup" },
        userId,
      );
      dispatch(sessionUpserted(session));
      locallyCreatedRef.current.add(session.id);
      sessionStartedAtRef.current = Date.now();
      setUrlSession(session.id);
      // Flush the current agent + context selections onto the new session so
      // settings chosen in draft mode aren't lost.
      const agents = agentsRef.current;
      await upsertSessionSettings({
        sessionId: session.id,
        cleaningShortcutId: agents?.cleanAgentId ?? null,
        moduleShortcutId: agents?.customAgentId ?? null,
        contextItems: contextItemsRef.current,
      });
      return session.id;
    })();
    creatingRef.current = create;
    try {
      return await create;
    } catch (err) {
      console.error("[cleanup] ensureSession failed:", err);
      toast.error("Could not create a session — your work is not being saved");
      return null;
    } finally {
      creatingRef.current = null;
    }
  }, [activeSessionId, dispatch, setUrlSession]);

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await softDeleteSession(id);
        dispatch(sessionRemoved(id));
        if (id === activeSessionId) setUrlSession(null);
        toast.success("Session deleted");
      } catch (err) {
        console.error("[cleanup] deleteSession failed:", err);
        toast.error("Could not delete the session");
      }
    },
    [activeSessionId, dispatch, setUrlSession],
  );

  // ── Raw transcript persistence ─────────────────────────────────────────────

  /** Mic completion → append one 'chunk' segment. Auto-titles the session. */
  const persistRawAppend = useCallback(
    async (text: string) => {
      const sessionId = await ensureSession();
      if (!sessionId) return;
      try {
        const t = elapsedSeconds();
        const seg = await insertRawSegment({
          sessionId,
          chunkIndex: chunkIndexRef.current++,
          tStart: t,
          tEnd: t,
          text,
          source: "chunk",
        });
        rawSegmentsRef.current.push({ id: seg.id, text: seg.text });
        const session = sessionRef.current;
        if (session && session.title === NEW_CLEANUP_TITLE) {
          const updated = await updateSession(sessionId, {
            title: deriveTitle(text),
          });
          dispatch(sessionUpserted(updated));
        }
      } catch (err) {
        console.error("[cleanup] persistRawAppend failed:", err);
        toast.error("Could not save the recording text");
      }
    },
    [dispatch, elapsedSeconds, ensureSession],
  );

  /**
   * Manual blob edit → debounced replace-all: the user rewrote the transcript,
   * so the DB representation becomes ONE 'manual' segment with the full text.
   * No-ops when the text already equals the joined segments.
   */
  const persistRawReplace = useCallback(
    (fullText: string) => {
      if (rawTimerRef.current) clearTimeout(rawTimerRef.current);
      rawTimerRef.current = setTimeout(async () => {
        const joined = rawSegmentsRef.current.map((s) => s.text).join("\n\n");
        if (fullText === joined) return;
        const sessionId = await ensureSession();
        if (!sessionId) return;
        try {
          const old = [...rawSegmentsRef.current];
          if (fullText.trim()) {
            const seg = await insertRawSegment({
              sessionId,
              chunkIndex: chunkIndexRef.current++,
              tStart: 0,
              tEnd: elapsedSeconds(),
              text: fullText,
              source: "manual",
            });
            rawSegmentsRef.current = [{ id: seg.id, text: seg.text }];
          } else {
            rawSegmentsRef.current = [];
          }
          await Promise.all(old.map((s) => deleteRawSegment(s.id)));
        } catch (err) {
          console.error("[cleanup] persistRawReplace failed:", err);
          toast.error("Could not save your transcript edits");
        }
      }, RAW_SAVE_DEBOUNCE_MS);
    },
    [elapsedSeconds, ensureSession],
  );

  /** Clear-all → delete every raw segment immediately. */
  const persistRawClear = useCallback(async () => {
    if (rawTimerRef.current) clearTimeout(rawTimerRef.current);
    const old = [...rawSegmentsRef.current];
    rawSegmentsRef.current = [];
    if (old.length === 0) return;
    try {
      await Promise.all(old.map((s) => deleteRawSegment(s.id)));
    } catch (err) {
      console.error("[cleanup] persistRawClear failed:", err);
      toast.error("Could not clear the saved transcript");
    }
  }, []);

  // ── Clean output persistence ───────────────────────────────────────────────

  /** Agent pass completed → audit run + versioned full-range cleaned segment. */
  const persistCleanRun = useCallback(
    async (text: string, agentId: string, conversationId: string | null) => {
      const sessionId = await ensureSession();
      if (!sessionId || !text.trim()) return;
      try {
        const run = await insertAgentRun({
          sessionId,
          columnIdx: 2,
          shortcutId: agentId,
          triggerCause: "manual",
        });
        const passIndex = (activeCleanedRef.current?.passIndex ?? 0) + 1;
        const seg = await applyCleanupRun({
          sessionId,
          runId: run.id,
          passIndex,
          tStart: 0,
          tEnd: elapsedSeconds(),
          text,
          triggerCause: "manual",
        });
        activeCleanedRef.current = { id: seg.id, passIndex };
        await finalizeAgentRun({
          id: run.id,
          status: "complete",
          conversationId,
        });
      } catch (err) {
        console.error("[cleanup] persistCleanRun failed:", err);
        toast.error("Could not save the cleaned transcript");
      }
    },
    [elapsedSeconds, ensureSession],
  );

  /** User edit of the Clean container → debounced in-place update. */
  const persistCleanEdit = useCallback(
    (text: string, agentId: string) => {
      if (cleanTimerRef.current) clearTimeout(cleanTimerRef.current);
      cleanTimerRef.current = setTimeout(async () => {
        const sessionId = await ensureSession();
        if (!sessionId) return;
        try {
          if (activeCleanedRef.current) {
            await updateCleanedSegmentText(activeCleanedRef.current.id, text);
          } else if (text.trim()) {
            // User typed into an empty Clean container — materialize a pass.
            await persistCleanRun(text, agentId, null);
          }
        } catch (err) {
          console.error("[cleanup] persistCleanEdit failed:", err);
          toast.error("Could not save your edits to the cleaned text");
        }
      }, TEXT_SAVE_DEBOUNCE_MS);
    },
    [ensureSession, persistCleanRun],
  );

  // ── Custom output persistence ──────────────────────────────────────────────

  const writeCustomDoc = useCallback(
    async (content: string) => {
      const sessionId = await ensureSession();
      if (!sessionId) return;
      try {
        await upsertStudioDocument(sessionId, CLEANUP_DOC_KIND, {
          content,
          title: "Custom Output",
        });
      } catch (err) {
        console.error("[cleanup] custom doc save failed:", err);
        toast.error("Could not save the custom output");
      }
    },
    [ensureSession],
  );

  /** Agent pass completed → save immediately. */
  const persistCustomRun = useCallback(
    async (text: string, agentId: string, conversationId: string | null) => {
      const sessionId = await ensureSession();
      if (!sessionId || !text.trim()) return;
      try {
        const run = await insertAgentRun({
          sessionId,
          columnIdx: 4,
          shortcutId: agentId,
          triggerCause: "manual",
        });
        await writeCustomDoc(text);
        await finalizeAgentRun({
          id: run.id,
          status: "complete",
          conversationId,
        });
      } catch (err) {
        console.error("[cleanup] persistCustomRun failed:", err);
        toast.error("Could not save the custom output");
      }
    },
    [ensureSession, writeCustomDoc],
  );

  /** User edit → debounced doc upsert. */
  const persistCustomEdit = useCallback(
    (text: string) => {
      if (customTimerRef.current) clearTimeout(customTimerRef.current);
      customTimerRef.current = setTimeout(() => {
        void writeCustomDoc(text);
      }, TEXT_SAVE_DEBOUNCE_MS);
    },
    [writeCustomDoc],
  );

  // ── Settings persistence (agents + context items) ──────────────────────────

  /** Track latest selections; persist (debounced) when a session exists. */
  const persistSettings = useCallback(
    (patch: {
      cleanAgentId?: string;
      customAgentId?: string | null;
      contextItems?: SessionContextItem[];
    }) => {
      if (patch.cleanAgentId !== undefined || patch.customAgentId !== undefined) {
        agentsRef.current = {
          cleanAgentId:
            patch.cleanAgentId ?? agentsRef.current?.cleanAgentId ?? "",
          customAgentId:
            patch.customAgentId !== undefined
              ? patch.customAgentId
              : (agentsRef.current?.customAgentId ?? null),
        };
      }
      if (patch.contextItems !== undefined) {
        contextItemsRef.current = patch.contextItems;
      }
      const sessionId = sessionRef.current?.id ?? activeSessionId;
      if (!sessionId) return; // flushed later by ensureSession
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
      settingsTimerRef.current = setTimeout(async () => {
        try {
          await upsertSessionSettings({
            sessionId,
            ...(agentsRef.current
              ? {
                  cleaningShortcutId: agentsRef.current.cleanAgentId || null,
                  moduleShortcutId: agentsRef.current.customAgentId,
                }
              : {}),
            contextItems: contextItemsRef.current,
          });
        } catch (err) {
          console.error("[cleanup] settings save failed:", err);
          toast.error("Could not save your session settings");
        }
      }, SETTINGS_SAVE_DEBOUNCE_MS);
    },
    [activeSessionId],
  );

  // Flush pending debounces on unmount (best-effort fire of saved closures).
  useEffect(() => {
    return () => {
      for (const t of [
        rawTimerRef.current,
        cleanTimerRef.current,
        customTimerRef.current,
        settingsTimerRef.current,
      ]) {
        if (t) clearTimeout(t);
      }
    };
  }, []);

  return {
    // list
    sessions,
    fetchStatus,
    scope,
    setScope,
    // selection
    activeSessionId,
    activeSession,
    selectSession: setUrlSession,
    createNew,
    deleteSession,
    // active-session content
    loadState,
    loaded,
    rawSegmentCount: rawSegmentsRef.current.length,
    // persistence
    ensureSession,
    persistRawAppend,
    persistRawReplace,
    persistRawClear,
    persistCleanRun,
    persistCleanEdit,
    persistCustomRun,
    persistCustomEdit,
    persistSettings,
    fetchAgentNames,
  };
}
