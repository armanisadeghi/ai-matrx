"use client";

/**
 * Preview-only chrome for THE PLACES WORKSPACE mockup.
 *
 * Everything in this preview is mock data. The no-dead-ends law still applies in
 * spirit: a control that would navigate or write in the real thing must LOOK
 * inert here rather than silently doing nothing. `<Inert>` is that marker —
 * dashed outline, not-allowed cursor, and a title saying what it would do.
 */

import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Wraps a control that is deliberately non-functional in the mockup. */
export function Inert({
  what,
  className,
  children,
}: {
  /** What this control would do in the real workspace. */
  what: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={`Preview only — in the real workspace this would ${what}.`}
      aria-disabled
      className={cn(
        "inline-flex cursor-not-allowed rounded-md outline-dashed outline-1 outline-offset-2 outline-border/70 opacity-80",
        "[&_*]:pointer-events-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Section shell used by every panel, so the three panels read as one system. */
export function Panel({
  title,
  eyebrow,
  count,
  actions,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  count?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {title}
            {count}
          </h2>
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** A short, quotable explanation of the rule a panel is demonstrating. */
export function RuleNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

export function PreviewBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
      <FlaskConical className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
