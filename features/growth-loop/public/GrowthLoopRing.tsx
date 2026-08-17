"use client";

import { useState } from "react";
import { BrainCircuit, User, Zap, type LucideIcon } from "lucide-react";

import { PUBLIC_CAPABILITY, type PublicCapability } from "../map/loop-map";
import { STAGE_CARDS } from "./stage-cards";

/**
 * THE LOOP, AS A PICTURE.
 *
 * The one thing a prospect cannot get from a list of twelve cards is that the
 * twelve steps are a CIRCLE — the last one feeds the first. This draws that.
 *
 * Same data as the cards and the admin map (`../map/loop-map.ts`) via the shared
 * `stage-cards` model — it selects and positions, it never restates a stage.
 *
 * Deliberately NOT React Flow: this is a fixed twelve-node ring, so it needs no
 * graph engine, no pan/zoom, and no 400KB of browser-only code. Inline SVG plus
 * real <button>s means it costs one tiny chunk, is keyboard-navigable, and needs
 * no `next/dynamic` boundary at all (code-splitting skill, rule 3).
 *
 * Mobile: hidden below `md`. A twelve-node ring cannot be read on a 375px screen
 * and a pan/zoom canvas is the wrong product on a phone — the numbered cards
 * below are the mobile presentation of the same sequence, closed by the
 * "and then it starts again" panel.
 */

const CAPABILITY_ICON: Record<PublicCapability, LucideIcon> = {
    you: User,
    ai: BrainCircuit,
    automatic: Zap,
};

/** Ring geometry, in the SVG's 100x100 user space. */
const RADIUS = 40;
const CENTER = 50;

/** Node centers as percentages of the box, so the ring scales with its container. */
const NODE_POSITIONS = STAGE_CARDS.map((_, index) => {
    const angle = (-90 + index * (360 / STAGE_CARDS.length)) * (Math.PI / 180);
    return {
        left: CENTER + RADIUS * Math.cos(angle),
        top: CENTER + RADIUS * Math.sin(angle),
    };
});

/** Four tangential arrowheads, sitting between nodes, showing which way it turns. */
const FLOW_ARROWS = [0, 1, 2, 3].map((quarter) => {
    const degrees = -90 + quarter * 90 + 360 / STAGE_CARDS.length / 2;
    const radians = degrees * (Math.PI / 180);
    return {
        x: CENTER + RADIUS * Math.cos(radians),
        y: CENTER + RADIUS * Math.sin(radians),
        rotate: degrees + 90,
    };
});

/**
 * `story` — ring beside a reading panel, for the long page.
 * `glance` — ring stacked over a tight caption, for the above-the-fold page,
 *   where the ring IS the content and the words around it are minimal.
 */
export type GrowthLoopRingVariant = "story" | "glance";

export function GrowthLoopRing({ variant = "story" }: { variant?: GrowthLoopRingVariant }) {
    const [activeStep, setActiveStep] = useState(1);
    const active = STAGE_CARDS[activeStep - 1];
    const isGlance = variant === "glance";

    return (
        <div
            className={
                isGlance
                    ? "hidden md:flex md:flex-col md:items-center md:gap-4"
                    : "hidden gap-8 md:grid md:grid-cols-[minmax(0,340px)_1fr] md:items-center lg:gap-12"
            }
        >
            {/* ── The ring ──────────────────────────────────────────────── */}
            <div
                className={`relative mx-auto aspect-square w-full ${
                    isGlance ? "max-w-[min(380px,42dvh)]" : "max-w-[340px]"
                }`}
            >
                <svg
                    viewBox="0 0 100 100"
                    className="absolute inset-0 h-full w-full"
                    aria-hidden
                    focusable="false"
                >
                    <circle
                        cx={CENTER}
                        cy={CENTER}
                        r={RADIUS}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={0.6}
                        className="text-border"
                    />
                    {FLOW_ARROWS.map((arrow) => (
                        <polygon
                            key={arrow.rotate}
                            points="0,-1.8 2.6,0 0,1.8"
                            fill="currentColor"
                            className="text-muted-foreground"
                            transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.rotate})`}
                        />
                    ))}
                </svg>

                {STAGE_CARDS.map((card, index) => {
                    const isActive = card.step === activeStep;
                    const position = NODE_POSITIONS[index];
                    return (
                        <button
                            key={card.stage.id}
                            type="button"
                            onClick={() => setActiveStep(card.step)}
                            onMouseEnter={() => setActiveStep(card.step)}
                            onFocus={() => setActiveStep(card.step)}
                            aria-pressed={isActive}
                            aria-label={`Step ${card.step}: ${card.stage.publicInfo.title}`}
                            className={`absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border transition-colors ${
                                isActive
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            }`}
                            style={{ left: `${position.left}%`, top: `${position.top}%` }}
                        >
                            <card.Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                        </button>
                    );
                })}

{/* The step NUMBER only — the title sits immediately beside the ring, so
                    repeating it here is noise. This anchors "where am I in the twelve". */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 w-[54%] -translate-x-1/2 -translate-y-1/2 text-center">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Step
                    </span>
                    <p className="text-3xl font-semibold leading-tight tracking-tight">{active.step}</p>
                    <span className="text-xs text-muted-foreground">of {STAGE_CARDS.length}</span>
                </div>
            </div>

            {/* ── The selected step ─────────────────────────────────────────
                🚨 ZERO LAYOUT SHIFT. Every one of the twelve panels is rendered
                into the SAME grid cell, so this box is always exactly as tall as
                the LONGEST step and never resizes as the pointer moves. Only the
                active panel is visible; the rest are `invisible` (still laid out,
                which is the whole point) and hidden from assistive tech.

                A `min-h-[…]` was tried first and is NOT good enough: it is a
                floor, so a longer sentence or a second row of chips still grew
                the box, which re-centered the whole column and made the RING
                itself jump under the cursor. Never reintroduce one here. -->  */}
            <div
                className={`grid ${
                    isGlance ? "max-w-md text-center" : ""
                }`}
            >
                {STAGE_CARDS.map((card) => {
                    const isActive = card.step === activeStep;
                    return (
                        <div
                            key={card.stage.id}
                            aria-hidden={!isActive}
                            className={`col-start-1 row-start-1 flex flex-col gap-2 ${
                                isGlance ? "items-center" : "justify-center gap-3"
                            } ${isActive ? "" : "invisible"}`}
                        >
                            <h3
                                className={`text-balance font-semibold tracking-tight ${
                                    isGlance ? "text-xl" : "text-2xl"
                                }`}
                            >
                                {card.stage.publicInfo.title}
                            </h3>
                            <p
                                className={`text-pretty leading-relaxed text-muted-foreground ${
                                    isGlance ? "text-sm" : "text-base"
                                }`}
                            >
                                {card.stage.publicInfo.plain}
                            </p>
                            {card.capabilities.length > 0 && (
                                <div
                                    className={`flex flex-wrap items-center gap-2 pt-1 ${
                                        isGlance ? "justify-center" : ""
                                    }`}
                                >
                                    {card.capabilities.map((capability) => {
                                        const Icon = CAPABILITY_ICON[capability];
                                        return (
                                            <span
                                                key={capability}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                                            >
                                                <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                                {PUBLIC_CAPABILITY[capability].label}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Constant text, so it sits OUTSIDE the stacked cell and cannot shift. */}
                <p
                    className={`col-start-1 row-start-2 pt-3 text-xs text-muted-foreground ${
                        isGlance ? "" : "max-w-sm"
                    }`}
                >
                    Step {STAGE_CARDS.length} feeds step 1 — so it never stops.
                </p>
            </div>
        </div>
    );
}
