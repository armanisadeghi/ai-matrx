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

/**
 * How finished a section is. The word the person reads is the one we can prove.
 *
 * `asking` is not a fourth degree of finished — it is the honest state of a
 * section whose live check has not come back yet, and it exists because the
 * alternative is a badge that guesses for a second and then changes its mind.
 */
export type SectionState = "real" | "partly" | "placeholder" | "asking" | "unchecked";

const STATE_WORD: Record<SectionState, string> = {
    real: "Working",
    partly: "Working, with a gap",
    placeholder: "Not built yet",
    asking: "Checking…",
    // SETTLED, AND THE ANSWER IS "WE DO NOT KNOW". Distinct from `asking`, which
    // is still in flight, and from `placeholder`, which is a claim. See
    // `TryEverythingScreen`'s `useDoor` header for the defect this word closes.
    unchecked: "Could not check",
};

const STATE_CLASS: Record<SectionState, string> = {
    real: "border-emerald-600/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
    partly: "border-amber-600/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
    placeholder: "border-border text-muted-foreground",
    asking: "border-border text-muted-foreground",
    unchecked: "border-amber-600/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
};

/**
 * WHETHER A DOOR EXISTS HERE — the one answer every section on this page is
 * allowed to speak from.
 *
 * NOTHING ON THIS PAGE MAY STATE A CAPABILITY FROM A SENTENCE SOMEBODY TYPED.
 * On 2026-09-20 a verifier pressed three buttons this page had warned about and
 * found all three working, and a portal this page said did not exist: "a person
 * who believes the page will not press the buttons that work." A note is a
 * reading of the live system or it is not written.
 *
 * `there: null` is the THIRD answer and it is the important one: we asked and
 * could not tell. A check that failed is never reported as an absence.
 */
export interface Capability {
    /** True = it is here and it answered. False = genuinely absent. Null = we could not tell. */
    there: boolean | null;
    /** What we asked, in a person's words. One sentence, always present. */
    because: string;
    /** Only when it is absent: the one thing that would make it appear. */
    whatWouldMakeItAppear?: string;
    /**
     * SETTLED AS UNKNOWN, rather than still in flight. Both are `there: null`,
     * and a person reading the badge needs to know which: "Checking…" says wait,
     * "Could not check" says this is the final answer and here is what got in
     * the way. Without it a probe that will never resolve wears a spinner word
     * for ever, which is the forever-loading defect in a badge.
     */
    settled?: boolean;
}

/**
 * A section that needs TWO things present (a route AND a door) is only working
 * when both are, unknown while either is unknown, and absent otherwise.
 */
export function bothOf(a: Capability, b: Capability): Capability {
    if (a.there === true && b.there === true) return { there: true, because: a.because };
    if (a.there === null || b.there === null) {
        // THE UNKNOWN HALF IS THE ONE THAT SPEAKS, and it carries its own
        // settled/in-flight state — a pair must not turn "could not check" back
        // into "checking…" on its way through.
        const unknown = a.there === null ? a : b;
        return unknown.settled
            ? { there: null, because: unknown.because, settled: true }
            : { there: null, because: unknown.because };
    }
    return a.there === false ? a : b;
}

/** The section badge a capability earns. Never a word typed beside it. */
export function stateFor(capability: Capability | undefined): SectionState {
    if (!capability) return "asking";
    if (capability.there === null) return capability.settled ? "unchecked" : "asking";
    return capability.there ? "real" : "placeholder";
}

/**
 * WHAT WE ASKED AND WHAT CAME BACK, in one small block a person can read.
 * Present, absent or unreadable — three states, three sentences, no fourth mood
 * in which a note asserts something nobody checked.
 */
export function LiveState({ capability }: { capability: Capability }) {
    const tone =
        capability.there === true
            ? "border-emerald-600/40 bg-emerald-500/5 dark:border-emerald-400/40"
            : capability.there === false
              ? "border-border bg-muted/40"
              : "border-amber-600/40 bg-amber-500/5 dark:border-amber-400/40";
    return (
        <div className={`space-y-1 rounded-md border p-3 text-sm leading-relaxed ${tone}`}>
            <p className="text-foreground/90">{capability.because}</p>
            {capability.there === false && capability.whatWouldMakeItAppear ? (
                <p className="text-muted-foreground">
                    <span className="font-medium text-foreground/70">Waiting on:</span>{" "}
                    {capability.whatWouldMakeItAppear}
                </p>
            ) : null}
        </div>
    );
}

export interface SectionProps {
    /** Position in the list. The contents rail and the anchor use the same number. */
    n: number;
    title: string;
    /** One line, plain English: what this part of the system is. */
    what: string;
    /**
     * WHAT THIS DEPLOYMENT CAN ACTUALLY DO HERE — one live answer per thing this
     * section needs. Given, it decides the badge AND is rendered under the
     * heading where a person sees it WITHOUT opening anything: the verdict and
     * the reason for it are the same fact, and a badge nobody can check is the
     * hard-coded note again with fewer words.
     */
    capability?: Capability | readonly Capability[];
    /** The badge, for a section whose honest state is not a door's answer. */
    state?: SectionState;
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

export function Section({ n, title, what, state, capability, defaultOpen = false, children }: SectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    const bodyId = useId();
    const asked: readonly Capability[] = capability
        ? Array.isArray(capability)
            ? capability
            : [capability as Capability]
        : [];
    const badge: SectionState = asked.length > 0 ? stateFor(asked.reduce(bothOf)) : (state ?? "asking");
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
                    className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STATE_CLASS[badge]}`}
                >
                    {STATE_WORD[badge]}
                </span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>
            <div id={bodyId} className="space-y-3 border-t border-border/60 p-3">
                <p className="text-sm leading-relaxed text-muted-foreground">{what}</p>
                {asked.map((one, at) => (
                    <LiveState key={at} capability={one} />
                ))}
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
