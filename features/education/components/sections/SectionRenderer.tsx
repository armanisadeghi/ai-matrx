// Server component. Renders a list of EduSection blocks into the canonical
// marketing page body (LegalLanding house style). This is the ONE place page
// body markup lives — registry entries author data, never JSX. Add a new
// section by extending the EduSection union (types.ts) + a branch here.
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";
import { AccessTierBadge } from "./AccessTierBadge";
import type {
  EduSection,
  EduFeatureItem,
  EduStep,
  EduStatusCard,
  EduStat,
  EduFaqItem,
  EduLink,
} from "../../types";

const HEADING = "text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight";

/** Wraps a section in a band; odd bands get the muted card backing for rhythm. */
function Band({
  alt,
  wide,
  children,
}: {
  alt: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(alt && "bg-card/50 border-y border-border")}>
      <div
        className={cn(
          "mx-auto px-4 sm:px-6 py-14 sm:py-20",
          wide ? "max-w-6xl" : "max-w-5xl",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function SectionHead({
  heading,
  subheading,
}: {
  heading?: string;
  subheading?: string;
}) {
  if (!heading && !subheading) return null;
  return (
    <div className="text-center mb-10 sm:mb-14">
      {heading ? <h2 className={HEADING}>{heading}</h2> : null}
      {subheading ? (
        <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
          {subheading}
        </p>
      ) : null}
    </div>
  );
}

function FeatureGrid({
  items,
  columns = 3,
}: {
  items: EduFeatureItem[];
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6",
        columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const body = (
          <div
            className={cn(
              "group relative h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300",
              item.href && "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
            )}
          >
            {Icon ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                <Icon className="h-5 w-5" />
              </div>
            ) : null}
            <h3 className="text-base font-semibold mb-2">{item.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {item.description}
            </p>
            {item.href ? (
              <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Explore <ArrowRight className="h-3.5 w-3.5" />
              </div>
            ) : null}
          </div>
        );
        return item.href ? (
          <Link key={item.title} href={item.href} className="block">
            {body}
          </Link>
        ) : (
          <div key={item.title}>{body}</div>
        );
      })}
    </div>
  );
}

function Steps({ steps }: { steps: EduStep[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
      {steps.map((step) => (
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
  );
}

function StatusCards({ cards }: { cards: EduStatusCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const inner = (
          <div
            className={cn(
              "h-full rounded-2xl border border-border bg-card p-5 transition-all duration-300",
              card.href &&
                "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer",
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                {Icon ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                ) : null}
                <h3 className="font-semibold text-base truncate">{card.title}</h3>
              </div>
              <StatusPill status={card.status} />
            </div>
            {card.description ? (
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {card.description}
              </p>
            ) : null}
            {card.bullets && card.bullets.length > 0 ? (
              <ul className="space-y-2">
                {card.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 flex items-center justify-between">
              {card.accessTier ? <AccessTierBadge tier={card.accessTier} /> : <span />}
              {card.href ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </div>
          </div>
        );
        return card.href ? (
          <Link key={card.title} href={card.href} className="block">
            {inner}
          </Link>
        ) : (
          <div key={card.title}>{inner}</div>
        );
      })}
    </div>
  );
}

function StatBar({ stats }: { stats: EduStat[] }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        stats.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-2xl border border-border bg-card text-center py-5"
        >
          <div className="text-2xl font-bold text-primary mb-1">{s.value}</div>
          <div className="text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Faq({ items }: { items: EduFaqItem[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map((item) => (
        <div key={item.q} className="p-5 sm:p-6">
          <h3 className="font-semibold text-base mb-1.5">{item.q}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
        </div>
      ))}
    </div>
  );
}

function Cta({
  heading,
  body,
  primary,
  secondary,
}: {
  heading: string;
  body?: string;
  primary: EduLink;
  secondary?: EduLink;
}) {
  return (
    <div className="text-center">
      <h2 className={HEADING}>{heading}</h2>
      {body ? (
        <p className="mt-4 text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
          {body}
        </p>
      ) : (
        <div className="mb-8" />
      )}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Button size="lg" className="min-h-[44px] text-base px-10 gap-2" asChild>
          <Link href={primary.href}>
            {primary.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {secondary ? (
          <Button
            variant="outline"
            size="lg"
            className="min-h-[44px] text-base px-8"
            asChild
          >
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SectionRenderer({ sections }: { sections: EduSection[] }) {
  return (
    <>
      {sections.map((section, i) => {
        const alt = i % 2 === 1;
        switch (section.kind) {
          case "prose":
            return (
              <Band key={i} alt={alt}>
                {section.heading ? (
                  <h2 className={cn(HEADING, "text-center mb-6")}>
                    {section.heading}
                  </h2>
                ) : null}
                <div className="mx-auto max-w-3xl text-muted-foreground leading-relaxed space-y-4">
                  {section.body.split("\n\n").map((para, j) => (
                    <p key={j}>{para}</p>
                  ))}
                </div>
              </Band>
            );
          case "feature-grid":
            return (
              <Band key={i} alt={alt} wide>
                <SectionHead heading={section.heading} subheading={section.subheading} />
                <FeatureGrid items={section.items} columns={section.columns} />
              </Band>
            );
          case "steps":
            return (
              <Band key={i} alt={alt}>
                <SectionHead heading={section.heading} subheading={section.subheading} />
                <Steps steps={section.steps} />
              </Band>
            );
          case "status-cards":
            return (
              <Band key={i} alt={alt} wide>
                <SectionHead heading={section.heading} subheading={section.subheading} />
                <StatusCards cards={section.cards} />
              </Band>
            );
          case "stat-bar":
            return (
              <Band key={i} alt={alt}>
                <StatBar stats={section.stats} />
              </Band>
            );
          case "faq":
            return (
              <Band key={i} alt={alt}>
                <SectionHead heading={section.heading} />
                <Faq items={section.items} />
              </Band>
            );
          case "cta":
            return (
              <Band key={i} alt={alt}>
                <Cta
                  heading={section.heading}
                  body={section.body}
                  primary={section.primary}
                  secondary={section.secondary}
                />
              </Band>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
