"use client";

/**
 * The Marketing hub landing — the map of the whole feature.
 *
 * Structure comes from `features/marketing/lib/marketing-nav.ts`; this file
 * only renders it. Adding a Marketing surface means editing that file, never
 * this one.
 */

import Link from "next/link";
import {
  FileSearch,
  Boxes,
  Braces,
  Circle,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Landmark,
  ListTree,
  Plug,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type {
  MarketingNavEntry,
  MarketingNavPillar,
} from "@/features/marketing/lib/marketing-nav";
import { cn } from "@/lib/utils";

// Explicit map, not `import * as Icons` — a namespace import pulls the entire
// lucide set into this client chunk.
const ICONS: Readonly<Record<string, LucideIcon>> = {
  FileSearch,
  Boxes,
  Braces,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Globe,
  Image: ImageIcon,
  Landmark,
  ListTree,
  Plug,
  Search,
  Wrench,
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} aria-hidden />;
}

function EntryCard({ entry }: { entry: MarketingNavEntry }) {
  return (
    <Link
      href={entry.href}
      target={entry.external ? "_blank" : undefined}
      rel={entry.external ? "noopener noreferrer" : undefined}
      className={cn(
        "group flex min-w-0 items-start gap-2.5 rounded-md border border-border",
        "bg-card p-2.5 transition-colors hover:border-primary/50 hover:bg-accent",
      )}
    >
      <NavIcon
        name={entry.iconName}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="truncate">{entry.label}</span>
          {entry.external ? (
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {entry.description}
        </span>
      </span>
    </Link>
  );
}

function PillarSection({ pillar }: { pillar: MarketingNavPillar }) {
  return (
    <section className="rounded-lg border border-border bg-background/60 p-3">
      <header className="mb-2.5 flex items-start gap-2">
        <NavIcon name={pillar.iconName} className="mt-0.5 size-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {pillar.label}
          </h2>
          <p className="text-xs leading-snug text-muted-foreground">
            {pillar.description}
          </p>
        </div>
      </header>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {pillar.entries.map((entry) => (
          <EntryCard key={`${pillar.key}-${entry.href}`} entry={entry} />
        ))}
      </div>
    </section>
  );
}

export function MarketingHub({
  pillars,
}: {
  pillars: readonly MarketingNavPillar[];
}) {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      {/* Scrolls behind the transparent glass header; the first pillar clears
          it via pt-[var(--shell-header-h)] rather than a height subtraction. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 pt-[calc(var(--shell-header-h)+0.75rem)]">
        {pillars.map((pillar) => (
          <PillarSection key={pillar.key} pillar={pillar} />
        ))}
      </div>
    </div>
  );
}
