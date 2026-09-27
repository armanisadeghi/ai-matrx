// components/merge-field-input/merge-field-history.ts
//
// MergeFieldInput's own undo history. The field redraws its DOM for chips, so
// the browser's native undo stack cannot follow it; every change — typing, an
// inserted field, a field that turned into a chip, a paste, dictation, an
// agent's text — is recorded here as (text, caret) and Cmd/Ctrl+Z, Shift+Cmd+Z
// and the browser's Edit ▸ Undo/Redo (beforeinput historyUndo/historyRedo)
// walk it. Pure and React-free so it is unit-tested directly.

export type HistoryKind =
  /** Plain typing: consecutive keystrokes coalesce into one step. */
  | "typing"
  /** Dictation / agent / toolbar writes: a burst coalesces into one step. */
  | "external"
  /** Always its own step: insert field, auto-chip, paste, outside value. */
  | "hard";

export interface HistoryEntry {
  text: string;
  /** Caret in stored-text offsets after this change; null = end. */
  caret: number | null;
}

const COALESCE_MS = 800;
const MAX_STEPS = 200;

export class MergeFieldHistory {
  private stack: HistoryEntry[];
  private index = 0;
  private lastKind: HistoryKind | null = null;
  private lastAt = 0;

  constructor(initial: string) {
    this.stack = [{ text: initial, caret: null }];
  }

  get current(): HistoryEntry {
    return this.stack[this.index];
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  record(text: string, caret: number | null, kind: HistoryKind, now = Date.now()): void {
    const top = this.stack[this.index];
    if (top.text === text) {
      top.caret = caret;
      return;
    }
    const coalesce =
      kind !== "hard" &&
      this.lastKind === kind &&
      now - this.lastAt < COALESCE_MS &&
      this.index === this.stack.length - 1 &&
      this.index > 0;
    if (coalesce) {
      this.stack[this.index] = { text, caret };
    } else {
      this.stack = this.stack.slice(0, this.index + 1);
      this.stack.push({ text, caret });
      this.index += 1;
      if (this.stack.length > MAX_STEPS) {
        this.stack.shift();
        this.index -= 1;
      }
    }
    this.lastKind = kind;
    this.lastAt = now;
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo()) return null;
    this.index -= 1;
    this.lastKind = null;
    return this.stack[this.index];
  }

  redo(): HistoryEntry | null {
    if (!this.canRedo()) return null;
    this.index += 1;
    this.lastKind = null;
    return this.stack[this.index];
  }
}

/** Is this key event an undo (false), a redo (true), or neither (null)? */
export function historyKey(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): "undo" | "redo" | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && e.ctrlKey && !e.metaKey) return "redo";
  return null;
}
