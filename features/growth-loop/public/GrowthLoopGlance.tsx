import Link from "next/link";
import { ArrowRight, BrainCircuit, User, Zap, type LucideIcon } from "lucide-react";

import { publicStanding, type PublicCapability } from "../map/loop-map";
import { GrowthLoopRing } from "./GrowthLoopRing";
import { STAGE_CARDS } from "./stage-cards";

/**
 * THE GROWTH LOOP, ABOVE THE FOLD.
 *
 * The second face of the same `loop-map.ts` — a sibling of `GrowthLoopStory`,
 * not a replacement. Same data, same honesty gate, a fraction of the words.
 *
 * The brief that shaped it: the long page spends the entire first screen on
 * chrome (chip, wrapping headline, four-line paragraph, buttons) before the
 * reader reaches anything of value. Here, the LOOP is the first thing on the
 * screen, everything fits one viewport on a desktop, and nothing is said in a
 * sentence that a label can say.
 *
 * Rules that hold this page honest, same as the story page:
 * - Capability is derived from LIVE pipes only; nothing here is hand-written.
 * - Stage wording comes from `publicInfo`, never restated locally.
 * - The three figures move by themselves as pipes flip.
 */

const CAPABILITY_ICON: Record<PublicCapability, LucideIcon> = {
    you: User,
    ai: BrainCircuit,
    automatic: Zap,
};

/** Deliberately terser than the story page's labels — this page has no room to explain. */
const STANDING_LABEL: Record<PublicCapability, string> = {
    you: "you can run yourself",
    ai: "an agent can run for you",
    automatic: "run with nobody involved",
};

export function GrowthLoopGlance() {
    const standing = publicStanding();

    // `justify-start` until lg, and min-h rather than h: on a phone the content is
    // TALLER than the viewport, and centering an overflowing column pushes its top up
    // behind the header where it cannot be scrolled back into view. Only the desktop
    // layout — which genuinely fits — gets vertical centering.
    return (
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-start gap-8 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:content-center lg:items-center lg:gap-10 lg:py-0">
            {/* ── The claim ────────────────────────────────────────────── */}
            <section className="flex flex-col gap-4">
                {/* Sized to sit on ONE line at lg — a wrapped headline was the specific
                    complaint that produced this page. `text-nowrap` at lg makes a future
                    copy change fail loudly (it will overflow) instead of silently wrapping. */}
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.05] lg:text-nowrap">
                    A site that improves itself.
                </h1>
                <p className="max-w-md text-pretty text-base leading-relaxed text-muted-foreground lg:text-lg">
                    Research, to written pages, to real results — and back again. Run any step yourself, hand it to an
                    agent, or leave it alone.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Link
                        href="/request-access"
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Get started
                        <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </Link>
                    <Link
                        href="/how-it-works"
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
                    >
                        See every step
                    </Link>
                </div>

                {/* The honest standing, as three figures rather than a paragraph. */}
                <dl className="grid grid-cols-3 gap-2 border-t border-border pt-4">
                    {(Object.keys(STANDING_LABEL) as PublicCapability[]).map((capability) => {
                        const Icon = CAPABILITY_ICON[capability];
                        return (
                            <div key={capability} className="flex flex-col gap-1">
                                <dt className="flex items-center gap-1.5 text-muted-foreground">
                                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                    <span className="text-lg font-semibold tracking-tight text-foreground">
                                        {standing[capability]}
                                    </span>
                                    <span className="text-xs">of {standing.stages}</span>
                                </dt>
                                <dd className="text-pretty text-xs leading-snug text-muted-foreground">
                                    {STANDING_LABEL[capability]}
                                </dd>
                            </div>
                        );
                    })}
                </dl>
            </section>

            {/* ── The loop ─────────────────────────────────────────────── */}
            <section className="flex flex-col items-center">
                <GrowthLoopRing variant="glance" />

                {/*
                 * Mobile carries the same twelve steps as a dense tile grid — the
                 * ring is unreadable at 375px, and this stays compact enough that
                 * the whole loop is still one glance rather than a long read.
                 */}
                <ol className="grid w-full grid-cols-2 gap-1.5 md:hidden">
                    {STAGE_CARDS.map((card) => (
                        <li
                            key={card.stage.id}
                            className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2"
                        >
                            <card.Icon
                                className="h-3.5 w-3.5 shrink-0 text-primary"
                                strokeWidth={2}
                                aria-hidden
                            />
                            <span className="text-pretty text-xs font-medium leading-snug">
                                {card.stage.publicInfo.title}
                            </span>
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    );
}
