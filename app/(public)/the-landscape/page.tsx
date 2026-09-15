import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  Code2,
  Download,
  GitBranch,
  Info,
  Layers,
  Minus,
  Search,
  SlidersHorizontal,
  Sprout,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/the-landscape", {
  title: "The Landscape",
  description:
    "We name every serious alternative, say honestly where each one is better than us, and say exactly where it stops. Plus the seven questions to put to any AI vendor — including us.",
  canonicalPath: "/the-landscape",
  keywords: [
    "enterprise AI comparison",
    "AI vendor evaluation",
    "AI buyer checklist",
  ],
});

/**
 * THE LANDSCAPE — the honest competitive page.
 *
 * Source of truth for the structure and posture:
 * `common-docs/systems/masterwork/doctrine/advantage-stack.md` §5 (the
 * landscape), §6 (paths, packages and engagement tiers).
 *
 * 🚨 EVERY NAMED-COMPETITOR CLAIM ON THIS PAGE WAS FACT-CHECKED AGAINST
 * CURRENT PUBLIC PRODUCT FACTS ON 2026-09-14, and several doctrine lines were
 * deliberately SOFTENED to what is verifiable. Do not restore the sharper
 * doctrine wording without re-checking. Specifically:
 *   • "Windsurf" is gone — Cognition renamed it Devin Desktop (June 2026).
 *   • Coding agents' steering layer is no longer "thin and manual" — GitHub
 *     Copilot shipped org-level custom instructions to GA (2026-04-02).
 *   • "Nothing is auditable" about seats is FALSE — every major enterprise
 *     tier ships usage/compliance audit logging. The surviving distinction is
 *     usage auditability vs. REASONING provenance.
 *   • Horizontal assistants are no longer retrieval-only — Copilot Studio,
 *     Google's Agent Designer and Glean's Agent Builder all ship agent
 *     construction. The surviving point is WHAT the agents encode.
 *   • Salesforce's umbrella is "Agentforce 360"; ServiceNow's products are AI
 *     Agent Studio / Orchestrator; SAP's is Joule Studio. Re-check Salesforce
 *     naming after Dreamforce — a rename wave started 2026-09-14.
 *   • Vertical AI vendors DO customise per account (Harvey Agent Builder,
 *     Decagon AOPs, Sierra Agent Studio, Abridge per-clinician style). The
 *     surviving point is organisational vs. personal customisation.
 *   • "Fine-tuning needs volume" is refuted by OpenAI's own RFT guidance
 *     ("several dozen to a few hundred examples"). Removed.
 * Named eval harnesses we may cite: Harvey's BigLaw Bench, Sierra's τ-bench.
 * We may NOT imply Abridge or EvenUp publish one. No valuations anywhere.
 *
 * 🚨 CLAIM DISCIPLINE (advantage-stack §9): positioning only. No benchmark
 * numbers, no multiples, no "beat the frontier model" until a trial is logged.
 *
 * Server component: crawlable, zero JS.
 */

type Category = {
  icon: LucideIcon;
  title: string;
  examples: string;
  better: string;
  stops: string;
  posture?: string;
};

