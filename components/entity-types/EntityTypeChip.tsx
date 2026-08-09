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
//
// THE DOOR LAW: an entity TYPE is an identity too, and it has a canonical
// route — the entity explorer. The chip links there BY DEFAULT, so naming a
// type anywhere lets the reader go see it. Opt out with `linkTo={null}` in the
// two places a link is wrong: inside another interactive control (invalid
// nested anchor) and on the explorer page's own header (a self-link).

import Link from "next/link";
import { HelpCircle } from "lucide-react";

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { cn } from "@/lib/utils";

/** Canonical route for one entity TYPE (not a record of that type). */
export function entityTypeHref(token: string): string {
  return `/administration/database/relationships/explorer/${encodeURIComponent(token)}`;
}

interface Props {
  token: string;
  /** Show the raw token in mono next to the label (default: false). */
  showToken?: boolean;
  /** Visual weight — `container` gets the primary-tinted treatment. */
  variant?: "default" | "container" | "muted";
  /**
   * Where the chip navigates. `"explorer"` (default) opens the entity explorer.
   * `null` renders inert — only for interactive ancestors and self-references.
   */
  linkTo?: "explorer" | null;
  className?: string;
}

export function EntityTypeChip({
  token,
  showToken = false,
  variant = "default",
  linkTo = "explorer",
  className,
}: Props) {
  const info = tryGetEntityInfo(token);
  const Icon = info?.Icon ?? HelpCircle;
  const label = info?.label ?? token;
  const unknown = info === null;
  // An unregistered token has no explorer page to open — keep it inert and loud.
  const href = linkTo === "explorer" && !unknown ? entityTypeHref(token) : null;

  const body = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {showToken && !unknown ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          {token}
        </span>
      ) : null}
    </>
  );

  const chipClass = cn(
    "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium",
    variant === "container" && "border-primary/30 bg-primary/10 text-primary",
    variant === "default" && "border-border bg-card text-foreground",
    variant === "muted" && "border-border bg-muted text-muted-foreground",
    unknown && "border-destructive/40 bg-destructive/10 text-destructive",
    href && "transition-colors hover:border-primary/50 hover:bg-accent",
    className,
  );

  const title = unknown
    ? `Unregistered entity token "${token}"`
    : href
      ? `Open ${label} (${token}) in the entity explorer`
      : `${label} (${token})`;

  if (href) {
    return (
      <Link
        href={href}
        title={title}
        // Safe inside clickable rows — the row's own handler must not fire.
        onClick={(e) => e.stopPropagation()}
        className={chipClass}
      >
        {body}
      </Link>
    );
  }

  return (
    <span className={chipClass} title={title}>
      {body}
    </span>
  );
}
