"use client";

// features/education/home/blocks/KitsBlock.tsx
//
// The learner's study kits — one card per piece of material they brought in,
// showing everything that was made from it.
//
// This is the block that makes a sparse account feel full. A learner who
// uploaded one chapter does not think "I own eight artifacts"; they think "I
// have my Bio chapter". The kit is the only unit on this page that matches how
// they actually hold their work, which is why it outranks the flat recent list
// whenever a kit exists.
//
// It also carries the page's ONE nudge: the formats this kit does NOT have yet
// render as chips on the kit itself. That is a suggestion about their own
// material, arriving where it makes sense — not a grid of features they
// haven't unlocked.

import Link from "next/link";
import { ArrowRight, Package, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/entity-list/columns";
import { artifactTile, targetVisual } from "../../library/artifactVisuals";
import { kitHref, type StudyKit } from "../../kits/kitService";
import { missingFormatsFor } from "../nudges";

function KitCard({ kit }: { kit: StudyKit }) {
  const href = kitHref(kit.sourceType, kit.sourceId);
  // Distinct formats present in this kit, in a stable order.
  const present = Array.from(
    new Map(
      kit.artifacts.map((a) => {
        const kind = a.targetKind ?? a.artifactType;
        return [kind, { artifact: a, visual: targetVisual(kind) }] as const;
      }),
    ).values(),
  );
  const missing = missingFormatsFor(kit);

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card transition-colors hover:border-primary/40">
      <Link href={href} className="group flex min-h-16 items-start gap-3 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Package className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {kit.title}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {kit.artifacts.length}{" "}
            {kit.artifacts.length === 1 ? "study item" : "study items"} ·{" "}
            {relativeTime(kit.createdAt)}
          </span>
        </span>
        <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>

      {/* Phone: four clear, labeled destinations and one honest door to the
          complete kit. The former row of eight 24px mystery icons was not a
          usable navigation surface. */}
      <div className="grid grid-cols-2 gap-1.5 px-3.5 pb-3 sm:hidden">
        {present.slice(0, 4).map(({ artifact, visual }) => {
          const Icon = visual.icon;
          return (
            <Link
              key={visual.label}
              href={artifact.href}
              className={cn(
                "flex min-h-10 min-w-0 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold",
                artifactTile(visual),
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{visual.label}</span>
            </Link>
          );
        })}
        {present.length > 4 && (
          <Link
            href={href}
            className="col-span-2 flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 text-xs font-semibold text-foreground"
          >
            Open all {present.length} study aids
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Desktop has room to expose every destination by name. */}
      <div className="hidden flex-wrap gap-1.5 px-3.5 pb-3 sm:flex">
        {present.map(({ artifact, visual }) => {
          const Icon = visual.icon;
          return (
            <Link
              key={visual.label}
              href={artifact.href}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition-colors hover:brightness-110",
                artifactTile(visual),
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {visual.label}
            </Link>
          );
        })}
      </div>

      {/* THE ONE NUDGE — about this learner's own material, not about a
          feature they're missing out on. Renders nothing on a complete kit. */}
      {missing.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border px-3.5 py-2.5">
          {/* An honest statement of fact about THIS kit, not a feature pitch. */}
          <span className="mr-0.5 text-[11px] text-muted-foreground">
            Not in this kit yet:
          </span>
          {missing.map((option) => {
            const Icon = option.visual.icon;
            return (
              <Link
                key={option.target}
                href={option.href}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors hover:brightness-110 sm:min-h-7",
                  artifactTile(option.visual),
                )}
              >
                <Plus className="h-3 w-3" />
                <Icon className="h-3 w-3" />
                {option.visual.label}
              </Link>
            );
          })}
        </div>
      )}
    </article>
  );
}

export function KitsBlock({
  kits,
  total,
}: {
  kits: StudyKit[];
  total: number;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          Your study kits
        </h2>
        {total > kits.length && (
          <Link
            href="/education/kits"
            className="inline-flex items-center gap-1 text-xs text-primary"
          >
            All {total}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kits.map((kit) => (
          <KitCard key={`${kit.sourceType}:${kit.sourceId}`} kit={kit} />
        ))}
      </div>
    </section>
  );
}