/** advantage-stack.md §5.1–§5.8, fact-checked and softened 2026-09-14. */
const CATEGORIES: Category[] = [
  {
    icon: Code2,
    title: "Agentic coding tools",
    examples:
      "Claude Code, OpenAI Codex, Cursor, GitHub Copilot, Cognition's Devin Desktop (formerly Windsurf)",
    better:
      "Genuinely excellent, and we say so. Repo-wide reasoning, terminal-native execution, tight feedback loops, and productivity gains that show up in shipped software. If you have engineers, buy these. We use them ourselves.",
    stops:
      "They are aimed at work that has an oracle — the tests pass or they don't — and a shared professional idiom. Their steering layer has grown up: rules files, session memory, organisation-level custom instructions. But that captures a team's conventions, not how your specific person decides. And none of them, in their current public documentation, grades output against a named human expert's withheld judgment; what they ship is rubric-based model-as-judge evaluation and automated code review.",
    posture:
      "Complement, never competitor. Keep them. They don't do this and they aren't trying to.",
  },
  {
    icon: Users,
    title: "Seats for everyone, plus enablement",
    examples: "Claude, ChatGPT and Gemini rolled out to all staff",
    better:
      "This is often the highest-ROI first move a company can make, and we will say that to your face. Cheap, immediate, broad, no integration project. If you have not done it, do it before you talk to us.",
    stops:
      "Output quality tracks the median employee's prompting skill — your best expert gets a little faster, your weakest one gets confidently wrong faster. Shared projects and org-level instructions capture some house style, but not how your best person actually decides, so nothing is consistent and nothing compounds: month twenty-four looks like month one plus a better model. And the auditability on offer is usage auditability — every major enterprise tier now exports who asked what and when, into your compliance tooling. What none of them provides is reasoning provenance: a record of why a call was made, against whose standard, that you could defend later.",
    posture:
      "Seats make your people faster. They don't make your company keep anything. When your best adjuster retires, the seat stays and the judgment leaves.",
  },
  {
    icon: Search,
    title: "Horizontal enterprise assistants",
    examples: "Microsoft 365 Copilot, Gemini Enterprise, Glean",
    better:
      "Genuinely strong at the thing that is genuinely hard: secure, governed access to your own data across mail, files, chat and tickets. Enterprise search over a real corpus is a serious engineering achievement, procurement is easy, and it is often already in the contract. All three now let you assemble agents on top of that corpus, not merely search it.",
    stops:
      "The agents they build automate what your company has already written down. They answer “what did we say?” and “what is the documented process?” — not “how would our best person have judged this?” They are also tuned to serve everyone, which means tuned to the median.",
    posture:
      "We are a consumer of their plumbing, not a replacement for it. Their retrieval feeds our capture.",
  },
  {
    icon: Building2,
    title: "Platform agents where the data lives",
    examples:
      "Salesforce Agentforce 360, ServiceNow AI Agent Studio and Orchestrator, SAP Joule Studio, Palantir AIP",
    better:
      "Real strengths. Agents inside the system of record with governed actions is the correct architecture for structured business process. Palantir in particular brings genuine ontology and operational depth, plus a services model that gets things deployed in hard environments.",
    stops:
      "They encode the process, which the company already knows. The workflow was never the hard part. The value we chase is the deviation from the process that the good ones make.",
  },
  {
    icon: Layers,
    title: "Vertical AI products",
    examples: "Harvey, Abridge, Sierra, Decagon, EvenUp, and the rest",
    better:
      "The most honest section here. These are strong companies with deep domain investment and, in several cases, serious public eval harnesses — Harvey publishes BigLaw Bench, Sierra publishes τ-bench. The customer-service agent companies in particular have built much of what we are describing, for one domain. That is a validation of the model, not a refutation of it. They also customise per account: firm playbooks, agent operating procedures, per-clinician note style.",
    stops:
      "The customisation is organisational, not personal. You configure a firm's policy, its tone, its procedures — but the starting point is still the field's consensus, because a vertical product has to serve every customer in the field. For eighty percent of the work, industry-standard is fine and you should buy theirs. For the twenty percent where your expert's deviation is your margin, it cannot help — and the vendor cannot build it for you without building it for your competitor. You can also only buy one for a field somebody has already productised.",
    posture:
      "The question to ask is simple: does it do it your way, or the industry's way?",
  },
  {
    icon: GitBranch,
    title: "Build it yourself",
    examples: "LangChain and LangGraph, LlamaIndex, DSPy, Temporal, plus APIs",
    better:
      "Genuinely viable for a company with a strong engineering team. The frameworks are real and mature — LangChain and LangGraph reached 1.0, DSPy-style automatic prompt optimisation is a real and actively advancing technique, and Temporal now markets durable execution for agents directly. You own everything.",
    stops:
      "They give you the machinery, not the method. The framework was never the hard part — capture and evaluation are, and every in-house team we have seen underestimates both by roughly an order of magnitude. They ship a working pipeline in six weeks and then spend eighteen months unable to answer “is it actually as good as Maria?”, because nobody built the oracle. Nothing in these frameworks tells you how to elicit one person's judgment, or how to know when you have captured it.",
    posture:
      "If you have the team and the patience, consider it. We would rather sell you the bench than lose you entirely.",
  },
  {
    icon: SlidersHorizontal,
    title: "Fine-tuning and custom training",
    examples: "Supervised tuning and reinforcement fine-tuning",
    better:
      "Sometimes the right answer, and our own doctrine says so out loud: if you could fine-tune it, fine-tune it. With clean labelled pairs, training can beat a workflow — and the data bar has come down. OpenAI's own reinforcement fine-tuning guidance tells you to start with several dozen to a few hundred examples, though Google's Vertex tuning still asks for a hundred as a floor. We will tell a prospect this and disqualify ourselves from that use case.",
    stops:
      "A tuning set needs pairs that already exist. There is no corpus of how one particular person decides, and no vendor today markets tuning as a way to capture one named individual's judgment. The nearest thing on the market learns a person's writing voice from their files — that is style, not judgment.",
  },
  {
    icon: UserRound,
    title: "The consultant who says they will build it better",
    examples: "A good independent, or a boutique shop",
    better:
      "Sometimes true. A good independent building one narrow workflow for a motivated client can absolutely ship something great, faster and cheaper than an enterprise vendor.",
    stops:
      "What almost never comes with it: an evaluation harness, a repeatable capture methodology, provenance on every rule, maintenance after the invoice clears, and any way to prove the result beyond “looks good to me.”",
  },
];

