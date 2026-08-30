"use client";

// features/agents/mandates/components/ProvisionOfferList.tsx
//
// THE PROVISION, on screen — every value a Mandate's Provision offers its
// Holder: name, kind, guaranteed-or-optional, lazy, and the description the
// declaration wrote, one click away.
//
// ONE renderer, two surfaces: the personal workspace (§1 "The job") and the
// admin workbench drawer. The workspace grew this row first; the drawer must
// not grow a second, drifting copy of it.

import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OfferedValue } from "../provision-shapes";

export interface ProvisionOfferListProps {
  values: readonly OfferedValue[];
  /** Value names the platform delivers automatically — never hand-mapped. */
  pinnedContext?: readonly string[];
  className?: string;
}

export function ProvisionOfferList({
  values,
  pinnedContext = [],
  className,
}: ProvisionOfferListProps) {
  if (values.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        This Provision offers no values.
      </p>
    );
  }
  return (
    <ul
      className={cn(
        "divide-y divide-border/40 rounded-lg border border-border/50",
        className,
      )}
    >
      {values.map((value) => (
        <OfferedValueRow
          key={value.name}
          value={value}
          pinned={pinnedContext.includes(value.name)}
        />
      ))}
    </ul>
  );
}

function OfferedValueRow({
  value,
  pinned,
}: {
  value: OfferedValue;
  pinned: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40"
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
          {value.name}
        </span>
        <code className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
          {value.kind}
        </code>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 py-0 text-[9.5px]",
            value.guaranteed
              ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "border-border/70 text-muted-foreground",
          )}
        >
          {value.guaranteed ? "Guaranteed" : "Optional"}
        </Badge>
        {value.lazy ? (
          <Badge
            variant="outline"
            className="shrink-0 py-0 text-[9.5px] text-muted-foreground"
          >
            Lazy
          </Badge>
        ) : null}
        {pinned ? (
          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : null}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="px-3 pb-2 text-[11.5px] leading-relaxed text-muted-foreground">
          {value.description || "No description."}
          {pinned
            ? " — delivered automatically as locked context; never mapped by hand."
            : null}
        </div>
      ) : null}
    </li>
  );
}
