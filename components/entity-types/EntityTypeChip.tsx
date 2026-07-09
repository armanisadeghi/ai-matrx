"use client";

// components/entity-types/EntityTypeChip.tsx
//
// Canonical inline chip for a platform entity TYPE (an entity_types token) —
// Lucide icon + human label, with the raw token available as a subtle mono
// suffix or tooltip. Resolves everything through the single entity registry
// (features/scopes/registry) so it stays in lock-step with platform.entity_types.
//
// Use this ANY time a surface names an entity type (association/relationship
// admin, resource catalogues, drift reports). Never re-map token → label/icon
// by hand — that drift is exactly what this kills.

import { HelpCircle } from "lucide-react";

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { cn } from "@/lib/utils";

interface Props {
  token: string;
  /** Show the raw token in mono next to the label (default: false). */
  showToken?: boolean;
  /** Visual weight — `container` gets the primary-tinted treatment. */
  variant?: "default" | "container" | "muted";
  className?: string;
}

export function EntityTypeChip({
  token,
  showToken = false,
  variant = "default",
  className,
}: Props) {
  const info = tryGetEntityInfo(token);
  const Icon = info?.Icon ?? HelpCircle;
  const label = info?.label ?? token;
  const unknown = info === null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium",
        variant === "container" && "border-primary/30 bg-primary/10 text-primary",
        variant === "default" && "border-border bg-card text-foreground",
        variant === "muted" && "border-border bg-muted text-muted-foreground",
        unknown && "border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
      title={unknown ? `Unregistered entity token "${token}"` : `${label} (${token})`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {showToken && !unknown ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          {token}
        </span>
      ) : null}
    </span>
  );
}
