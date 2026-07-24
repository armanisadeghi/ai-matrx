"use client";

/**
 * EntitlementChip — the ONE chip for a catalog store's per-caller
 * entitlement state (Shared Knowledge Resources). Driven by the settled
 * catalog shape (`entitled_via` + industry label from
 * `rag.fn_list_library_catalog`) so every surface (catalog route, /rag
 * teaser pane, org settings) says the same thing:
 *
 *   organization → "Subscribed"
 *   industry     → "via {industry name}"
 *   global       → "Available to everyone"
 *   null         → "Not entitled"
 */

import { Building2, Check, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogEntitlement } from "@/features/rag/hooks/useLibraryCatalog";

export function entitlementLabel(
  entitledVia: CatalogEntitlement,
  industryName: string | null,
): string {
  switch (entitledVia) {
    case "organization":
      return "Subscribed";
    case "industry":
      return industryName ? `via ${industryName}` : "via industry";
    case "global":
      return "Available to everyone";
    default:
      return "Not entitled";
  }
}

export function EntitlementChip({
  entitledVia,
  industryName,
  className,
}: {
  entitledVia: CatalogEntitlement;
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
          ? `You can read this library — ${label}`
          : "Your organization has no grant for this library yet"
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
