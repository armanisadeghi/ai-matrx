"use client";

// features/unified-data/test-bench/TestBenchChrome.tsx
//
// THE CHROME OF THE TEST BENCH, AND NOTHING ELSE.
//
// Every component here is presentational: a section frame, a status fact, a
// refusal line, a "what is coming" note. None of them reads the record store,
// imports a campaign module or holds a decision — which is why this file is
// not a campaign entry point and does not need the switch. The one screen that
// mounts real store components is `TryEverythingScreen.tsx`, next to it.
//
// WHY A SEPARATE FILE. `pnpm check:campaign-entry-points` makes every file that
// reaches the store a registered `runtime` entry that must read the switch
// itself. Frames and labels are not reach, and registering them would say they
// were. This keeps the register honest and the screen short.

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** How finished a section is. The word the person reads is the one we can prove. */
export type SectionState = "real" | "partly" | "placeholder";

const STATE_WORD: Record<SectionState, string> = {
    real: "Working",
    partly: "Working, with a gap",
    placeholder: "Not built yet",
};

const STATE_CLASS: Record<SectionState, string> = {
    real: "border-emerald-600/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
    partly: "border-amber-600/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
    placeholder: "border-border text-muted-foreground",
};

export interface SectionProps {
    /** Position in the list. The contents rail and the anchor use the same number. */
    n: number;
    title: string;
    /** One line, plain English: what this part of the system is. */
    what: string;
    state: SectionState;
    /**
     * Open on arrival. Only the cheapest sections do: the rest mount a live
     * component that reads — and in a few cases WRITES — this organization's
     * store (a saved-views table, a forms table, a dashboards table), and a
     * page that made four tables because somebody scrolled past would be doing
     * something nobody asked for. Opening is the person's own act.
     */
    defaultOpen?: boolean;
    /** The real control. */
    children?: ReactNode;
}

/** The anchor id for section `n`, used by the rail and by `#`-links. */
export function sectionAnchor(n: number): string {
    return `try-${n}`;
}

export function Section({ n, title, what, state, defaultOpen = false, children }: SectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    const bodyId = useId();
    return (
        <section
            id={sectionAnchor(n)}
            className="scroll-mt-[calc(var(--shell-header-h)+3.5rem)] overflow-hidden rounded-lg border border-border bg-card"
        >
            {/* ONE ROW. The number, the name, the verdict — never a second line
                repeating the name, and never a subtitle restating the heading. */}
            <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen((was) => !was)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
            >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
                    {n}
                </span>
                <h2 className="truncate text-sm font-medium text-foreground">{title}</h2>
                <span
                    className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STATE_CLASS[state]}`}
                >
                    {STATE_WORD[state]}
                </span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>
            <div id={bodyId} className="space-y-3 border-t border-border/60 p-3">
                <p className="text-sm leading-relaxed text-muted-foreground">{what}</p>
                {open ? children : null}
            </div>
        </section>
    );
}

/**
 * THE "TRY IT" LABEL. It sits above the real control so a person knows the next
 * thing under it is live and will change their organization's data.
 */
export function TryIt({ children, hint }: { children: ReactNode; hint?: string }) {
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-medium uppercase tracking-wide text-foreground/70">Try it</span>
                {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
            </div>
            {children}
        </div>
    );
}

/**
 * WHAT EXISTS AND WHAT IS COMING, for a part that is not finished.
 *
 * Both halves are required. A note that only says "coming soon" is the dead end
 * this page exists to remove: the person is told what they CAN do today and
 * exactly what they are waiting for, named.
 */
export function NotBuiltYet({
    today,
    waitingFor,
    children,
}: {
    /** What genuinely exists right now, in plain words. */
    today: string;
    /** The one thing that has to happen. Named, never "later". */
    waitingFor: string;
    /** "Try what exists" — omitted when there is honestly no door. */
    children?: ReactNode;
}) {
    return (
        <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed">
                <p className="text-foreground/90">{today}</p>
                <p className="mt-1.5 text-muted-foreground">
                    <span className="font-medium text-foreground/70">Waiting on:</span> {waitingFor}
                </p>
            </div>
            {children ? <TryIt hint="the part that does exist">{children}</TryIt> : null}
        </div>
    );
}

/** One fact in the status strip. `value` is what we read; `problem` is why we could not. */
export function StatusFact({
    label,
    value,
    problem,
    children,
}: {
    label: string;
    value?: string | null;
    problem?: string | null;
    children?: ReactNode;
}) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
            {problem ? (
                // NOTHING FAILS SILENTLY. A number we could not read is never
                // drawn as a zero, a dash or a spinner that never ends.
                <div className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">{problem}</div>
            ) : value === undefined ? (
                <div className="mt-0.5 text-sm text-muted-foreground">Reading…</div>
            ) : (
                <div className="mt-0.5 text-sm leading-snug text-foreground">{value}</div>
            )}
            {children}
        </div>
    );
}

/** The store's or the platform's own refusal, shown to the person as a sentence. */
export function Refusal({ children }: { children: ReactNode }) {
    return (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {children}
        </p>
    );
}

/** A quiet aside under a control — a caveat that is true but not a refusal. */
export function Aside({ children }: { children: ReactNode }) {
    return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}
