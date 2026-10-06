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
// render as `add` chips on the kit itself. That is a suggestion about their own
// material, arriving where it makes sense — not a grid of features they
// haven't unlocked.

import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";
import { Chip, ChipSet } from "@ai-matrx/design-system/controls";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { targetVisual } from "../../library/artifactVisuals";
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
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
          <Package className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {kit.title}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {present.length}{" "}
            {present.length === 1 ? "study aid" : "study aid types"}
            {kit.artifacts.length !== present.length &&
              ` · ${kit.artifacts.length} total items`}{" "}
            · {formatRelativeTime(kit.createdAt)}
          </span>
        </span>
        <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>

      {/* Every format this kit has, by name — THE chip, one uniform grid so
          siblings share one width and one baseline. Padded exactly like the
          header (p-3.5): the set's box edge is the chips' visible edge. */}
      <ChipSet layout="grid" className="px-3.5 pb-3.5">
        {present.map(({ artifact, visual }) => {
          const Icon = visual.icon;
          return (
            <Chip
              key={visual.label}
              asChild
              tone={visual.tone}
              icon={<Icon />}
              label={visual.label}
            >
              <Link href={artifact.href} />
            </Chip>
          );
        })}
      </ChipSet>

      {/* THE ONE NUDGE — about this learner's own material, not about a
          feature they're missing out on. Renders nothing on a complete kit. */}
      {missing.length > 0 && (
        <div className="mt-auto border-t border-border px-3.5 pb-3.5 pt-2">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Not in this kit yet
          </p>
          <ChipSet layout="grid">
            {missing.map((option) => {
              const Icon = option.visual.icon;
              return (
                <Chip
                  key={option.target}
                  asChild
                  variant="add"
                  icon={<Icon />}
                  label={option.visual.label}
                >
                  <Link href={option.href} />
                </Chip>
              );
            })}
          </ChipSet>
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
        <Link
          href="/education/kits"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View all kits{total > 0 ? ` (${total})` : ""}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kits.map((kit) => (
          <KitCard key={`${kit.sourceType}:${kit.sourceId}`} kit={kit} />
        ))}
      </div>
    </section>
  );
}
