// features/esign/signer/autosave.ts — FINISH LATER WITHOUT LOSS (esign-parity CONTRACT §2.1).
//
// Every edit gets `seq = max(Date.now(), lastSeq + 1)`, a per-tab monotonic clock. Edits wait in a
// pending map; at most ONE save is in flight; edits made meanwhile coalesce into the next save,
// 600 ms after the last change, on blur and when the page hides. The server keeps a field's value
// only when its `seq` is newer, so a slow, late save never overwrites a newer one — and the answer's
// `current` is adopted for every field this tab has nothing newer pending for.

import type { FieldPatch, FieldValue, FieldValues } from "../contract/fieldModel";

export type SaveState = "idle" | "saving" | "saved" | "retrying";

export interface AutosaveHooks {
  save: (patch: FieldPatch) => Promise<{ values_saved_at: string; current: FieldValues }>;
  /** The server's answer for fields this tab has no newer edit for. */
  onAdopt: (current: Record<string, FieldValue>) => void;
  onState: (state: SaveState) => void;
  /** A refusal that retrying cannot fix (a field the server will not take): stop and say so. */
  onRefused: (error: unknown) => boolean;
}

const DEBOUNCE_MS = 600;
const RETRY_MS = 3000;

export class Autosaver {
  private pending: FieldPatch = {};
  private lastSeq = 0;
  private inFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly hooks: AutosaveHooks) {}

  /** The next sequence number for an edit made now. */
  nextSeq(): number {
    this.lastSeq = Math.max(Date.now(), this.lastSeq + 1);
    return this.lastSeq;
  }

  /** Record one edit and schedule a save. */
  edit(fieldId: string, v: FieldValue, seq: number = this.nextSeq()) {
    this.pending[fieldId] = { v, seq };
    this.schedule(DEBOUNCE_MS);
  }

  hasPending(): boolean {
    return Object.keys(this.pending).length > 0 || this.inFlight !== null;
  }

  /** Save now (blur, page hidden, Finish later). Resolves when nothing is pending. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Wait out the save in flight, then send what queued behind it.
    for (let i = 0; i < 5 && this.hasPending(); i += 1) {
      if (this.inFlight) await this.inFlight;
      else await this.run();
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private run(): Promise<void> {
    if (this.inFlight || this.stopped) return this.inFlight ?? Promise.resolve();
    const patch = this.pending;
    if (Object.keys(patch).length === 0) return Promise.resolve();
    this.pending = {};
    this.hooks.onState("saving");
    const job = (async () => {
      try {
        const answer = await this.hooks.save(patch);
        const adopt: Record<string, FieldValue> = {};
        for (const [id, entry] of Object.entries(answer.current)) {
          // A newer edit is waiting for this field: the screen keeps it.
          if (this.pending[id]) continue;
          adopt[id] = entry.v;
        }
        this.hooks.onAdopt(adopt);
        this.hooks.onState(Object.keys(this.pending).length > 0 ? "saving" : "saved");
      } catch (err) {
        if (this.hooks.onRefused(err)) {
          this.hooks.onState("idle");
          return;
        }
        // Put the failed edits back under anything newer, then try again.
        for (const [id, entry] of Object.entries(patch)) {
          const newer = this.pending[id];
          if (!newer || newer.seq < entry.seq) this.pending[id] = entry;
        }
        this.hooks.onState("retrying");
        this.schedule(RETRY_MS);
      } finally {
        this.inFlight = null;
      }
      if (Object.keys(this.pending).length > 0 && !this.timer) this.schedule(DEBOUNCE_MS);
    })();
    this.inFlight = job;
    return job;
  }
}
