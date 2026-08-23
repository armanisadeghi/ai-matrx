"use client";

/**
 * EntitlementChip — the ONE chip for a catalog store's per-caller
 * entitlement state (Shared Knowledge Resources). Driven by the settled
 * catalog shape (`entitled_via` + industry label from
 * `rag.fn_list_library_catalog`) so every surface (catalog route, /knowledge
 * teaser pane, org settings) says the same thing:
 *
 *   organization → "Subscribed"
 *   industry     → "via {industry name}"
 *   global       → "Available to everyone"
 *   curator      → "You curate this"
 *   null         → "Not entitled"
 *
 * Type-agnostic on purpose: every Matrx Library resource (data store, starter
 * pack, whatever registers next) is entitled through the ONE spine
 * (`platform.entity_grants`), so it wears the ONE chip.
 */

import {
  Building2,
  Check,
  Globe,
  Lock,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogEntitlement } from "@/features/rag/hooks/useLibraryCatalog";

/** Every entitlement value any Library type can report. */
export type LibraryEntitlement = CatalogEntitlement | "curator";

export function entitlementLabel(
  entitledVia: LibraryEntitlement,
  industryName: string | null,
): string {
  switch (entitledVia) {
    case "organization":
      return "Subscribed";
    case "industry":
      return industryName ? `via ${industryName}` : "via industry";
    case "global":
      return "Available to everyone";
    case "curator":
      return "You curate this";
    case "admin":
      return "Admin access";
    default:
      return "Not entitled";
  }
}

export function EntitlementChip({
  entitledVia,
  industryName,
  className,
}: {
  entitledVia: LibraryEntitlement;
  industryName: string | null;
  className?: string;
}) {
  const label = entitlementLabel(entitledVia, industryName);
  const entitled = entitledVia != null;
  const Icon =
    entitledVia === "organization"
      ? Check
      : entitledVia === "industry"
        ? Building2
        : entitledVia === "global"
          ? Globe
          : entitledVia === "admin"
            ? ShieldCheck
            : entitledVia === "curator"
              ? PenLine
              : Lock;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        entitled
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
        className,
      )}
      title={
        entitled
          ? `Your organization has this — ${label}`
          : "Your organization has no grant for this yet"
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
