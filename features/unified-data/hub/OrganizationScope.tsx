"use client";

// features/unified-data/hub/OrganizationScope.tsx — LANE ACCESS-IS-PERSONAL
//
// THE LIST SAYS WHICH ORGANIZATION IT IS FILTERED BY, AND OFFERS THE WAY OUT.
//
// THE OWNER'S LAW (2026-09-23): "The active org may filter LISTS on a page only if the page
// itself visually displays the specific org and clearly shows it is filtering for that org,
// with a way to change it or select all." The Data hub listed one organization's tables and
// never said which, so a member of three organizations saw a third of her tables and nothing
// told her the other two existed. The strip names the organization, opens the platform's ONE
// organization picker to change it, and offers "All my organizations" — every table she can
// open, grouped by where it lives, each opening at its own address whichever organization she
// is working in. The choice rides the address (`?scope=all`), so it can be bookmarked and sent.
//
// Champion: Linear's workspace switcher beside "All teams", and Slack's "All workspaces" —
// the filter is named where you look, and the unfiltered view is one click.

import { useState, type ReactNode } from "react";
import { Building2, Layers } from "lucide-react";
import { Button } from "@ai-matrx/design-system";

import { OrganizationPickerPopover } from "@/features/organizations/components/OrganizationPickerPopover";

export function OrganizationScopeStrip({
  organizationName,
  showingAll,
  onShowAll,
  onShowOne,
  trailing,
}: {
  organizationName: string | null;
  showingAll: boolean;
  onShowAll: () => void;
  onShowOne: () => void;
  /** The list's other filter (whose tables), on the same row — one place to narrow the list. */
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const name = organizationName ?? "the organization you are working in";
  return (
    <div
      data-hub-scope={showingAll ? "all" : "one"}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs"
    >
      {showingAll ? (
        <>
          <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            Showing tables from <span className="font-medium text-foreground">every organization you can open</span>
          </span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onShowOne}>
            Only {name}
          </Button>
        </>
      ) : (
        <>
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            Showing what is in <span className="font-medium text-foreground">{name}</span>
          </span>
          {/* ONE UNIT, SO A PHONE WRAPS IT WHOLE (lane HANDOVER, 2026-09-27): at 390 px the dot
              wrapped alone onto the next line, "· All my organizations". */}
          <span className="inline-flex items-center gap-x-2 whitespace-nowrap">
            <OrganizationPickerPopover
              open={open}
              onOpenChange={setOpen}
              trigger={
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                  Change
                </Button>
              }
            />
            <span className="text-muted-foreground" aria-hidden>
              &middot;
            </span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onShowAll}>
              All my organizations
            </Button>
          </span>
        </>
      )}
      {trailing ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{trailing}</div> : null}
    </div>
  );
}
