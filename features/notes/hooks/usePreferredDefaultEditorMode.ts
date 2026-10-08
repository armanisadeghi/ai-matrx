"use client";

// Which mode a note opens in — ONE rule for every notes surface (the page
// header, the tab chip, the window's view menu, the editor itself, the phone).
//
// The modes (Arman, 2026-10-07 — Write is the default everywhere):
//   desktop  Write (default) · Split · Plain · Read
//   phone    Write (default) · Plain
// Split = the quick plain textarea on the left, the formatted note live on the
// right. Plain = that textarea alone. Write = THE ONE EDITOR's visual view.
//
// The rule, in order:
//   1. the mode the person picked for this note in this session;
//   2. the mode the person last TYPED this note in (per person, every device —
//      userPreferences.notes.noteModes): a note last edited in Write reopens in
//      Write; a note last typed as text reopens in the device's text mode
//      (desktop: the person's default when it is Split or Plain, else Split;
//      phone: Plain) — quick unformatted notes stay unformatted;
//   3. a legacy per-note `metadata.lastEditorMode` (read, never written);
//   4. the person's default for the device — the knobs
//      userPreferences.notes.defaultEditorMode (desktop, default Write) and
//      userPreferences.notes.defaultPhoneEditorMode (phone, default Write),
//      set only on the Notes settings page (a mode click never writes them).
//
// Every stored value passes the one read path (`canonicalNoteEditorMode`), so a
// value written before the one editor replaced Toast UI opens as its successor.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setNoteEditorMode } from "../redux/slice";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { canonicalNoteEditorMode } from "../redux/notes.types";
import type { EditorMode } from "../components/NoteEditorCore";
import type { RootState } from "@/lib/redux/rootReducer";

export type NoteDevice = "desktop" | "phone";
export type PhoneNoteMode = "plain" | "write";

/** The platform defaults (Arman, 2026-10-07): a note opens in Write — the formatted editor — on every device. */
export const PLATFORM_DEFAULT_EDITOR_MODE: EditorMode = "write";
export const PLATFORM_DEFAULT_PHONE_EDITOR_MODE: PhoneNoteMode = "write";

/** The per-note memory keeps this many notes (oldest forgotten first). */
export const NOTE_MODE_MEMORY_LIMIT = 300;

export const DEFAULT_EDITOR_MODE_SETTING = "userPreferences.notes.defaultEditorMode";
export const DEFAULT_PHONE_EDITOR_MODE_SETTING = "userPreferences.notes.defaultPhoneEditorMode";
export const NOTE_MODE_MEMORY_SETTING = "userPreferences.notes.noteModes";

/** What the memory records: typed in the one editor, or typed as text. */
type RememberedMode = "write" | "plain";

/** Any stored mode, as the phone shows it (the phone has Plain and Write). */
export function phoneNoteMode(mode: unknown): PhoneNoteMode | null {
  const canonical = canonicalNoteEditorMode(mode);
  if (!canonical) return null;
  return canonical === "write" ? "write" : "plain";
}

/** Map any stored / legacy mode string onto the notes modes. */
export function normalizeNoteEditorMode(
  mode: string | null | undefined,
  fallback: EditorMode,
): EditorMode {
  return canonicalNoteEditorMode(mode) ?? fallback;
}

/** The person's default for this device (the knobs). */
export function usePreferredDefaultEditorMode(device: NoteDevice = "desktop"): EditorMode {
  const [desktop] = useSetting<string | undefined>(DEFAULT_EDITOR_MODE_SETTING);
  const [phone] = useSetting<string | undefined>(DEFAULT_PHONE_EDITOR_MODE_SETTING);
  if (device === "phone") return phoneNoteMode(phone) ?? PLATFORM_DEFAULT_PHONE_EDITOR_MODE;
  return defaultDesktopMode(desktop);
}

/**
 * The desktop default a stored value names. A default is a WRITING mode: a
 * stored "preview" (saved by a Read click before 2026-09-27) would open every
 * note read-only, so it reads as the platform default.
 */
export function defaultDesktopMode(stored: unknown): EditorMode {
  const mode = canonicalNoteEditorMode(stored);
  return mode && mode !== "preview" ? mode : PLATFORM_DEFAULT_EDITOR_MODE;
}

