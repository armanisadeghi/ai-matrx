"use client";

/**
 * A journalist, rendered honestly.
 *
 * THE DOOR LAW: when the discovery pipeline resolved a `crm.party`, the person
 * is one click from the thing they wrote or asked for. When it did NOT, the row
 * carries a name and no record — and that is an UNRESOLVED REFERENCE, not a
 * bare `<span>`. It says what it is and ships its one-click fix, because a name
 * the system half-knows is a gap somebody can close in ten seconds.
 *
 * And the fix lands ON the journalist: `crmCreatePartyHref` opens the CRM's
 * canonical create window with the name already filled. It used to land on the
 * bare `/crm` index, which made the user re-type a name this row was already
 * showing them — a door onto a list is not a door onto the thing.
 */

import { Contact } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { crmCreatePartyHref } from "@/features/crm/routes";
import { cn } from "@/lib/utils";

export const MEDIA_LISTS_HREF = "/crm/outreach-lists";

export function JournalistRef({
  name,
  partyId,
  /** What to say when the row names nobody at all. */
  emptyLabel = "No journalist named",
  compact = false,
  className,
}: {
  name: string | null;
  partyId: string | null;
  emptyLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  const size = compact ? "text-[11px]" : "text-xs";

  if (partyId) {
    return (
      <EntityRef
        token="party"
        id={partyId}
        name={name ?? "This journalist"}
        showIcon={!compact}
        openInNewTab
        className={cn("min-w-0", size, className)}
      />
    );
  }

  if (name) {
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
        <span className={cn("min-w-0 truncate text-foreground", size)}>{name}</span>
        <a
          href={crmCreatePartyHref({ kind: "person", name })}
          target="_blank"
          rel="noreferrer noopener"
          title={`${name} has no contact record in your CRM yet. This opens the CRM with their name already filled in — add them and every future request and piece of coverage links to the same person.`}
          className="inline-flex shrink-0 items-center gap-0.5 rounded border border-dashed border-border px-1 py-px text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Contact className="h-2.5 w-2.5" aria-hidden />
          not in CRM — add
        </a>
      </span>
    );
  }

  return (
    <span className={cn("text-muted-foreground", size, className)}>
      {emptyLabel}
    </span>
  );
}
