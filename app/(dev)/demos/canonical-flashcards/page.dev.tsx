import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Check,
  CircleDot,
  FlaskConical,
  Layers3,
  MonitorSmartphone,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  TestTubeDiagonal,
  TriangleAlert,
} from "lucide-react";

const VARIANTS = [
  {
    id: "refine",
    name: "Refine",
    posture: "Recommended canonical candidate",
    description:
      "Preserves the focused player learners already understand, then adds source adapters, three presentation styles, learning actions, trust, audio, and filmstrip navigation.",
    recommendation: true,
  },
  {
    id: "reimagine",
    name: "Reimagine",
    posture: "Policy-first exploration",
    description:
      "Strongest demonstration of the source surface selecting presentation automatically, with an explicit named-context handoff for AI questions.",
    recommendation: false,
  },
  {
    id: "dense",
    name: "Dense",
    posture: "Power-study workspace",
    description:
      "Shows how the same player can expose a persistent deck queue and learning-assist rail on wide screens, then collapse those tools into a mobile action sheet.",
    recommendation: false,
  },
  {
    id: "sharp",
    name: "Sharp",
    posture: "Clean focused evolution",
    description:
      "A compact evolution of the current fullscreen experience with clear gesture affordances and an inspectable action-contract preview.",
    recommendation: false,
  },
] as const;

const ARCHITECTURE = [
  {
    label: "Source adapter",
    detail: "Chat · Education · Canvas",
    icon: Route,
  },
  {
    label: "Canonical flashcard_set",
    detail: "One typed content contract",
    icon: Layers3,
  },
  {
    label: "One player state machine",
    detail: "Index · face · gestures · progress",
    icon: CircleDot,
  },
  {
    label: "Presentation + capability policy",
    detail: "Style and tools follow context",
    icon: SlidersHorizontal,
  },
] as const;

const MIGRATION_STEPS = [
  {
    title: "Freeze the canonical contract",
    detail:
      "Declare flashcard_set, card identity, media, trust, study metadata, and __kind once. Add fixture and adapter contract tests before changing a renderer.",
  },
  {
    title: "Extract behavior from the current focused player",
    detail:
      "Move index, flip, swipe, jump, progress, text fitting, and keyboard behavior behind one player controller while preserving the existing UI exactly.",
  },
  {
    title: "Introduce explicit policies",
    detail:
      "A presentation policy selects focused, embedded, or review. A separate capability policy enables Ask AI, explain, hint, memory aid, audio, trust, grading, and mastery.",
  },
  {
    title: "Wrap current inputs with adapters",
    detail:
      "Keep every current entry point working. Chat blocks, Education records, and Canvas payloads reshape into flashcard_set before reaching the player.",
  },
  {
    title: "Canary one surface at a time",
    detail:
      "Start with Chat focused mode, compare navigation and rendering parity, then enable Education capabilities and Canvas embedded mode behind reversible routing.",
  },
  {
    title: "Remove twins only after measured parity",
    detail:
      "Delete old viewers and processing paths only when adapter tests, interaction tests, live rendering, persistence, grading, and AI execution are proven on every consumer.",
  },
] as const;

const MAPPING = [
  {
    source: "Chat",
    style: "Focused",
    capabilities: "Browse · Ask AI · explain · hint · audio · trust",
  },
  {
    source: "Education",
    style: "Focused or review",
    capabilities: "All learning tools · grading · prediction · mastery",
  },
  {
    source: "Canvas",
    style: "Embedded",
    capabilities: "Browse · Ask AI · explain · hint · trust",
  },
] as const;

