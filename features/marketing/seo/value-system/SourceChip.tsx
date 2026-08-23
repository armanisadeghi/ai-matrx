"use client";

/**
 * THE SOURCE CHIP — where a rule / area / band / topic worth came from, on
 * every row that shapes value. One component, rendered by the Rulebook, the
 * workbench's "How value is computed" panel, the Topics screen and the pack
 * receipt, so "From ITAD pack" means the same thing everywhere.
 *
 *  pack      — adopted from a pack and still exactly what the pack says
 *  changed   — adopted, then edited here ("Changed from pack"; the editor shows
 *              pack-says vs you-set and offers Revert to pack)
 *  archived  — adopted, then archived here (a ruling — "fill" never revives it)
 *  yours     — the site authored it
 *
 * `pack` and `yours` are read off the row's own metadata; `changed` and
 * `archived` are the server's verdict (`starter_pack_site_status`), never a
 * client-side diff.
 */

import { Boxes, Pencil, UserRound } from "lucide-react";
import { cn } from "@/styles/themes/utils";

export type SourceChipState = "pack" | "changed" | "archived" | "yours";

const META: Record<
  SourceChipState,
  { icon: typeof Boxes; tone: string; label: (pack?: string | null) => string; title: string }
> = {
  pack: {
    icon: Boxes,
    tone: "border-info/40 bg-info/10 text-info",
    label: (pack) => (pack ? `From ${pack}` : "From pack"),
    title: "Adopted from an industry pack and still exactly what the pack proposes. Edit it and it becomes yours.",
  },
  changed: {
    icon: Pencil,
    tone: "border-primary/40 bg-primary/10 text-primary",
    label: (pack) => (pack ? `Changed from ${pack}` : "Changed from pack"),
    title: "Adopted from a pack, then edited here. Open it to see what the pack says beside what you set — and to revert if you want.",
  },
  archived: {
    icon: Boxes,
    tone: "border-border bg-muted/40 text-muted-foreground",
    label: (pack) => (pack ? `Archived (${pack})` : "Archived"),
    title: "Adopted from a pack, then archived here. That is your ruling: re-adopting never brings it back; only 'Reset to pack' does.",
  },
  yours: {
    icon: UserRound,
    tone: "border-border bg-card text-foreground",
    label: () => "Yours",
    title: "Written by you (or someone on your site) — not from any pack.",
  },
};

export function SourceChip({
  state,
  packName,
  className,
}: {
  state: SourceChipState;
  packName?: string | null;
  className?: string;
}) {
  const meta = META[state];
  const Icon = meta.icon;
  return (
    <span
      title={meta.title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none",
        meta.tone,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {meta.label(packName)}
    </span>
  );
}
