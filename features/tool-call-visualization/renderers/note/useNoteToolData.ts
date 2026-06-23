"use client";

/**
 * useNoteToolData — shared data layer for the `note` tool renderer.
 *
 * The `note` tool result is intentionally tiny — `{ id, label, updated_at }`.
 * It carries NO content. This hook bridges that gap: it parses the result,
 * pulls the live note out of the notes Redux slice (fetching the full body on
 * demand), and exposes everything the inline + overlay renderers need to show
 * a real, editable note card — content, stats, folder, save status, and a
 * debounced content writer that round-trips through the canonical notes thunks.
 *
 * Single source of truth: this hook owns ALL data access for the renderer so
 * the inline and overlay views stay perfectly in sync.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import { faviconRouteData } from "@/constants/favicon-route-data";
import {
  selectNoteById,
  selectNoteContent,
  selectNoteFolder,
  selectNoteLabel,
  selectNoteFetchStatus,
  selectNoteIsLoading,
  selectNoteSaveState,
} from "@/features/notes/redux/selectors";
import { fetchNoteContent, saveNote } from "@/features/notes/redux/thunks";
import { updateNoteContent } from "@/features/notes/redux/slice";
import {
  computeNoteStats,
  type NoteStats,
} from "@/features/notes/utils/noteStats";

import { resultAsObject } from "../_shared";

/**
 * The notes route identity color — the same value the favicon/tab uses.
 * Derived from the canonical route metadata so this renderer follows any
 * future change to the notes accent instead of hardcoding a magic hex.
 */
export const NOTE_ACCENT =
  faviconRouteData.find((r) => r.href === "/notes")?.favicon?.color ?? "#d97706";

export type NoteToolMode = "preview" | "edit";

export interface ParsedNoteResult {
  id: string | null;
  label: string | null;
  updatedAt: string | null;
}

/** Parse the `note` tool result defensively (object-or-JSON-string). */
export function parseNoteResult(entry: ToolLifecycleEntry): ParsedNoteResult {
  const r = resultAsObject(entry);
  return {
    id: typeof r?.id === "string" ? r.id : null,
    label: typeof r?.label === "string" ? r.label : null,
    updatedAt: typeof r?.updated_at === "string" ? r.updated_at : null,
  };
}

export interface NoteToolData {
  /** Note UUID (from the result). `null` when the result is malformed. */
  noteId: string | null;
  /** Best-available label: live slice value, falling back to the result. */
  label: string;
  /** Live markdown content. `undefined` until the body is fetched. */
  content: string | undefined;
  /** Folder name, if the note lives in one. */
  folder: string | undefined;
  /** Best-available updated timestamp (live slice value first). */
  updatedAt: string | null;
  /** Created timestamp, once the full note is loaded. */
  createdAt: string | null;
  /** Note version number, once loaded. */
  version: number | null;
  /** Tags on the note, once loaded. */
  tags: string[];
  /** Derived content metrics (words / chars / reading time …). */
  stats: NoteStats;
  /** True once the full body has been hydrated from the server. */
  isLoaded: boolean;
  /** True while the body is being fetched. */
  isLoading: boolean;
  /** Live save status of any inline edits. */
  saveState: "saved" | "dirty" | "saving" | "conflict";
  /** Write content (optimistic) + debounced persist. */
  setContent: (value: string) => void;
  /** Persist immediately (e.g. on blur). */
  flushSave: () => void;
}

const EMPTY_TAGS: string[] = [];

/**
 * Drive a `note` tool renderer from its lifecycle entry. Handles fetch,
 * selectors, derived stats, and debounced editing in one place.
 */
export function useNoteToolData(entry: ToolLifecycleEntry): NoteToolData {
  const dispatch = useAppDispatch();

  const parsed = useMemo(() => parseNoteResult(entry), [entry]);
  const noteId = parsed.id;
  // Curried note selectors require a string key; an empty key resolves to
  // `undefined` safely (no row with id "") so we never branch hooks.
  const key = noteId ?? "";

  // Hydrate the full note the moment we have an id. `fetchNoteContent`
  // self-guards against refetching an already-full note.
  useEffect(() => {
    if (noteId) dispatch(fetchNoteContent(noteId));
  }, [dispatch, noteId]);

  const record = useAppSelector(selectNoteById(key));
  const liveContent = useAppSelector(selectNoteContent(key));
  const liveLabel = useAppSelector(selectNoteLabel(key));
  const folder = useAppSelector(selectNoteFolder(key));
  const fetchStatus = useAppSelector(selectNoteFetchStatus(key));
  const isLoading = useAppSelector(selectNoteIsLoading(key));
  const saveState = useAppSelector(selectNoteSaveState(key));

  const stats = useMemo(
    () => computeNoteStats(liveContent),
    [liveContent],
  );

  // ── Debounced content writer ──────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setContent = useCallback(
    (value: string) => {
      if (!noteId) return;
      // Optimistic, instant slice update so the textarea stays responsive…
      dispatch(updateNoteContent({ id: noteId, content: value }));
      // …and debounce the network persist.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        dispatch(saveNote(noteId));
      }, 700);
    },
    [dispatch, noteId],
  );

  const flushSave = useCallback(() => {
    if (!noteId) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    dispatch(saveNote(noteId));
  }, [dispatch, noteId]);

  // Flush a pending edit if the card unmounts mid-debounce.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (noteId) dispatch(saveNote(noteId));
      }
    };
  }, [dispatch, noteId]);

  return {
    noteId,
    label: liveLabel ?? parsed.label ?? "Untitled note",
    content: liveContent,
    folder,
    updatedAt: record?.updated_at ?? parsed.updatedAt,
    createdAt: record?.created_at ?? null,
    version: typeof record?.version === "number" ? record.version : null,
    tags: record?.tags ?? EMPTY_TAGS,
    stats,
    isLoaded: fetchStatus === "full",
    isLoading,
    saveState,
    setContent,
    flushSave,
  };
}
