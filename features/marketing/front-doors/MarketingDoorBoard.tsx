"use client";

/**
 * The shared body of a Marketing FRONT DOOR page.
 *
 * A front door is not a workspace. It is the page a user reaches from the
 * Marketing pillar when the capability they are looking for already ships
 * somewhere else — `/crm/*`, or a website's own workspace. Its entire job is
 * THE DOOR LAW: name what exists, count it, and open it. Building a second
 * console here is the failure mode this file exists to prevent
 * (`docs/handoffs/outreach-system.md` §7 — "do not build a separate outreach
 * console").
 *
 * So there is exactly one visual primitive: a door card, optionally carrying a
 * live count. A count is a door too (no-dead-ends, corollary 5) — the number
 * and the card are the same click, never a number the user cannot chase.
 */

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface MarketingDoor {
  label: string;
  href: string;
  /** What is behind the door — never a restatement of the label. */
  description: string;
  Icon: LucideIcon;
  /**
   * The live count of records behind the door. `undefined` = this door has no
   * count; `null` = the count is still loading. Zero is a real, honest answer
   * and renders as `0`.
   */
  count?: number | null;
  /** What the count counts, e.g. "campaigns". Required when `count` is given. */
  countLabel?: string;
  /**
   * `attention` = a non-zero count means somebody has to do something.
   * `positive` = a non-zero count is good news. Both fall back to `neutral`
   * styling at zero, so an empty queue never shouts.
   */
  tone?: "neutral" | "attention" | "positive";
}

function countClasses(door: MarketingDoor): string {
  const empty = !door.count;
  if (empty || !door.tone || door.tone === "neutral") {
    return "text-foreground";
  }
  return door.tone === "attention"
    ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";
}

export function MarketingDoorCard({ door }: { door: MarketingDoor }) {
  const { Icon } = door;
  const hasCount = door.count !== undefined;
  return (
    <Link
      href={door.href}
      className="group flex min-w-0 items-start gap-2.5 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary"
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="truncate">{door.label}</span>
          <ArrowUpRight className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {door.description}
        </span>
        {hasCount ? (
          <span className="mt-1.5 flex items-baseline gap-1.5">
            {door.count == null ? (
              <Skeleton className="h-5 w-8" />
            ) : (
              <span
                className={cn(
                  "text-lg font-semibold leading-none tabular-nums",
                  countClasses(door),
                )}
              >
                {door.count.toLocaleString()}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {door.countLabel}
            </span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function MarketingDoorBoard({
  title,
  description,
  doors,
}: {
  title: string;
  description?: string;
  doors: readonly MarketingDoor[];
}) {
  return (
    <section className="rounded-lg border border-border bg-background/60 p-3">
      <header className="mb-2.5 min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {doors.map((door) => (
          <MarketingDoorCard key={door.href + door.label} door={door} />
        ))}
      </div>
    </section>
  );
}

/**
 * The page frame every front door shares — the same scroll/glass-header
 * geometry as the `/marketing` hub, so a front door reads as part of the
 * pillar rather than a bolted-on page.
 */
export function MarketingFrontDoorPage({
  title,
  lede,
  toolbar,
  children,
}: {
  title: string;
  lede: string;
  /** Optional site/scope control, rendered under the lede. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 pt-[calc(var(--shell-header-h)+0.75rem)]">
        <header className="min-w-0 px-0.5">
          <h1 className="text-sm font-semibold text-foreground">{title}</h1>
          <p className="max-w-3xl text-xs leading-snug text-muted-foreground">
            {lede}
          </p>
          {toolbar ? <div className="mt-2">{toolbar}</div> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

/**
 * A promise this page shows the user but does not yet keep. Copy comes from
 * `lib/coming-soon/registry.ts` — never prose typed here (that registry's
 * FEATURE.md: a promise is tracked like a defect).
 */
export function MarketingFrontDoorPromise({
  label,
  promise,
}: {
  label: string;
  promise: string;
}) {
  return (
    <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs leading-snug text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span> — coming
      soon. {promise}
    </p>
  );
}
