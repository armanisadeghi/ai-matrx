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
import {
  artifactTile,
  targetVisual,
} from "../../library/artifactVisuals";
import { kitHref, type StudyKit } from "../../kits/kitService";
import { missingFormatsFor } from "../nudges";

function KitCard({ kit }: { kit: StudyKit }) {
  const href = kitHref(kit.sourceType, kit.sourceId);
  // Distinct formats present in this kit, in a stable order.
  const present = Array.from(
    new Map(
      kit.artifacts.map((a) => {
        const kind = a.targetKind ?? a.artifactType;
        return [kind, targetVisual(kind)] as const;
      }),
    ).values(),
  );
  const missing = missingFormatsFor(kit);

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      <Link href={href} className="flex items-start gap-3 p-3.5 pb-2">
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
      </Link>

      {/* What this kit already contains, as its formats' own colours. */}
      <div className="flex flex-wrap gap-1 px-3.5 pb-2">
        {present.map((visual) => {
          const Icon = visual.icon;
          return (
            <span
              key={visual.label}
              title={visual.label}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md",
                artifactTile(visual),
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          );
        })}
      </div>

      {/* THE ONE NUDGE — about this learner's own material, not about a
          feature they're missing out on. Renders nothing on a complete kit. */}
      {missing.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border px-3.5 py-2">
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
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:brightness-110",
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
    </div>
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