export default function CanonicalFlashcardsDemoHubPage() {
  return (
    <main className="min-h-dvh bg-textured text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <FlaskConical className="h-4 w-4" />
              Isolated migration proof
            </div>
            <h1 className="max-w-4xl text-balance text-[clamp(2rem,1.5rem+2vw,3.5rem)] font-semibold leading-[1.05] tracking-tight">
              One flashcard system, shaped by context
            </h1>
            <p className="mt-4 max-w-3xl text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] leading-relaxed text-muted-foreground">
              Every source adapts into one{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
                flashcard_set
              </code>
              . One player owns behavior. Small policies decide how it looks and
              which learning capabilities appear.
            </p>
          </div>

          <div className="rounded-2xl border border-success/30 bg-success/10 p-5 shadow-[var(--elevation-1)]">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>
                <h2 className="font-semibold text-foreground">
                  Recommendation: Refine
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Use the current focused interaction model as the canonical
                  base. It is the lowest-risk path because it preserves the
                  strongest existing behavior while making source, style, and
                  capabilities explicit inputs.
                </p>
                <Link
                  href="/demos/canonical-flashcards/refine"
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open recommended proof
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="architecture-heading">
          <div className="mb-4 flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <h2 id="architecture-heading" className="text-xl font-semibold">
              Target rendering contract
            </h2>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            {ARCHITECTURE.map(({ label, detail, icon: Icon }, index) => (
              <div
                key={label}
                className="relative rounded-xl border border-border bg-card p-4 shadow-[var(--elevation-1)]"
              >
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <h3 className="text-sm font-semibold">{label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {detail}
                </p>
                {index < ARCHITECTURE.length - 1 ? (
                  <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-background text-primary md:block" />
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            The policies are independent: the same focused style can expose
            browse-only tools in one context and the complete study capability
            set in another, without forking the renderer.
          </div>
        </section>

        <section aria-labelledby="variants-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="variants-heading" className="text-xl font-semibold">
                Open every working direction
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                All four routes remain available for direct comparison.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {VARIANTS.map((variant) => (
              <Link
                key={variant.id}
                href={`/demos/canonical-flashcards/${variant.id}`}
                className="group flex min-h-44 flex-col rounded-2xl border border-border bg-card p-5 shadow-[var(--elevation-1)] transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{variant.name}</h3>
                      {variant.recommendation ? (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                          Recommended
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-primary">
                      {variant.posture}
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {variant.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">
                Ideas to carry into Refine
              </h2>
            </div>
            <div className="space-y-4">
              <div className="border-l-2 border-primary pl-3">
                <h3 className="text-sm font-semibold">From Reimagine</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Let the source surface select its default presentation through
                  policy, and make every AI handoff show the boundary between
                  human input and named card/deck/source context.
                </p>
              </div>
              <div className="border-l-2 border-primary pl-3">
                <h3 className="text-sm font-semibold">From Dense</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Keep learning actions persistently visible when width permits,
                  retain the deck queue for power study, and collapse both into
                  one safe-area-aware mobile action surface.
                </p>
              </div>
              <div className="border-l-2 border-primary pl-3">
                <h3 className="text-sm font-semibold">From Sharp</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Preserve the concise gesture language and inspectable action
                  contract so capabilities never become mysterious buttons.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">
                  Source and policy mapping
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Defaults, not new component identities.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Default style</th>
                    <th className="px-4 py-3 font-medium">Capability policy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {MAPPING.map((row) => (
                    <tr key={row.source}>
                      <td className="px-4 py-3 font-semibold">{row.source}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.style}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.capabilities}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="migration-heading"
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <div className="mb-5 flex items-center gap-2">
            <TestTubeDiagonal className="h-5 w-5 text-primary" />
            <div>
              <h2 id="migration-heading" className="text-xl font-semibold">
                Non-breaking migration sequence
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the canonical path beside existing consumers; remove twins
                last.
              </p>
            </div>
          </div>
          <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {MIGRATION_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="rounded-xl border border-border bg-muted/30 p-4"
              >
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-success/30 bg-success/10 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Check className="h-5 w-5 text-success" />
              <h2 className="font-semibold">What these demos prove</h2>
            </div>
            <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>
                One typed set can drive focused, embedded, and review
                presentations.
              </li>
              <li>
                Navigation, gestures, progress, actions, and trust can remain
                one behavioral system.
              </li>
              <li>
                Source-specific defaults do not require source-specific viewers.
              </li>
              <li>
                Mobile and desktop can expose the same capabilities with
                different placement.
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5">
            <div className="mb-3 flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-warning" />
              <h2 className="font-semibold">What they do not prove yet</h2>
            </div>
            <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Production payload compatibility or database persistence.</li>
              <li>
                Real agent execution, streaming, reconnect, or AI response
                rendering.
              </li>
              <li>
                Study grading, mastery scheduling, analytics, or cross-session
                restoration.
              </li>
              <li>
                Live parity across every existing chat, Education, and Canvas
                consumer.
              </li>
            </ul>
          </div>
        </section>

        <div className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 p-4 text-sm text-muted-foreground">
          <TestTubeDiagonal className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          Every variant uses representative fixtures and performs no production
          writes. Learning-action results are contract demonstrations, not AI
          execution. The safe next step is adapter and parity testing, not
          replacing production viewers from this demo alone.
        </div>
      </div>
    </main>
  );
}
