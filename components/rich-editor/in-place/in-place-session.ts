// components/rich-editor/in-place/in-place-session.ts
//
// EDIT IN PLACE — the byte rules, React-free. One session per opening of the
// editor over a host's stored text:
//
//   • explicit-save host (a chat message, a study guide, a task): nothing is
//     written until Save, and Save writes only when the text differs from what
//     was opened. Cancel writes nothing.
//   • autosave host (a note): every changed draft is written as it settles,
//     never a draft equal to the last written text. Cancel after edits puts the
//     opened text back (one write, the stored bytes) — or writes nothing when
//     nothing was written.
//
// The shell (`InPlaceEditor.tsx`) drives this; the per-host byte tests drive it
// with each host's real write adapter.

export type InPlaceSaveMode = "explicit" | "autosave";

export interface InPlaceSessionOptions {
  /** The stored text the editor opened on. */
  openedOn: string;
  mode: InPlaceSaveMode;
  /** The host's write. Resolve with the text as stored to prove it. */
  write: (text: string) => Promise<string | void> | string | void;
}

export interface InPlaceSession {
  /** The editor reported a draft (autosave hosts write it). */
  draft(text: string): Promise<void>;
  /** Save / ⌘Enter. Resolves with whether anything was written. */
  save(text: string): Promise<{ wrote: boolean; stored?: string | void }>;
  /** Escape / Cancel after the person confirmed. Resolves with whether anything was written. */
  cancel(): Promise<{ wrote: boolean }>;
  /** True when the current draft differs from what was opened. */
  dirty(): boolean;
}

export function createInPlaceSession({ openedOn, mode, write }: InPlaceSessionOptions): InPlaceSession {
  let current = openedOn;
  let lastWritten = openedOn;
  const writeIfNew = async (text: string) => {
    if (text === lastWritten) return { wrote: false as const };
    const stored = await write(text);
    lastWritten = typeof stored === "string" ? stored : text;
    return { wrote: true as const, stored };
  };
  return {
    async draft(text) {
      current = text;
      if (mode === "autosave") await writeIfNew(text);
    },
    async save(text) {
      current = text;
      if (mode === "explicit" && text === openedOn) return { wrote: false };
      return writeIfNew(text);
    },
    async cancel() {
      current = openedOn;
      if (mode === "explicit") return { wrote: false };
      return writeIfNew(openedOn);
    },
    dirty() {
      return current !== openedOn;
    },
  };
}
