import { Fragment } from "react";
import { ArrowRight, CornerDownLeft } from "lucide-react";

import { STAGE_CARDS, type StageCardModel } from "./stage-cards";

/**
 * THE GROWTH LOOP AS A PLAIN DIAGRAM — nodes, arrows, and almost no words.
 *
 * The third public face of the same `loop-map.ts`. It answers one question and
 * only one: what does this system do, and how do the parts connect? There is no
 * hover state, no selection, no panel that changes — nothing here moves, ever.
 *
 * Layout deliberately mirrors the admin React Flow map (`GrowthLoopCanvasImpl`)
 * so the two read as the same picture: a serpentine of three lanes of four —
 * left-to-right, back right-to-left, then left-to-right again — with the two
 * feedback connections closing the loop.
 *
 * Built as CSS grid + Lucide arrows rather than React Flow or hand-placed SVG:
 * a fixed twelve-node diagram needs no graph engine, and a flow made of real
 * boxes reflows to a single readable column on a phone, which a canvas cannot.
 * Server component — zero JS, fully crawlable.
 */

/** The three serpentine lanes, in loop order. Lane 2 is drawn right-to-left. */
const LANES: StageCardModel[][] = [
    STAGE_CARDS.slice(0, 4),
    STAGE_CARDS.slice(4, 8),
    STAGE_CARDS.slice(8, 12),
];

function Node({ card }: { card: StageCardModel }) {
    return (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <card.Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {card.step}
                </span>
                <span className="block text-pretty text-sm font-medium leading-snug">
                    {card.stage.publicInfo.title}
                </span>
            </span>
        </div>
    );
}

/**
 * Points down when the lanes are stacked (mobile), and along the lane's own
 * direction on a wide screen — lane 2 runs backwards, so its arrows flip.
 */
function Arrow({ reversed }: { reversed: boolean }) {
    // Whole class strings, never appended: `md:rotate-0` + `md:-rotate-180`
    // both target `rotate` at the same breakpoint, so the flip silently lost.
    return (
        <ArrowRight
            className={
                reversed
                    ? "h-4 w-4 shrink-0 self-center rotate-90 text-muted-foreground md:rotate-180"
                    : "h-4 w-4 shrink-0 self-center rotate-90 text-muted-foreground md:rotate-0"
            }
            strokeWidth={2}
            aria-hidden
        />
    );
}

export function GrowthLoopDiagram() {
    return (
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
            <header className="flex flex-col gap-2 pb-8">
                <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                    What the system does
                </h1>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                    Twelve steps, connected end to end. Follow the arrows.
                </p>
            </header>

            <div className="flex flex-col gap-2 md:gap-3">
                {LANES.map((lane, laneIndex) => {
                    const reversed = laneIndex === 1;
                    return (
                        <div key={laneIndex} className="flex flex-col gap-2 md:gap-3">
                            <div
                                className={`flex flex-col gap-2 md:flex-row md:items-stretch md:gap-3 ${
                                    reversed ? "md:flex-row-reverse" : ""
                                }`}
                            >
                                {lane.map((card, index) => (
                                    <Fragment key={card.stage.id}>
                                        {index > 0 && <Arrow reversed={reversed} />}
                                        <Node card={card} />
                                    </Fragment>
                                ))}
                            </div>

                            {/* The turn into the next lane. */}
                            {laneIndex < LANES.length - 1 && (
                                <div
                                    className={`flex justify-center ${
                                        reversed ? "md:justify-start" : "md:justify-end"
                                    }`}
                                >
                                    <ArrowRight
                                        className="h-4 w-4 rotate-90 text-muted-foreground md:mx-[7.5%]"
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── The two connections that close the loop ──────────────────
                Straight from the map: writeback -> fill ("page fixed") and
                writeback -> plan ("plan learns"). */}
            <div className="mt-6 flex flex-col gap-2 rounded-xl border border-dashed border-border bg-card/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <CornerDownLeft className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                    And then it feeds back
                </div>
                <ul className="flex flex-col gap-1 pl-6 text-sm text-muted-foreground sm:flex-row sm:gap-6">
                    <li>
                        Step 12 <span className="text-foreground">&rarr;</span> Step 5 — the page itself gets fixed
                    </li>
                    <li>
                        Step 12 <span className="text-foreground">&rarr;</span> Step 2 — the plan learns
                    </li>
                </ul>
            </div>
        </div>
    );
}
