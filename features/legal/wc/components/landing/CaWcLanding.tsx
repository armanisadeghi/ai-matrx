import Link from "next/link";
import {
  Hammer,
  Calculator,
  FileText,
  ClipboardCheck,
  MessageSquare,
  LineChart,
  Library,
  ArrowRight,
  CheckCircle2,
  Briefcase,
  ShieldHalf,
  Search,
  FileStack,
  Compass,
  Eye,
  BookCheck,
  Network,
  Lock,
  Quote
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATS = [
  { value: "100%", label: "AMA Guides aligned" },
  { value: "5", label: "Calculators in one shell" },
  { value: "Both", label: "Sides supported" },
  { value: "ZDR", label: "Zero data retention" },
];

const CORE_CAPABILITIES = [
  {
    icon: Compass,
    title: "Agentic, not just generative",
    description:
      "Multi-step WC workflows run end to end — AOE/COE memos, QME review, deposition prep, settlement modeling, ratings. Procured as a digital workforce, not a chat box.",
  },
  {
    icon: FileStack,
    title: "Search every record, cited to the paragraph",
    description:
      "Upload medical reports, QME/AME reports, deposition transcripts, applications, and DWC correspondence. Ask in plain English; every answer pins back to the document, page, and paragraph.",
  },
  {
    icon: Search,
    title: "Case-law & rules research with citations",
    description:
      "Search the Labor Code, panel decisions, agency bulletins, and the broader web in one place. Every claim in the resulting memo links back to the source it came from.",
  },
  {
    icon: BookCheck,
    title: "Your firm’s playbook, enforced",
    description:
      "Encode your firm’s standard apportionment positions, MMI thresholds, settlement bands, and deal-breakers. Drafts and reviews flag deviations from your playbook automatically — applicant or defense.",
  },
  {
    icon: Calculator,
    title: "Deterministic WC calculators",
    description:
      "PD ratings (0–100%), weeks of indemnity, present value, life-pension thresholds at 70%+, and AWC. Numbers an adjuster will not argue with.",
  },
  {
    icon: Eye,
    title: "Replayable on every action",
    description:
      "Every model call, document read, calculation, and edit is traced and replayable. Hand the trajectory to opposing counsel, a WCAB judge, or compliance.",
  },
];

const WORKFLOWS: Array<{
  icon: typeof Calculator;
  title: string;
  description: string;
  href?: string;
}> = [
  {
    icon: Calculator,
    title: "PD Ratings Calculator",
    description:
      "AMA-Guides-aligned PD ratings 0%–100%, with age + occupation adjustments, weeks, present value, life expectancy, and AWC.",
    href: "/legal/ca-wc/pd-ratings-calculator",
  },
  {
    icon: FileText,
    title: "AOE/COE memos",
    description:
      "Pull from medical records and witness statements, draft an arising-out-of-employment memo, then verify every cite.",
  },
  {
    icon: ClipboardCheck,
    title: "QME report review",
    description:
      "Cross-check QME conclusions against the underlying records. Flag inconsistencies, missing impairments, and apportionment issues.",
  },
  {
    icon: MessageSquare,
    title: "Deposition prep",
    description:
      "Outlines, exhibits, prior-statement contradictions, and follow-up branches generated against the indexed file.",
  },
  {
    icon: LineChart,
    title: "Settlement modeling",
    description:
      "Project ratings under different impairment + apportionment scenarios. Compare PD weeks, present values, and lifetime exposure.",
  },
  {
    icon: Library,
    title: "Defense / applicant libraries",
    description:
      "Bring your firm’s playbooks, motion templates, and prior briefs. Drafts ground against your own library — not the public internet.",
  },
];

const SIDES: Array<{
  icon: typeof Briefcase;
  title: string;
  blurb: string;
  items: string[];
}> = [
  {
    icon: Briefcase,
    title: "For Applicants’ Attorneys",
    blurb:
      "Maximize legitimate impairment recognition, project value clearly, and draft from MMI in hours, not days.",
    items: [
      "Max out impairment recognition",
      "Present value comparisons for settlement",
      "Life pension projections at 70%+",
      "MMI-to-rating drafting",
      "Future medical exposure modeling",
    ],
  },
  {
    icon: ShieldHalf,
    title: "For Defense Firms",
    blurb:
      "Cross-examine the medical record, isolate non-industrial apportionment, and model exposure with numbers an adjuster trusts.",
    items: [
      "Apportionment analysis",
      "QME / AME report review",
      "Exposure modeling",
      "Compliance auditing",
      "Prior-claim cross-reference",
    ],
  },
];

const STEPS = [
  {
    number: "01",
    title: "Open or import a claim",
    description:
      "Applicant info, date of injury, occupational code, weekly earnings — pulled from your DMS or entered fresh, with permissions preserved.",
  },
  {
    number: "02",
    title: "Index records & impairments",
    description:
      "Medical reports indexed, impairments mapped to AMA codes, side and apportionment captured. Cited back to the page and paragraph.",
  },
  {
    number: "03",
    title: "Calculate, draft, and review",
    description:
      "Ratings, briefs, memos, and depositions — all grounded in the saved file and your firm’s playbook, all replayable.",
  },
  {
    number: "04",
    title: "Iterate & explain",
    description:
      "Adjust apportionment, swap impairments, regenerate. Hand the full trajectory to a partner, an adjuster, or the WCAB.",
  },
];

const PROCUREMENT = [
  {
    icon: Network,
    title: "Identity-aware, sits on your systems of record",
    description:
      "Plugs into your DMS, calendaring, and billing — document-level permissions preserved end to end. The intelligence layer on top of what you already trust.",
  },
  {
    icon: Lock,
    title: "Zero Data Retention + attorney-client privilege",
    description:
      "Privileged client data never trains the model. SOC 2 Type II and ISO 27001 are the baseline, not the upgrade.",
  },
  {
    icon: Quote,
    title: "Citation-rich, hallucination-resistant",
    description:
      "Every claim, draft, and rating pins back to a source — page, paragraph, panel decision, statute. Designed to refuse rather than fabricate.",
  },
];

export default function CaWcLanding() {
  return (
    <div className="min-h-dvh">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent"
        />
        <div
          aria-hidden
          className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Hammer className="h-3.5 w-3.5" />
            California Workers&rsquo; Comp
          </div>
          <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.75rem)] font-bold tracking-tight text-foreground leading-[1.1]">
            The agentic harness, built for{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              California WC firms.
            </span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] text-muted-foreground leading-relaxed">
            Research with citations. Records review pinned to the paragraph.
            Drafting agents that enforce your firm&rsquo;s playbook.
            Deterministic WC calculators. Procured as a digital workforce —
            auditable, identity-aware, and built to live on top of the systems
            of record your applicant or defense practice already runs on.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8"
              asChild
            >
              <Link href="#capabilities">See what it does</Link>
            </Button>
          </div>

          {/* Stat row */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-card/60 backdrop-blur px-4 py-3"
              >
                <div className="text-xl md:text-2xl font-bold tracking-tight">
                  {stat.value}
                </div>
                <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core capabilities */}
      <section
        id="capabilities"
        className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24"
      >
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            From copilot to digital workforce — for WC firms
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Six core capabilities under every claim — agentic execution
            grounded in the file, your firm&rsquo;s playbook, and the
            authoritative WC sources you already cite.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {CORE_CAPABILITIES.map((feature) => (
            <div
              key={feature.title}
              className={cn(
                "group relative rounded-2xl border border-border bg-card p-6",
                "transition-all duration-300",
                "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Both sides */}
      <section className="bg-card/50 border-y border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
              Built for both sides
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Same harness. Same observability. Different playbooks.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {SIDES.map((side) => (
              <div
                key={side.title}
                className="rounded-2xl border border-border bg-card p-6 sm:p-8"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <side.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{side.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                  {side.blurb}
                </p>
                <ul className="space-y-2.5">
                  {side.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WC-specific workflows */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            WC workflows, end to end
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Specialty surfaces tuned to the documents, calculations, and
            checkpoints that actually move a CA WC matter forward.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {WORKFLOWS.map((feature) => {
            const inner = (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold mb-2 flex items-center gap-1.5">
                  {feature.title}
                  {feature.href ? (
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  ) : null}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </>
            );

            const cardClass = cn(
              "group relative rounded-2xl border border-border bg-card p-6",
              "transition-all duration-300",
              "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
            );

            if (feature.href) {
              return (
                <Link
                  key={feature.title}
                  href={feature.href}
                  className={cardClass}
                >
                  {inner}
                </Link>
              );
            }

            return (
              <div key={feature.title} className={cardClass}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-card/50 border-y border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
              How it works
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              From intake to defensible numbers and drafted documents in four
              steps.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            {STEPS.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary font-bold text-lg">
                  {step.number}
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Procurement audit */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Built for the 2026 procurement audit
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Same security and interoperability bar as the largest WC defense
            panels and applicant practices already passing IT review.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {PROCUREMENT.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Bring AI Matrx into your WC practice
          </h2>
          <p className="mt-4 text-muted-foreground text-lg mb-8">
            Research, drafting, depositions, and ratings — for applicant and
            defense firms alike. Built for California WC, replayable end to
            end, and built to clear your firm&rsquo;s procurement bar.
          </p>
          <Button size="lg" className="min-h-[44px] text-base px-10 gap-2">
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
