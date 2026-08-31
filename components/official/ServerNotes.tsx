"use client";

// components/official/ServerNotes.tsx
//
// THE ONE BLOCK FOR "WHAT THE SERVER SAID IT DID THAT YOU DID NOT ASK FOR".
//
// 🚨 A 200 IS NOT AGREEMENT. Our server doors answer OK and then say, in prose,
// what they refused, substituted, skipped or downgraded on the way —
// `BindingResult.notes` on a binding save, `MandateTestResult.notes` on a run
// (the `mandate_consumption_map_no_op` scream among them), the input surface's
// `notes` when it could not read a declaration. Those sentences arrive in the
// response body of a successful call, so nothing throws, nothing turns red, and
// until a surface PRINTS them the person is told nothing at all.
//
// V3 round 4 (§ honesty) found exactly that on the mandate Run panel: the
// no-op-map scream reached the browser on every run and appeared nowhere on
// screen. The fix is not another one-off `<ul>` — the third one would have been
// the third divergent treatment — so the amber block the binding save notes got
// in v0.4.1567 lives HERE, and every door's notes render through it.
//
// COUNTED, because "there is a note" and "there are four notes" are different
// facts and a person scanning a panel must not have to count paragraphs.
// VERBATIM, because the server is the authority on what it just did and a
// client paraphrase of a server refusal is a second source of truth waiting to
// disagree. AMBER, because every sentence that lands here is the door telling
// you it did not do exactly what you asked — never decoration.
//
// Renders NOTHING when there is nothing to say: no empty box, no "no notes".

import { cn } from "@/lib/utils";

export interface ServerNotesProps {
  /** What these sentences are ABOUT, in this surface's words — "What the save
   * did", "What this run did". Never a generic "Notes". */
  heading: string;
  /** The server's sentences, verbatim. Blanks and non-strings are dropped
   * rather than printed as empty rows. */
  notes: readonly unknown[];
  className?: string;
  /** Test/automation hook; defaults to `server-notes`. */
  testId?: string;
}

/** The sentences worth printing — the server's words, minus anything blank. */
export function usableServerNotes(notes: readonly unknown[]): string[] {
  return notes.filter(
    (note): note is string => typeof note === "string" && note.trim().length > 0,
  );
}

export function ServerNotes({
  heading,
  notes,
  className,
  testId = "server-notes",
}: ServerNotesProps) {
  const usable = usableServerNotes(notes);
  if (usable.length === 0) return null;
  return (
    <div
      data-testid={testId}
      className={cn(
        "space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5",
        className,
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
        {heading} — {usable.length} {usable.length === 1 ? "note" : "notes"}
      </p>
      {usable.map((note) => (
        <p
          key={note}
          className="text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-400"
        >
          {note}
        </p>
      ))}
    </div>
  );
}
