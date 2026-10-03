"use client";

/**
 * FeatureCards — the page-top variant that opens doors to SIBLING features
 * (owner, 2026-10-03, feedback item 3: "promo cards that link to features — on
 * agents: Orchestras, Agent Battles, Templates, plus a rotating card for
 * Shortcuts, Skills, Connections and more").
 *
 * It replaces junk description text at the top of a page with something a
 * person can act on. Every card is a real route — a card is a door, never a
 * pitch for a feature that does not exist.
 *
 *   [disc]  Title (13px/600)                 ›
 *           one line (12px, ≤40 chars)
 *
 * - One surface level: bordered 8px card, no shadow, no glass (glass only
 *   floats), never a card in a card.
 * - About 56px tall; the whole card is the link (cursor pointer).
 * - The ROTATING card cycles its items every few seconds and stops while the
 *   pointer or focus is on it, or when the person prefers reduced motion. Its
 *   dots are buttons, so every item is reachable without waiting.
 * - Phone: the row becomes a sideways strip inside the 12px gutter, so the top
 *   of a page never grows into a wall of cards.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeatureTone = "primary" | "info" | "success" | "warning" | "destructive";

const DISC: Record<FeatureTone, string> = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export interface FeatureCardItem {
  /** Real route. The card is a link to it. */
  href: string;
  icon: LucideIcon;
  /** 13px, one line. */
  title: string;
  /** 12px, one line, ≤40 characters. */
  line: string;
  tone?: FeatureTone;
}

function CardBody({ item }: { item: FeatureCardItem }) {
  const Icon = item.icon;
  return (
    <>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", DISC[item.tone ?? "primary"])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] font-semibold leading-5 text-foreground">{item.title}</span>
        <span className="block truncate text-xs leading-4 text-muted-foreground">{item.line}</span>
      </span>
    </>
  );
}

const CARD =
  "group relative flex h-14 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card pl-3 pr-2 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function FeatureCard({ item, className }: { item: FeatureCardItem; className?: string }) {
  return (
    <Link href={item.href} className={cn(CARD, className)}>
      <CardBody item={item} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

const ROTATE_MS = 4500;

/** One card that cycles through several features. */
export function RotatingFeatureCard({ items, className }: { items: FeatureCardItem[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const on = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (held || reducedMotion || items.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [held, reducedMotion, items.length]);

  const item = items[index % Math.max(1, items.length)];
  if (!item) return null;

  return (
    <div
      className={cn("relative min-w-0", className)}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <Link href={item.href} className={cn(CARD, "pr-3")} aria-label={`${item.title} — ${item.line}`}>
        {/* key: the body re-mounts per item so it fades in, never slides. */}
        <span key={item.href} className="flex min-w-0 flex-1 items-center gap-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
          <CardBody item={item} />
        </span>
      </Link>
      {items.length > 1 ? (
        <div className="absolute bottom-1.5 right-2 flex items-center gap-0.5" role="group" aria-label="More features">
          {items.map((it, i) => (
            <button
              key={it.href}
              type="button"
              aria-label={`Show ${it.title}`}
              aria-current={i === index || undefined}
              onClick={() => setIndex(i)}
              className="flex size-3 cursor-pointer items-center justify-center"
            >
              <span
                className={cn(
                  "block size-1 rounded-full transition-colors",
                  i === index ? "bg-foreground/70" : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The row: fixed cards, then (optionally) one rotating card at the end.
 * Desktop: an even grid. Phone: a sideways strip.
 */
export function FeatureCards({
  items,
  rotating,
  ariaLabel = "Related features",
  className,
}: {
  items: FeatureCardItem[];
  rotating?: FeatureCardItem[];
  ariaLabel?: string;
  className?: string;
}) {
  const count = items.length + (rotating && rotating.length > 0 ? 1 : 0);
  const cols =
    count >= 5 ? "sm:grid-cols-3 lg:grid-cols-5" : count === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : count === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        // Phone: one sideways strip (cards ~11rem), scrollbar hidden, snaps.
        "-mx-3 flex snap-x gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:grid sm:overflow-visible sm:px-0",
        cols,
        className,
      )}
    >
      {items.map((item) => (
        <FeatureCard key={item.href} item={item} className="w-44 shrink-0 snap-start sm:w-auto" />
      ))}
      {rotating && rotating.length > 0 ? (
        <RotatingFeatureCard items={rotating} className="w-44 shrink-0 snap-start sm:w-auto" />
      ) : null}
    </nav>
  );
}
