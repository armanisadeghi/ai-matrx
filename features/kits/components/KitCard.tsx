"use client";

import Link from "next/link";
import { Table2, Workflow } from "lucide-react";
import { KIT_ROUTES } from "../constants";
import type { KitEntry } from "../types";
import { KitIcon } from "./KitIcon";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { cn } from "@/utils/cn";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a kit adds, as one quiet line of counts: "1 table · 1 agent · 1 workflow". */
export function WhatYouGet({ kit, className }: { kit: KitEntry; className?: string }) {
  const m = kit.manifest;
  const items = [
    { icon: Table2, text: plural(m.tables.length, "table", "tables"), show: m.tables.length > 0 },
    { icon: AGENT_ICON, text: plural(m.agents.length, "agent", "agents"), show: m.agents.length > 0 },
    { icon: Workflow, text: plural(m.workflows.length, "workflow", "workflows"), show: m.workflows.length > 0 },
  ].filter((i) => i.show);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map(({ icon: Icon, text }) => (
        <span key={text} className="inline-flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" />
          {text}
        </span>
      ))}
    </div>
  );
}

/**
 * One kit in the gallery: icon beside the name row only; the tagline and the counts
 * run the card's full width. `subtitle` replaces the category (an organization's kit
 * names its organization there).
 */
export function KitCard({ kit, installed, subtitle }: { kit: KitEntry; installed?: boolean; subtitle?: string | null }) {
  const m = kit.manifest;
  return (
    <Link
      href={KIT_ROUTES.detail(kit.key)}
      className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-3">
        <KitIcon name={m.icon} tintKey={kit.key} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-foreground group-hover:text-primary">{m.name}</h3>
            {installed && (
              <span className="shrink-0 rounded-full bg-success/10 px-1.5 py-px text-[10px] font-medium text-success">
                Installed
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{subtitle ?? m.category}</p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-snug text-foreground">{m.tagline || m.description}</p>

      <WhatYouGet kit={kit} className="mt-auto pt-3" />
    </Link>
  );
}
