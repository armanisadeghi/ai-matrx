// features/employee-performance-reviews/standard/draftSaver.ts
//
// THE AUTOSAVE STATE MACHINE for one half of a review, free of React so it can be proven.
// Saves are serialized. A `version_conflict` (the server holds a newer copy) does NOT discard the
// person's text: it stops saving, keeps the local draft, and waits for a choice:
//   · keepMine()   re-saves the local draft over the server's current version;
//   · the caller's "Load latest" drops the draft and reloads (the caller's own act).

import type { StdResult } from "./service";
import type { ReviewAnswers } from "./types";

export type SaverStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface SaverState {
  status: SaverStatus;
  error: string | null;
}

export interface DraftSaver {
  edit(next: ReviewAnswers): void;
  /** Saves now if there is anything unsaved. Resolves to the save's result, or null when nothing needed saving. */
  flush(): Promise<StdResult<unknown> | null>;
  /** After a conflict: save the local draft on top of the server's current version. */
  keepMine(): Promise<StdResult<unknown> | null>;
  hasUnsaved(): boolean;
  latest(): ReviewAnswers;
}

export function createDraftSaver(
  save: (answers: ReviewAnswers, expectedVersion: number | null) => Promise<StdResult<{ version: number }>>,
  initial: { answers: ReviewAnswers; version: number | null },
  onState: (s: SaverState) => void,
): DraftSaver {
  let latest = initial.answers;
  let version = initial.version;
  let dirty = false;
  let everSaved = initial.version !== null;
  let serverVersion: number | null = null;
  let conflict = false;
  let chain: Promise<unknown> = Promise.resolve();

  const run = (): Promise<StdResult<unknown> | null> => {
    const p = chain.then(async (): Promise<StdResult<unknown> | null> => {
      if (conflict) return { ok: false, reason: "version_conflict", message: "This was changed somewhere else." };
      if (!dirty && everSaved) return null;
      dirty = false;
      onState({ status: "saving", error: null });
      const r = await save(latest, version);
      if (r.ok) {
        version = r.data.version;
        everSaved = true;
        onState({ status: dirty ? "saving" : "saved", error: null });
      } else {
        dirty = true;
        if (r.reason === "version_conflict") {
          conflict = true;
          serverVersion = r.currentVersion ?? null;
          onState({ status: "conflict", error: r.message });
        } else onState({ status: "error", error: r.message });
      }
      return r;
    });
    chain = p;
    return p;
  };

  return {
    edit(next) {
      latest = next;
      dirty = true;
    },
    flush: run,
    keepMine() {
      conflict = false;
      version = serverVersion ?? version;
      dirty = true;
      return run();
    },
    hasUnsaved: () => dirty,
    latest: () => latest,
  };
}