/** advantage-stack.md §5.8 — the seven questions. */
const CHECKLIST: string[] = [
  "How will you capture what my expert knows but cannot articulate? Name the technique.",
  "How will you prove the output matches my expert, rather than a competent generalist?",
  "Show me the comparison against a top frontier model given the same material and a hundred times the budget.",
  "Who grades it, and how did you prove the grader agrees with my expert?",
  "What happens when my expert changes their mind?",
  "Who owns the captured method — me, or you?",
  "What does it cost per run, and what is the latency?",
];

/** advantage-stack.md §6 — paths and packages. */
type Verdict = "yes" | "no" | "partial" | "note";

type PathRow = {
  dimension: string;
  /** seats · horizontal · vertical · inHouse · matrx */
  cells: Array<{ verdict: Verdict; label: string }>;
};

const PATH_COLUMNS = [
  "Seats + training",
  "Horizontal assistant",
  "Vertical product",
  "Build in-house",
] as const;

const PATH_ROWS: PathRow[] = [
  {
    dimension: "Time to first value",
    cells: [
      { verdict: "note", label: "Days" },
      { verdict: "note", label: "Weeks" },
      { verdict: "note", label: "Weeks" },
      { verdict: "note", label: "6–18 months" },
      { verdict: "note", label: "Weeks per workflow" },
    ],
  },
  {
    dimension: "Captures tacit judgment",
    cells: [
      { verdict: "no", label: "No" },
      { verdict: "no", label: "No" },
      { verdict: "no", label: "No" },
      { verdict: "partial", label: "Rarely" },
      { verdict: "yes", label: "The entire point" },
    ],
  },
  {
    dimension: "Consistent across staff",
    cells: [
      { verdict: "no", label: "No" },
      { verdict: "partial", label: "Partial" },
      { verdict: "yes", label: "Yes" },
      { verdict: "yes", label: "Yes" },
      { verdict: "yes", label: "Yes" },
    ],
  },
  {
    dimension: "Matches your expert, not the industry norm",
    cells: [
      { verdict: "no", label: "No" },
      { verdict: "no", label: "No" },
      { verdict: "no", label: "Firm-level at best" },
      { verdict: "partial", label: "Maybe" },
      { verdict: "yes", label: "Yes" },
    ],
  },
  {
    dimension: "Compounds from your corrections",
    cells: [
      { verdict: "no", label: "No" },
      { verdict: "no", label: "No" },
      { verdict: "partial", label: "The vendor's benefit" },
      { verdict: "partial", label: "If you build it" },
      { verdict: "yes", label: "Yes" },
    ],
  },
  {
    dimension: "Provable against withheld ground truth",
    cells: [
      { verdict: "no", label: "No" },
      { verdict: "no", label: "No" },
      { verdict: "partial", label: "Sometimes" },
      { verdict: "partial", label: "Rarely" },
      { verdict: "yes", label: "Five-arm bench" },
    ],
  },
  {
    dimension: "Survives the expert leaving",
    cells: [
      { verdict: "no", label: "No" },
      { verdict: "no", label: "No" },
      { verdict: "note", label: "Not applicable" },
      { verdict: "partial", label: "Partial" },
      { verdict: "yes", label: "Yes" },
    ],
  },
  {
    dimension: "Who owns the captured method",
    cells: [
      { verdict: "no", label: "Nobody" },
      { verdict: "no", label: "The vendor" },
      { verdict: "no", label: "The vendor" },
      { verdict: "yes", label: "You" },
      { verdict: "yes", label: "You" },
    ],
  },
  {
    dimension: "Run cost",
    cells: [
      { verdict: "note", label: "Per seat" },
      { verdict: "note", label: "Per seat" },
      { verdict: "note", label: "Per seat or action" },
      { verdict: "note", label: "Your tokens" },
      { verdict: "note", label: "Cheap model, measured per run" },
    ],
  },
];

