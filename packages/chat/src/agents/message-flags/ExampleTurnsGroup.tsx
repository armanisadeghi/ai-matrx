"use client";

/**
 * A run of example turns in a transcript, collapsed to one row with a count.
 * Expanding renders each turn through the SAME message components the rest of
 * the conversation uses — never a second renderer.
 */

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

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
      <Button variant="quiet" icon={<ChevronRight />} onClick={() => setOpen((v) => !v)} aria-expanded={open}>Examples · {pairs > 0 ? `${pairs} ${pairs === 1 ? "pair" : "pairs"}` : `${count} turns`}</Button>
      {open && <div className="mt-1 border-l-2 border-border pl-2 opacity-80">{children}</div>}
    </div>
  );
}
