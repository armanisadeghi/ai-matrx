"use client";

/**
 * Names the organization a row belongs to. Queues read across EVERY
 * organization the person can reach (access decides, never the header's
 * selected org), so each row says whose it is. Renders nothing when the
 * organization is not in the person's loaded tree.
 */

import React from "react";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizations } from "@/features/scopes/redux/selectors/tree";

export function OrganizationTag({
  organizationId,
  className,
}: {
  organizationId: string | null | undefined;
  /** Layout only — e.g. `max-w-[72px]` so a narrow list row truncates the name. */
  className?: string;
}) {
  const byId = useAppSelector(selectOrganizations);
  const name = organizationId ? byId[organizationId]?.name : null;
  if (!name) return null;
  return (
    <Badge
      variant="outline"
      title={name}
      className={cn("min-w-0 gap-1 font-normal", className)}
    >
      <Building2 className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </Badge>
  );
}