/** advantage-stack.md §6 — engagement tiers. */
const TIERS: Array<{ icon: LucideIcon; name: string; body: string }> = [
  {
    icon: ClipboardList,
    name: "Audit",
    body: "We run your candidate workflows through our gate and tell you which are worth capturing, which you should just buy seats for, and which you should fine-tune instead. We will disqualify workflows in writing. This tier sells the next one by being honest in this one.",
  },
  {
    icon: UserRound,
    name: "Single Masterwork",
    body: "One expert, one workflow, the full capture stack, the five-arm proof, and the expert's own sign-off at the end of it.",
  },
  {
    icon: Users,
    name: "Vertical programme",
    body: "Several experts across one function — including the ones who disagree with each other, kept apart and routed rather than averaged into a bland middle.",
  },
  {
    icon: Sprout,
    name: "Capture platform",
    body: "You run your own captures on our stack, with our protocols and our bench.",
  },
];

const VERDICT_ICON: Record<Verdict, LucideIcon | null> = {
  yes: Check,
  no: X,
  partial: Minus,
  note: null,
};

const VERDICT_TONE: Record<Verdict, string> = {
  yes: "text-emerald-600 dark:text-emerald-400",
  no: "text-red-500",
  partial: "text-amber-600 dark:text-amber-400",
  note: "text-muted-foreground",
};

