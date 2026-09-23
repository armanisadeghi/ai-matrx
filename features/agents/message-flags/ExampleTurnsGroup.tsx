"use client";

/**
 * A run of example turns in a transcript, collapsed to one row with a count.
 * Expanding renders each turn through the SAME message components the rest of
 * the conversation uses — never a second renderer.
 */

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function ExampleTurnsGroup({
  count,
  children,
}: {
  /** Number of turns in the run (user + assistant). */
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pairs = Math.floor(count / 2);
  return (
    <div className="my-1" data-testid="runner-example-run">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        Examples · {pairs > 0 ? `${pairs} ${pairs === 1 ? "pair" : "pairs"}` : `${count} turns`}
      </button>
      {open && <div className="mt-1 border-l-2 border-border pl-2 opacity-80">{children}</div>}
    </div>
  );
}
