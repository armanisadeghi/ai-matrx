"use client";

import Link from "next/link";
import { ArrowUpRight, BrainCircuit, Lightbulb, Table2, Workflow } from "lucide-react";
import { KIT_ROUTES } from "../constants";
import type { KitEntry } from "../types";
import { KitIcon } from "./KitIcon";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function WhatYouGet({ kit, className }: { kit: KitEntry; className?: string }) {
  const m = kit.manifest;
  const items = [
    { icon: Table2, text: plural(m.tables.length, "table", "tables"), show: m.tables.length > 0 },
    { icon: BrainCircuit, text: plural(m.agents.length, "agent", "agents"), show: m.agents.length > 0 },
    { icon: Workflow, text: plural(m.workflows.length, "workflow", "workflows"), show: m.workflows.length > 0 },
  ].filter((i) => i.show);
  return (
    <div className={className ?? "flex flex-wrap items-center gap-1.5"}>
      {items.map(({ icon: Icon, text }) => (
        <span
          key={text}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <Icon className="h-3 w-3" />
          {text}
        </span>
      ))}
    </div>
  );
}

export function KitCard({ kit, installed }: { kit: KitEntry; installed?: boolean }) {
  const m = kit.manifest;
  return (
    <Link
      href={KIT_ROUTES.detail(kit.key)}
      className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <KitIcon name={m.icon} tintKey={kit.key} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-foreground">{m.name}</h3>
            {installed && (
              <span className="shrink-0 rounded-full bg-success/10 px-1.5 py-px text-[10px] font-medium text-success">
                Installed
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{m.category}</p>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-foreground/80">{m.tagline || m.description}</p>

      {m.teaches[0] && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2">
          <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{m.teaches[0]}</p>
        </div>
      )}

      <div className="mt-auto pt-4">
        <WhatYouGet kit={kit} />
      </div>
    </Link>
  );
}