function VerdictCell({
  verdict,
  label,
  emphasise,
}: {
  verdict: Verdict;
  label: string;
  emphasise: boolean;
}) {
  const Icon = VERDICT_ICON[verdict];
  return (
    <span
      className={`inline-flex items-start gap-1.5 leading-relaxed ${
        emphasise ? "font-medium text-foreground" : "text-muted-foreground"
      }`}
    >
      {Icon ? (
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${VERDICT_TONE[verdict]}`}
          strokeWidth={2.5}
          aria-hidden
        />
      ) : null}
      {label}
    </span>
  );
}

export default function TheLandscapePage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 pt-10 lg:pt-16">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Layers className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            The landscape
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            A vendor who will not name competitors is hiding something.
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            So here is every serious alternative to us, by name, with an honest
            account of where each one is genuinely better than we are — and
            exactly where it stops. Most of them, you should buy.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="#checklist"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              The seven questions
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
            <Link
              href="/how-we-prove-it"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
            >
              How we prove it
            </Link>
          </div>
        </section>

        {/* ── The structural insight ───────────────────────────────── */}
        <section className="mt-10 lg:mt-14">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 lg:p-8">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              Why the coding-agent playbook does not transfer
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Coding tools are extraordinary because code has a free oracle: the
              tests pass or they do not. The agent can try, check and retry all
              night without a human in the loop.
            </p>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              The rest of the enterprise has no oracle. There is no unit test
              for &ldquo;was that the right claim to deny&rdquo;, &ldquo;was
              that the right bid&rdquo;, or &ldquo;was that the right
              candidate&rdquo;.
            </p>
            <p className="max-w-3xl text-pretty text-sm font-medium leading-relaxed text-foreground md:text-base">
              We build the oracle. That is what the captured expert method and
              the bench actually are — and it is why the companies who tried to
              copy the coding-agent playbook into the back office have been
              disappointed.
            </p>
          </div>
        </section>

        {/* ── The categories ───────────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              Every category, named
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Product facts below were checked against current public
              documentation on 14 September 2026.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <article
                  key={category.title}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon
                          className="h-4.5 w-4.5"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-balance text-base font-semibold tracking-tight sm:text-lg">
                          {category.title}
                        </h3>
                        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                          {category.examples}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <h4 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
                        <Check
                          className="h-3.5 w-3.5"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                        Where they are genuinely better
                      </h4>
                      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                        {category.better}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <h4 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        <X
                          className="h-3.5 w-3.5 text-red-500"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                        Where they stop
                      </h4>
                      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                        {category.stops}
                      </p>
                    </div>
                  </div>

                  {category.posture ? (
                    <p className="text-pretty rounded-lg border border-border/60 bg-foreground/[0.03] px-4 py-3 text-sm font-medium leading-relaxed text-foreground">
                      {category.posture}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {/* ── The checklist ────────────────────────────────────────── */}
        <section id="checklist" className="mt-12 scroll-mt-20 lg:mt-16">
          <div className="flex flex-col gap-5 rounded-2xl border-2 border-foreground/15 bg-card p-6 lg:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-2">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <ClipboardList
                    className="h-3.5 w-3.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                  Take this with you
                </span>
                <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
                  Seven questions to ask any AI vendor
                </h2>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
                  Use these on everyone you are considering. Use them on us
                  first — that is the point of publishing them.
                </p>
              </div>
              <a
                href="/matrx/ai-vendor-checklist.txt"
                download="ai-vendor-checklist.txt"
                className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-accent/40"
              >
                <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
                Download the checklist
              </a>
            </div>

            <ol className="flex flex-col gap-3">
              {CHECKLIST.map((question, idx) => (
                <li
                  key={question}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-4"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                    {idx + 1}
                  </span>
                  <p className="text-pretty text-sm leading-relaxed text-foreground">
                    {question}
                  </p>
                </li>
              ))}
            </ol>

            <p className="text-pretty border-t border-border pt-4 text-sm font-semibold leading-relaxed text-foreground">
              A vendor who cannot answer three and four has not built a system.
              They have built a demo.
            </p>
          </div>
        </section>

        {/* ── Paths and packages ───────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              What you get, depending on the road you take
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              These are paths, not enemies. Most companies should be on several
              of them at once — and we are the last column, not a replacement
              for the first four.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Comparison of five paths to enterprise AI across nine dimensions
              </caption>
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold tracking-tight"
                  >
                    Dimension
                  </th>
                  {PATH_COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-5 py-4 font-semibold tracking-tight text-muted-foreground"
                    >
                      {column}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="whitespace-nowrap bg-primary/[0.06] px-5 py-4 font-semibold tracking-tight"
                  >
                    AI Matrx Masterwork
                  </th>
                </tr>
              </thead>
              <tbody>
                {PATH_ROWS.map((row, idx) => (
                  <tr
                    key={row.dimension}
                    className={
                      idx % 2 === 0
                        ? "border-b border-border/60 bg-card/40"
                        : "border-b border-border/60 bg-card/70"
                    }
                  >
                    <th
                      scope="row"
                      className="px-5 py-4 align-top text-left font-medium tracking-tight"
                    >
                      {row.dimension}
                    </th>
                    {row.cells.map((cell, cellIdx) => {
                      const isOurs = cellIdx === row.cells.length - 1;
                      return (
                        <td
                          key={`${row.dimension}-${cellIdx}`}
                          className={`px-5 py-4 align-top ${isOurs ? "bg-primary/[0.06]" : ""}`}
                        >
                          <VerdictCell
                            verdict={cell.verdict}
                            label={cell.label}
                            emphasise={isOurs}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/80">
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            This table describes the typical shape of each path, not a claim
            about any single product at a single moment. Vendor capabilities in
            this market move monthly; if you believe a cell is out of date, tell
            us and we will check it and change it.
          </p>
        </section>

        {/* ── Engagement tiers ─────────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              How we engage
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Four tiers. The first one exists to tell you whether you need the
              other three.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TIERS.map(({ icon: Icon, name, body }) => (
              <article
                key={name}
                className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                </span>
                <h3 className="text-balance text-base font-semibold tracking-tight">
                  {name}
                </h3>
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Summary posture ──────────────────────────────────────── */}
        <section className="mt-12 lg:mt-16">
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 lg:p-8">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              Our posture, in three sentences
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              We compete with almost none of these. We sit on top of the
              plumbing you have already bought, aimed at the twenty percent of
              work where your people&apos;s judgment — not the industry&apos;s —
              is the whole value.
            </p>
            <blockquote className="max-w-3xl border-l-2 border-primary/40 pl-4 text-pretty text-lg font-medium leading-relaxed tracking-tight md:text-2xl">
              Buy the seats. Keep the Copilot. Then point us at the six people
              whose judgment you can&apos;t afford to lose.
            </blockquote>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <section className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-border bg-card/60 p-6 sm:flex-row sm:items-center sm:justify-between lg:mt-16 lg:p-8">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-balance text-xl font-semibold tracking-tight">
              Start with the audit.
            </h2>
            <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              We will tell you which of your workflows are worth capturing and
              which you should simply buy seats for — in writing, including the
              ones we disqualify.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/why-ai-matrx"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-accent/40"
            >
              Why AI Matrx
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              Talk to us
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
