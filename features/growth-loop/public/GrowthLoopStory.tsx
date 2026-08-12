import Link from "next/link";
import { ArrowRight, BrainCircuit, RotateCw, User, Zap, type LucideIcon } from "lucide-react";

import {
    PUBLIC_CAPABILITY,
    publicCapabilities,
    publicStages,
    publicStanding,
    type PublicCapability,
} from "../map/loop-map";
import { stageIcon } from "./stage-icons";

/**
 * THE CUSTOMER-FACING GROWTH LOOP.
 *
 * Same data as the admin map (`../map/loop-map.ts`) — one source of truth, no
 * parallel copy. This module is presentation ONLY: it selects (stages with a
 * `publicInfo`), renames (customer wording, never internal stage labels) and
 * derives capability from LIVE pipes.
 *
 * What never crosses over: file paths, `ref`s, gap ids, lanes, repo names,
 * maturity, and the words "partial" / "missing". See the honesty gate comment
 * in loop-map.ts.
 *
 * Server component on purpose — a prospect's first paint should cost no JS,
 * and the page must be crawlable (we sell SEO).
 */

const CAPABILITY_ICON: Record<PublicCapability, LucideIcon> = {
    you: User,
    ai: BrainCircuit,
    automatic: Zap,
};

function CapabilityChip({ capability }: { capability: PublicCapability }) {
    const Icon = CAPABILITY_ICON[capability];
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            title={PUBLIC_CAPABILITY[capability].label}
        >
            <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
            {PUBLIC_CAPABILITY[capability].short}
        </span>
    );
}

/**
 * Resolved ONCE at module scope, not per render: the map is static data, and
 * resolving an icon component inside a render body trips the React Compiler's
 * static-components rule.
 */
const STAGE_CARDS = publicStages().map((stage, index) => ({
    stage,
    step: index + 1,
    Icon: stageIcon(stage.publicInfo.icon),
    capabilities: publicCapabilities(stage),
}));

type StageCardModel = (typeof STAGE_CARDS)[number];

function StageCard({ stage, step, Icon, capabilities }: StageCardModel) {
    return (
        <li className="relative flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Step {step}
                </span>
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
                <h3 className="text-balance text-base font-semibold tracking-tight">{stage.publicInfo.title}</h3>
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{stage.publicInfo.plain}</p>
            </div>

            {capabilities.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                    {capabilities.map((capability) => (
                        <CapabilityChip key={capability} capability={capability} />
                    ))}
                </div>
            )}
        </li>
    );
}

function StandingFigure({ value, total, label }: { value: number; total: number; label: string }) {
    return (
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <span className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {value}
                <span className="text-base font-normal text-muted-foreground sm:text-lg"> of {total}</span>
            </span>
            <span className="text-pretty text-sm leading-relaxed text-muted-foreground">{label}</span>
        </div>
    );
}

export function GrowthLoopStory() {
    const standing = publicStanding();
    const stageCount = STAGE_CARDS.length;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <section className="flex flex-col gap-4 pt-10 lg:pt-16">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    How it works
                </span>
                <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
                    A website that studies the market, writes itself, and then gets better.
                </h1>
                <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                    Most tools hand you one piece — a keyword list, a page builder, a rankings dashboard — and leave
                    you to carry the work between them. We connected the whole thing into one loop of{" "}
                    {stageCount} steps. Every step is one you can do yourself, hand to an AI agent, or leave running
                    on its own.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Link
                        href="/request-access"
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Get started
                        <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </Link>
                    <Link
                        href="/pricing"
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
                    >
                        See pricing
                    </Link>
                </div>
            </section>

            {/* ── The three ways ───────────────────────────────────────── */}
            <section className="mt-12 flex flex-col gap-4 lg:mt-16">
                <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
                    You are never locked into one way of working
                </h2>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                    The same step can be done three different ways, and you choose per step. Do the parts you care
                    about by hand. Let an agent do the parts you don&apos;t. Let the mechanical parts run themselves.
                </p>
                <ul className="grid gap-3 sm:grid-cols-3">
                    {(Object.keys(PUBLIC_CAPABILITY) as PublicCapability[]).map((capability) => {
                        const Icon = CAPABILITY_ICON[capability];
                        return (
                            <li
                                key={capability}
                                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                                </span>
                                <span className="text-sm font-medium">{PUBLIC_CAPABILITY[capability].label}</span>
                            </li>
                        );
                    })}
                </ul>
            </section>

            {/* ── The loop ─────────────────────────────────────────────── */}
            <section className="mt-12 flex flex-col gap-5 lg:mt-16">
                <div className="flex flex-col gap-2">
                    <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
                        The {stageCount} steps, start to finish
                    </h2>
                    <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                        Each card says what the step does and how it can be run today.
                    </p>
                </div>

                <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {STAGE_CARDS.map((card) => (
                        <StageCard key={card.stage.id} {...card} />
                    ))}
                </ol>

                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-4 sm:p-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <RotateCw className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                    </span>
                    <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground">And then it starts again.</span> What the last
                        step learns goes back into the plan, so the next pass is better informed than the one before
                        it. That is the whole idea: not a project that finishes, but a site that keeps improving.
                    </p>
                </div>
            </section>

            {/* ── Honest standing ──────────────────────────────────────── */}
            <section className="mt-12 flex flex-col gap-4 lg:mt-16">
                <div className="flex flex-col gap-2">
                    <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
                        Where the system is today
                    </h2>
                    <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                        We would rather show you the real state of the build than a diagram of what we intend. These
                        numbers come straight out of the same map our engineers work from, and they only count what is
                        genuinely working today.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <StandingFigure
                        value={standing.you}
                        total={standing.stages}
                        label="steps you can run yourself right now, in the product"
                    />
                    <StandingFigure
                        value={standing.ai}
                        total={standing.stages}
                        label="steps a purpose-built AI agent can run for you"
                    />
                    <StandingFigure
                        value={standing.automatic}
                        total={standing.stages}
                        label="steps that already run on their own, with nobody watching"
                    />
                </div>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                    The rest are being connected now. When one lands, this page changes by itself — it is generated
                    from the engineering map, so it cannot get ahead of the code.
                </p>
            </section>
        </div>
    );
}
