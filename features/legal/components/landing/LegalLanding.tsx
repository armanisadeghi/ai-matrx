import Link from "next/link";
import {
  Scale,
  Search,
  FileStack,
  Compass,
  Calculator,
  Eye,
  BookCheck,
  Network,
  Lock,
  Quote,
  Workflow,
  ArrowRight,
  CheckCircle2,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  {
    icon: Compass,
    title: "Agentic, not just generative",
    description:
      "Multi-step legal workflows run end to end — redlines, compliance audits, drafting, depositions, calculations. Procured as a digital workforce, not a chat box.",
  },
  {
    icon: FileStack,
    title: "Your case files, cited to the paragraph",
    description:
      "Upload pleadings, depositions, medical records, contracts, exhibits. Ask in plain English; every answer pins back to the document, page, and paragraph.",
  },
  {
    icon: Search,
    title: "Research, grounded in authoritative sources",
    description:
      "Statutes, case law, regulatory filings, and the broader web — searched, synthesized, and turned into a structured memo. Every claim links back to the source it came from.",
  },
  {
    icon: BookCheck,
    title: "Your firm’s playbook, enforced",
    description:
      "Encode standard positions, fallback clauses, and deal-breakers. Drafts and reviews flag deviations against your firm’s positions — not generic best-practice.",
  },
  {
    icon: Calculator,
    title: "Deterministic calculators",
    description:
      "Practice-area math executes through validated formulas — PD ratings, weeks, present value, life expectancy. Numbers an adjuster will not argue with.",
  },
  {
    icon: Eye,
    title: "Replayable on every action",
    description:
      "Every model call, document read, calculation, and edit is traced and replayable. Hand the trajectory to opposing counsel, a partner, or compliance.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Bring the file in",
    description:
      "Upload pleadings, medical records, depositions, exhibits — or pull them straight from your DMS with permissions preserved.",
  },
  {
    number: "02",
    title: "Indexed per matter",
    description:
      "Documents are organized into a private, per-matter knowledge base. Searchable in seconds, with every answer pinned to its source.",
  },
  {
    number: "03",
    title: "Run the workflow",
    description:
      "Research, draft, calculate, summarize — pick the agent, set the inputs. Workflows execute end to end, not just suggest text.",
  },
  {
    number: "04",
    title: "Verify, then ship",
    description:
      "Replay the trajectory, override anything, regenerate. Nothing leaves the harness without an attorney pass.",
  },
];

const PRACTICE_AREAS: Array<{
  title: string;
  status: string;
  href?: string;
  items: string[];
}> = [
  {
    title: "California Workers’ Comp",
    status: "Live",
    href: "/legal/ca-wc",
    items: [
      "PD ratings calculator",
      "AOE/COE analysis",
      "QME review",
      "Deposition prep",
    ],
  },
  {
    title: "Personal Injury",
    status: "Coming soon",
    items: [
      "Settlement modeling",
      "Medical record summaries",
      "Demand letters",
      "Comparative liability",
    ],
  },
  {
    title: "Estate Planning",
    status: "Coming soon",
    items: [
      "Trust drafting",
      "Asset mapping",
      "Beneficiary analysis",
      "Jurisdictional checks",
    ],
  },
  {
    title: "Contracts & Diligence",
    status: "Coming soon",
    items: [
      "Clause extraction",
      "Redline assistance",
      "Deviation reports",
      "Obligations matrix",
    ],
  },
  {
    title: "Litigation Support",
    status: "Coming soon",
    items: [
      "Chronologies",
      "Witness summaries",
      "Exhibit prep",
      "Brief skeletons",
    ],
  },
  {
    title: "Custom Practice Area",
    status: "Bring your own",
    items: [
      "Your own playbooks",
      "Your own agents",
      "Your own document types",
      "Your own calculators",
    ],
  },
];

const PROCUREMENT = [
  {
    icon: Network,
    title: "Identity-aware, sits on your systems of record",
    description:
      "Plugs into your DMS, billing, and calendar with document-level permissions preserved end to end. The intelligence layer on top of what you already trust — not another silo to copy privileged content into.",
  },
  {
    icon: Lock,
    title: "Zero Data Retention",
    description:
      "Your client data never trains the model. Attorney-client privilege preserved by default. SOC 2 Type II and ISO 27001 are the baseline, not the upgrade.",
  },
  {
    icon: Quote,
    title: "Citation-rich, hallucination-resistant",
    description:
      "Every claim, draft, and answer pins back to a source — page, paragraph, statute, case. Designed to refuse rather than fabricate, with the explainability your procurement and ethics committees will ask for.",
  },
  {
    icon: Workflow,
    title: "Self-healing workflows",
    description:
      "When statutes update, panel decisions shift, or a connected system fails, workflows re-route around the change without a manual rebuild — so the practice keeps moving.",
  },
];

export default function LegalLanding() {
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
          className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Scale className="h-3.5 w-3.5" />
            AI Matrx for Legal
          </div>
          <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.75rem)] font-bold tracking-tight text-foreground leading-[1.1]">
            The agentic harness,{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              built for legal work.
            </span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] text-muted-foreground leading-relaxed">
            Research with citations. Document review pinned to the paragraph.
            Drafting agents that enforce your firm&rsquo;s playbook.
            Deterministic calculators. Procured as a digital workforce —
            auditable, identity-aware, and built to live on top of the systems
            of record you already trust.
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
        </div>
      </section>

      {/* Capabilities */}
      <section
        id="capabilities"
        className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24"
      >
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            From copilot to digital workforce
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Six core capabilities under every matter — agentic execution
            grounded in your case file, your firm&rsquo;s playbook, and
            authoritative legal sources.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {CAPABILITIES.map((feature) => (
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

      {/* How it works */}
      <section
        id="how-it-works"
        className="bg-card/50 border-y border-border"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
              How it works
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              From a folder of records to a defensible answer in four steps.
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

      {/* Practice areas */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Practice areas
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Specialty surfaces shipping module by module — each one tuned to
            the documents, calculations, and checkpoints the practice actually
            runs on.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {PRACTICE_AREAS.map((area) => {
            const card = (
              <div
                className={cn(
                  "h-full rounded-2xl border border-border bg-card p-5",
                  "transition-all duration-300",
                  area.href &&
                    "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer",
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-base">{area.title}</h3>
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
                      area.status === "Live"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-muted text-muted-foreground border border-border",
                    )}
                  >
                    {area.status === "Live" ? (
                      <Zap className="h-3 w-3" />
                    ) : null}
                    {area.status}
                  </span>
                </div>
                <ul className="space-y-2">
                  {area.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                {area.href ? (
                  <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                ) : null}
              </div>
            );

            if (area.href) {
              return (
                <Link key={area.title} href={area.href} className="block">
                  {card}
                </Link>
              );
            }

            return <div key={area.title}>{card}</div>;
          })}
        </div>
      </section>

      {/* Procurement audit */}
      <section className="bg-card/50 border-y border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
              Built for the 2026 procurement audit
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
              Security, interoperability, and defensibility — the gatekeeping
              criteria your IT, compliance, and ethics committees are actually
              applying this year.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {PROCUREMENT.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-border bg-card p-6 sm:p-7"
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
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Put AI Matrx to work in your practice
          </h2>
          <p className="mt-4 text-muted-foreground text-lg mb-8">
            Research, document review, drafting, and calculators — on a
            harness designed for the rigor your work demands and the
            procurement bar your firm answers to.
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
