import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the public product pages (Matrx Desktop, Matrx Extend).
 * Server components only: no client state, so every page is plain HTML on first paint.
 */

export function ProductBackdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[40rem] bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.2),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-80 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-40 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl"
      />
    </>
  );
}

export function StatusPill({ status }: { status: "live" | "soon" }) {
  return status === "live" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
      <Check className="h-3 w-3" aria-hidden="true" />
      Available now
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
      <Clock className="h-3 w-3" aria-hidden="true" />
      Coming soon
    </span>
  );
}

export function ProductHero({
  eyebrow,
  title,
  lead,
  actions,
  note,
  visual,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: string;
  actions: ReactNode;
  note?: ReactNode;
  visual: ReactNode;
}) {
  return (
    <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8 lg:pb-20 lg:pt-20">
      <div className="text-center lg:text-left">
        <p className="inline-flex items-center rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-5 text-balance text-4xl font-black tracking-[-0.04em] sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg lg:mx-0">
          {lead}
        </p>
        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
          {actions}
        </div>
        {note ? (
          <div className="mt-4 text-sm leading-6 text-muted-foreground">
            {note}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">{visual}</div>
    </section>
  );
}

export function ProductSection({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="relative mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
    >
      <div className="mx-auto max-w-2xl text-center">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h2>
        {lead ? (
          <p className="mt-3 text-pretty text-base leading-7 text-muted-foreground">
            {lead}
          </p>
        ) : null}
      </div>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  body: string;
  status: "live" | "soon";
}

export function FeatureGrid({ items }: { items: readonly FeatureItem[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ icon: Icon, title, body, status }) => (
        <li
          key={title}
          className={cn(
            "flex flex-col rounded-3xl border bg-card/90 p-5 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
            status === "soon" ? "border-dashed border-border" : "border-border/80",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <StatusPill status={status} />
          </div>
          <h3 className="mt-4 text-lg font-bold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {body}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function Steps({
  items,
}: {
  items: readonly { title: string; body: string }[];
}) {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {items.map(({ title, body }, index) => (
        <li
          key={title}
          className="rounded-3xl border border-border/80 bg-card/90 p-5"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {index + 1}
          </span>
          <h3 className="mt-4 text-lg font-bold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {body}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function TrustList({
  items,
}: {
  items: readonly { icon: LucideIcon; title: string; body: string }[];
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.map(({ icon: Icon, title, body }) => (
        <li
          key={title}
          className="flex gap-4 rounded-3xl border border-border/80 bg-card/90 p-5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-base font-bold tracking-tight">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {body}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** Native disclosure elements: accessible and working with no script. */
export function Faq({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-border rounded-3xl border border-border/80 bg-card/90">
      {items.map(({ question, answer }) => (
        <details key={question} className="group px-5 py-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold [&::-webkit-details-marker]:hidden">
            <h3 className="text-base font-semibold">{question}</h3>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="pb-1 pt-2 text-sm leading-6 text-muted-foreground">
            {answer}
          </p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pb-24">
      <div className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card px-6 py-10 text-center sm:px-12 sm:py-14">
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
          {body}
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {children}
        </div>
      </div>
    </section>
  );
}
