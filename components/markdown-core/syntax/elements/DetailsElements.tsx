// `<details>` / `<summary>` (raw HTML or `:::details`) and `<kbd>`, styled.
// Environment-neutral — native disclosure, no state.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = { children?: ReactNode; className?: string; open?: boolean; id?: string; node?: unknown } & Record<string, unknown>;

export function DetailsElement({ children, className, open, id, node: _node, ...rest }: Props) {
  // A callout that folds is also a <details>; it brings its own frame.
  if (className?.includes("matrx-callout")) {
    return (
      <details {...rest} className={className} open={open} id={id}>
        {children}
      </details>
    );
  }
  return (
    <details
      {...rest}
      open={open}
      id={id}
      className={cn("matrx-details group/details my-3 rounded-md border border-border bg-card px-3 py-2 text-sm [&[open]>summary]:mb-2", className)}
    >
      {children}
    </details>
  );
}

export function SummaryElement({ children, className }: Props) {
  if (className?.includes("matrx-callout-title")) return <summary className={className}>{children}</summary>;
  return (
    <summary className={cn("cursor-pointer select-none font-medium text-foreground marker:text-muted-foreground", className)}>
      {children}
    </summary>
  );
}

export function KbdElement({ children, className }: Props) {
  return (
    <kbd
      className={cn(
        "rounded border border-b-2 border-border bg-muted px-1.5 py-px font-mono text-[0.8em] text-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
