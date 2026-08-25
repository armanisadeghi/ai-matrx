"use client";

/**
 * THE KEYWORD FRONT DOOR — the map of every screen that gives keywords meaning.
 *
 * WHY IT EXISTS. Eight surfaces across two site sections (Keywords and Keyword
 * value) had grown from the convergence campaign, each labelled with a word
 * only its builder could read, two of them literally both called "Workbench".
 * Arman, 2026-08-24: *"Right now, there are so many different UIs, and they're
 * not labeled properly. So it's really hard to know what happens where and what
 * I should be doing because it's very, very confusing… I need to know where to
 * go."*
 *
 * THE RULES THIS FILE LIVES BY:
 *
 *  1. **It is doors, never prose.** Every line is a link that lands on a real
 *     screen. Nothing here explains a concept; the screen it opens does that.
 *  2. **No orphan capability.** Anything reachable in the keyword family
 *     appears here — the six jobs as primary doors, the rest as the chip row
 *     beneath them (which reuses `ValueDoors` for the two that live outside
 *     the family: business guidelines and the platform facet registry). Adding
 *     a keyword surface without adding it here re-creates the confusion.
 *  3. **Each door says what you DO, in the ratified vocabulary** (Dimension ·
 *     Value · Stamp · Matcher · Worth · Score · Level · Receipt · Class · Pin)
 *     — never "facet", "band", "multiplier", "resolver".
 *
 * The same sentences are the sub-nav's tooltips (`site-subviews.ts` → `purpose`),
 * so the header and this page can never disagree about what a screen is for.
 */

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Layers,
  MapPinned,
  Scale,
  SlidersHorizontal,
  Tags,
  TreePine,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { ValueDoors } from "@/features/marketing/seo/value-system/ValueDoors";

interface Door {
  /** What the person DOES — the reason they came looking. */
  action: string;
  /** The screen's own name, so the map and the header agree. */
  screen: string;
  line: string;
  href: string;
  icon: LucideIcon;
}

export function KeywordStartHere({
  brandId,
  siteId,
  siteDomain,
}: {
  brandId: string | null | undefined;
  siteId: string;
  siteDomain?: string | null;
}) {
  const keywords = marketingRoutes.site(brandId, siteId, "/keywords");
  const value = marketingRoutes.site(brandId, siteId, "/value");

  const primary: Door[] = [
    {
      action: "Say what a keyword IS",
      screen: "Workbench",
      line: "Find exactly the keywords you mean and set their class, their Offering, or any dimension you invent — with the reason that teaches the system.",
      href: `${keywords}?view=workbench`,
      icon: SlidersHorizontal,
    },
    {
      action: "Teach the system to do it for you",
      screen: "Teach classes",
      line: "Patterns and brand names that class keywords automatically, the guidelines every AI run reads first, and batch AI classing.",
      href: `${keywords}?view=classification`,
      icon: BrainCircuit,
    },
    {
      action: "See what everything is worth, and why",
      screen: "Scores",
      line: "Every keyword's score and level, the receipt behind it, and the rulings you pinned yourself.",
      href: value,
      icon: Scale,
    },
    {
      action: "Set what things are worth",
      screen: "Rulebook",
      line: "The matchers that stamp keywords, the worth each value adds or scales, and the level words your team reads.",
      href: `${value}/rules`,
      icon: Tags,
    },
    {
      action: "Group keywords into your Offerings",
      screen: "Topics",
      line: "The Offering tree — what you actually sell — and what each Offering is worth to this site.",
      href: `${value}/topics`,
      icon: TreePine,
    },
    {
      action: "See traffic by class and level",
      screen: "Search Console · Insights",
      line: "How much real traffic each class and level brings, what moved, and where to dig.",
      href: `${marketingRoutes.searchConsole(siteId)}&tab=insights`,
      icon: BarChart3,
    },
  ];

  const also: Door[] = [
    {
      action: "What people searched and clicked",
      screen: "Performance",
      line: "The Search Console and market evidence for this site's keywords.",
      href: `${keywords}?view=performance`,
      icon: TrendingUp,
    },
    {
      action: "The ways you look at keywords",
      screen: "Dimensions",
      line: "Every dimension this site sees and the answers each one allows.",
      href: `${value}/dimensions`,
      icon: Layers,
    },
    {
      action: "Where searches come from",
      screen: "Service areas",
      line: "The areas and locations that decide whether a search is local to you.",
      href: `${value}/rules#service-areas`,
      icon: MapPinned,
    },
    {
      action: "Start from your industry",
      screen: "Industry packs",
      line: "Adopt your industry's defaults instead of ruling a blank page.",
      href: `${value}/packs`,
      icon: Layers,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-4">
      <header className="space-y-1">
        <h1 className="text-sm font-semibold text-foreground">
          Give your keywords meaning
          {siteDomain ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {siteDomain}
            </span>
          ) : null}
        </h1>
        <p className="text-xs text-muted-foreground">
          Six jobs, one screen each. Pick the sentence that matches what you came
          to do — there is no order to work through.
        </p>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {primary.map((door) => (
          <DoorCard key={door.href} door={door} />
        ))}
      </ul>

      <section className="space-y-2 border-t border-border pt-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Also here
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {also.map((door) => (
            <Link
              key={door.href}
              href={door.href}
              title={door.line}
              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <door.icon className="h-3 w-3" aria-hidden />
              {door.screen}
            </Link>
          ))}
          <ValueDoors brandId={brandId} siteId={siteId} />
        </div>
      </section>
    </div>
  );
}

/**
 * Deliberately NOT numbered. There is no ratified order to this work — a person
 * with an industry pack starts at the Rulebook, a person with 20,000 unstamped
 * keywords starts at the Workbench — and stamping an order onto it would be a
 * product-semantics ruling, which is Arman's to make, not a builder's.
 */
function DoorCard({ door }: { door: Door }) {
  const Icon = door.icon;
  return (
    <li className="min-w-0">
      <Link
        href={door.href}
        className={cn(
          "group flex h-full min-w-0 items-start gap-2 rounded-lg border border-border bg-card p-2.5",
          "transition-colors hover:border-primary/40 hover:bg-accent",
        )}
      >
        <span
          className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-primary"
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-xs font-semibold text-foreground">
              {door.action}
            </span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            {door.line}
          </span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
            {door.screen}
          </span>
        </span>
      </Link>
    </li>
  );
}
