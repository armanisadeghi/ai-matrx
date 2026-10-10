"use client";

// lib/entity-list/components/EntityOrgFilter.tsx
//
// THE ORGANIZATION FILTER — the list's second axis (Arman 2026-09-30, common-docs
// /policies/access-ladder.md).
//
//   All | Mine | My team | My Orgs | Shared | Public | System      [ All organizations ▾ ]
//
// The lanes (left) say HOW I can see a record; this control (right) says WHICH
// of my organizations to look at. "All organizations" is first and the default
// on every load; one organization narrows EVERY lane and every count. It lives
// in the URL (`?org_filter=`), set through `list.setOrgId`.
//
// 🚨 It is NOT the active-organization switcher and never touches it: it does
// not start from it, sync with it, or write to it. Its label always reads as a
// filter ("All organizations" / "Org: Acme") so the two are never confused.
//
// OPTIONS COME FROM THE PERSON'S MEMBERSHIPS (`useUserOrganizations`, a direct
// self-loading read) — never a Redux slice, which is empty on /agents/all.
// Per-organization counts are shown when the counts RPC returns `all` narrow
// rows (`counts.narrow.all`, computed across every organization on purpose).

import { useState } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

export const ALL_ORGANIZATIONS_LABEL = "All organizations";

/** Past this many organizations the menu offers a name search. */
const SEARCH_AT = 8;

export interface EntityOrgFilterProps {
  /** The filter: null = All organizations. */
  orgId: string | null;
  onChange: (orgId: string | null) => void;
  /** Optional: a `*_scope_counts` result; its `all` narrow rows put a count beside each organization. */
  counts?: EntityScopeCounts;
  countsLoading?: boolean;
  /**
   * Optional: called when the menu opens. A surface whose per-organization counts cost a read per
   * organization (the Knowledge hub) fetches them only once the menu is first opened.
   */
  onOpen?: () => void;
  /**
   * Optional: organizations to offer besides the person's memberships — an admin-lane page lists the
   * system organizations its doors reach (the store's wall admits a super admin there on the admin
   * lane only). Merged by id; a membership wins. Never used to add an organization the page's own
   * doors would refuse.
   */
  extraOrganizations?: ReadonlyArray<{ id: string; name: string }>;
  className?: string;
}

/**
 * Standalone by design: a value/onChange pair and nothing else required, so a
 * page outside the shell renders the same control (URL state:
 * `useOrgFilterParam` in ../orgFilterUrl.ts).
 */
export function EntityOrgFilter({ orgId, onChange, counts, countsLoading, onOpen, extraOrganizations, className }: EntityOrgFilterProps) {
  const { organizations, loading } = useUserOrganizations();
  const [needle, setNeedle] = useState("");
  const perOrg = new Map(
    (counts?.narrow.all ?? []).map((o) => [o.id, o.count] as const),
  );
  const memberIds = new Set(organizations.map((o) => o.id));
  const choices = [
    ...organizations.map((o) => ({ id: o.id, name: o.name || "Unnamed organization" })),
    ...(extraOrganizations ?? []).filter((o) => !memberIds.has(o.id)),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const selected = orgId ? choices.find((c) => c.id === orgId) : undefined;

  // Offer the filter only where it helps (law rule 3): one organization or
  // none leaves nothing to choose. A URL that names an organization always
  // shows the control, so the narrowing can be seen and cleared.
  if (!orgId && (loading || choices.length < 2)) return null;

  const label = orgId
    ? `Org: ${selected?.name ?? (loading ? "…" : "an organization you are not in")}`
    : ALL_ORGANIZATIONS_LABEL;
  const shown = needle.trim()
    ? choices.filter((c) => c.name.toLowerCase().includes(needle.trim().toLowerCase()))
    : choices;
  const countOf = (id: string) =>
    countsLoading ? undefined : perOrg.get(id);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onOpen?.();
        else setNeedle("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-entity-org-filter=""
          aria-label={`Organization filter: ${label}`}
          title="Filter this list by organization. This never changes your active organization."
          className={cn(
            "matrx-glyph-trim inline-flex h-7 min-w-0 max-w-full items-center sm:shrink-0 gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors sm:max-w-[11rem] lg:max-w-[16rem]",
            orgId
              ? "border-primary/40 bg-primary/10 text-foreground"
              // Un-narrowed on a phone it is an icon: beside two page actions
              // the words were squeezed to a 20px stub (2026-10-02).
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground max-sm:shrink-0",
            className,
          )}
        >
          {/* sm:shrink-0: from sm up the filter keeps its label (up to its cap) and the scope lanes
              beside it give way — they scroll; /crm/chasebox squeezed it to "All organi…" at 1440. */}
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          {/* Icon-only on a phone while un-narrowed, and always below 48rem of a list pane (the
              pane, not the viewport: beside the chat panel a 1024px screen holds a 540px list). */}
          <span className={cn("truncate @max-3xl/list:sr-only", !orgId && "max-sm:sr-only")}>{label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 @max-3xl/list:hidden", !orgId && "max-sm:hidden")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">Show records in</DropdownMenuLabel>
        {choices.length > SEARCH_AT && (
          <div className="px-1 pb-1">
            <input
              value={needle}
              onChange={(e) => setNeedle(e.target.value)}
              // Keep Radix's typeahead from stealing the keystrokes.
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Find an organization…"
              aria-label="Find an organization"
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-base lg:text-xs"
            />
          </div>
        )}
        <DropdownMenuItem onSelect={() => onChange(null)} className="justify-between">
          <span className="flex items-center gap-2">
            {orgId ? <span className="w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {ALL_ORGANIZATIONS_LABEL}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {shown.map((org) => {
          const n = countOf(org.id);
          return (
            <DropdownMenuItem
              key={org.id}
              onSelect={() => onChange(org.id)}
              className="justify-between"
            >
              <span className="flex min-w-0 items-center gap-2">
                {orgId === org.id ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="truncate">{org.name}</span>
              </span>
              {n !== undefined && (
                <span className="type-secondary tabular-nums text-muted-foreground">{n}</span>
              )}
            </DropdownMenuItem>
          );
        })}
        {shown.length === 0 && (
          <p className="px-2 py-1.5 type-secondary text-muted-foreground">
            No organization matches “{needle.trim()}”.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
