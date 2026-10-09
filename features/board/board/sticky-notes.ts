/**
 * Board — a sticky note's words are a real Note.
 *
 * Arman (2026-10-09): a sticky is "just very simple text" on the canvas, and
 * "we might store it as a note anyways … a new folder that every user gets by
 * default … sticky notes". So:
 *  - the sticky's colour, size and place live in the BOARD document (a shape);
 *  - its words live in a Note in the person's "Sticky notes" folder;
 *  - no Note exists until the first typed character (an empty sticky is never
 *    an empty Note);
 *  - the board keeps a copy of the words (`shape.text`) so it paints at once and
 *    an agent can read it; when the board opens, the Note wins (an edit made in
 *    Notes shows on the board).
 *
 * ONE path for every change: this watches the board's shapes, so typing, Tab,
 * undo / redo, an agent's `board_shape` and a duplicate all reach the Note the
 * same way. A failed write keeps the words on the board and says so; the next
 * change retries.
 */

import type { BoardShape } from "../engine/shapes";
import { stickyNoteLabel } from "../engine/canvas-text";

/** Where a sticky's words are kept (the notes service in the app, a fake in tests). */
export interface StickyNoteStore {
  /** A new Note holding these words, in the Sticky notes folder; resolves to its id. */
  create: (text: string) => Promise<string>;
  update: (noteId: string, text: string) => Promise<void>;
  /** The current words of these Notes (a trashed or missing Note is absent). */
  read: (noteIds: string[]) => Promise<Map<string, string>>;
}

/** The board as the sync sees it. */
export interface StickyBoard {
  getShapes: () => readonly BoardShape[];
  subscribeShapes: (l: () => void) => () => void;
  stampShape: (id: string, patch: Partial<Omit<BoardShape, "id">>, opts?: { everywhere?: boolean }) => void;
}

/** The folder every person's sticky notes are filed in (created on their first sticky). */
export const STICKY_NOTES_FOLDER = "Sticky notes";

/** Typing settles this long before the Note is written. */
export const STICKY_SAVE_DELAY_MS = 700;

export { stickyNoteLabel };

/**
 * Keep every sticky's Note in step with the board. Returns `stop`, which
 * writes any pending words at once.
 */
export function startStickyNoteSync(
  board: StickyBoard,
  notes: StickyNoteStore,
  opts: { delayMs?: number; onError?: (error: unknown, what: "create" | "update" | "read") => void } = {},
): () => void {
  const delay = opts.delayMs ?? STICKY_SAVE_DELAY_MS;
  const report = opts.onError ?? (() => {});
  /** The words each Note holds as far as we know. */
  const saved = new Map<string, string>();
  /** Stickies whose Note is being created (never two Notes for one sticky). */
  const creating = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, string>();
  let stopped = false;

  const write = (noteId: string) => {
    timers.delete(noteId);
    const text = pending.get(noteId);
    pending.delete(noteId);
    if (text === undefined || saved.get(noteId) === text) return;
    notes.update(noteId, text).then(
      () => saved.set(noteId, text),
      (e) => report(e, "update"),
    );
  };

  const check = () => {
    if (stopped) return;
    for (const sh of board.getShapes()) {
      if (sh.kind !== "sticky") continue;
      const text = sh.text ?? "";
      if (!sh.note) {
        if (!text.trim() || creating.has(sh.id)) continue;
        creating.add(sh.id);
        notes.create(text).then(
          (noteId) => {
            creating.delete(sh.id);
            saved.set(noteId, text);
            board.stampShape(sh.id, { note: noteId }, { everywhere: true });
          },
          (e) => {
            creating.delete(sh.id);
            report(e, "create");
          },
        );
        continue;
      }
      const known = saved.get(sh.note);
      if (known === undefined) {
        saved.set(sh.note, text);
        continue;
      }
      if (known === text && !pending.has(sh.note)) continue;
      pending.set(sh.note, text);
      const t = timers.get(sh.note);
      if (t) clearTimeout(t);
      const noteId = sh.note;
      timers.set(noteId, setTimeout(() => write(noteId), delay));
    }
  };

  // Opening: what the board knows is a copy — each Note's own words win.
  const opened = board.getShapes().filter((s) => s.kind === "sticky" && s.note);
  for (const s of opened) saved.set(s.note!, s.text ?? "");
  if (opened.length) {
    notes.read([...new Set(opened.map((s) => s.note!))]).then(
      (words) => {
        if (stopped) return;
        for (const s of board.getShapes()) {
          if (s.kind !== "sticky" || !s.note || !words.has(s.note)) continue;
          const text = words.get(s.note)!;
          saved.set(s.note, text);
          if ((s.text ?? "") !== text && !pending.has(s.note)) board.stampShape(s.id, { text }, { everywhere: false });
        }
      },
      (e) => report(e, "read"),
    );
  }

  const unsubscribe = board.subscribeShapes(check);
  check();
  return () => {
    stopped = true;
    unsubscribe();
    for (const [noteId, t] of timers) {
      clearTimeout(t);
      write(noteId);
    }
  };
}