/** The pure rule (exported for the guard test). */
export function resolveNoteEditorMode(input: {
  device: NoteDevice;
  sessionMode: string | null | undefined;
  sessionModeSource: "uninitialized" | "persisted" | "local" | null | undefined;
  rememberedMode: string | null | undefined;
  preferredDefault: EditorMode;
}): EditorMode {
  const { device, sessionMode, sessionModeSource, rememberedMode, preferredDefault } = input;
  const onDevice = (mode: unknown): EditorMode | null =>
    device === "phone" ? phoneNoteMode(mode) : canonicalNoteEditorMode(mode);

  if (sessionModeSource === "local") {
    const picked = onDevice(sessionMode);
    if (picked) return picked;
  }
  if (rememberedMode === "write") return "write";
  if (rememberedMode === "plain") {
    if (device === "phone") return "plain";
    return preferredDefault === "plain" || preferredDefault === "split" ? preferredDefault : "split";
  }
  return onDevice(sessionMode) ?? onDevice(preferredDefault) ?? preferredDefault;
}

/** The mode this note opens in on this device (see the header of this file). */
export function useNoteEditorMode(
  noteId: string | null | undefined,
  device?: NoteDevice,
): EditorMode {
  const isMobile = useIsMobile();
  const resolvedDevice: NoteDevice = device ?? (isMobile ? "phone" : "desktop");
  const preferredDefault = usePreferredDefaultEditorMode(resolvedDevice);
  const [memory] = useSetting<Record<string, string> | undefined>(NOTE_MODE_MEMORY_SETTING);
  const sessionMode = useAppSelector((state: RootState) =>
    noteId ? state.notes?.notes?.[noteId]?._editorMode : undefined,
  );
  const sessionModeSource = useAppSelector((state: RootState) =>
    noteId ? state.notes?.notes?.[noteId]?._editorModeSource : undefined,
  );
  return resolveNoteEditorMode({
    device: resolvedDevice,
    sessionMode,
    sessionModeSource,
    rememberedMode: noteId ? memory?.[noteId] : undefined,
    preferredDefault,
  });
}

/** The memory after recording `mode` for `noteId` (newest last, bounded). */
export function rememberNoteMode(
  memory: Record<string, string> | undefined,
  noteId: string,
  mode: RememberedMode,
  limit = NOTE_MODE_MEMORY_LIMIT,
): Record<string, string> {
  const next: Record<string, string> = {};
  const kept = Object.entries(memory ?? {}).filter(([id]) => id !== noteId);
  for (const [id, value] of kept.slice(Math.max(0, kept.length - (limit - 1)))) {
    next[id] = value;
  }
  next[noteId] = mode;
  return next;
}

/**
 * Returns `recordEdit(noteId, mode)` — call it when the person types. Typing in
 * Write records "write"; typing in Plain or Split records "plain" (text). It
 * writes only when this note's remembered mode actually changes (once per
 * change, never per keystroke).
 */
export function useRememberNoteEditorMode(): (noteId: string, mode: EditorMode) => void {
  const [memory, setMemory] = useSetting<Record<string, string> | undefined>(
    NOTE_MODE_MEMORY_SETTING,
  );
  return (noteId: string, mode: EditorMode) => {
    const remembered: RememberedMode | null =
      mode === "write" ? "write" : mode === "plain" || mode === "split" ? "plain" : null;
    if (!remembered || memory?.[noteId] === remembered) return;
    setMemory(rememberNoteMode(memory, noteId, remembered));
  };
}

/**
 * THE mode click (Arman, 2026-09-27): picking a mode for a note changes ONLY
 * that note — its mode now, and the mode it reopens in (Write, or text for
 * Split / Plain; Read is not remembered). It NEVER writes the person's default
 * (`notes.defaultEditorMode` / `notes.defaultPhoneEditorMode`): a click is not a
 * choice for every note — that is how Toast UI once became everyone's default.
 * Defaults change only on the Notes settings page. Guard:
 * features/notes/__tests__/mode-click-never-writes-the-default.test.tsx.
 */
export function useSelectNoteMode(): (noteId: string, mode: EditorMode) => void {
  const dispatch = useAppDispatch();
  const remember = useRememberNoteEditorMode();
  return (noteId: string, mode: EditorMode) => {
    dispatch(setNoteEditorMode({ id: noteId, mode }));
    remember(noteId, mode);
  };
}
