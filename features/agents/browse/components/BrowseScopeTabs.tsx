"use client";

// features/agents/browse/components/BrowseScopeTabs.tsx
//
// THE VIEW LAW made visible: four fixed destinations, each a different
// question, each with a TRUE server-side count.
//
// Why one "My Orgs" tab + a dropdown instead of one chip per org (the shape
// components/official/ListScopeSwitcher uses today): a user belongs to a
// personal org + N companies, and N grows. A chip-per-org tab bar has no fixed
// width, offers no blended view, and forces a choice before the user knows
// which org holds the thing they want. Blended-by-default with a narrowing
// dropdown answers "what does my team have?" first and "which team?" second.

import { User, Building2, Users2, Globe, ChevronDown, Check } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllOrgs } from "@/features/agent-context/redux/organizationsSlice";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BrowseScope, BrowseScopeCounts, BrowseScopeKind } from "../types";

interface Props {
  scope: BrowseScope;
  counts: BrowseScopeCounts;
  onChange: (scope: BrowseScope) => void;
}

const TAB_BASE =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-medium transition-colors whitespace-nowrap";
const TAB_ACTIVE = "bg-primary text-primary-foreground";
const TAB_IDLE = "text-muted-foreground hover:bg-muted hover:text-foreground";

function CountPill({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 text-[10px] font-semibold tabular-nums",
        active ? "bg-primary-foreground/20" : "bg-muted-foreground/15",
      )}
    >
      {n}
    </span>
  );
}

export function BrowseScopeTabs({ scope, counts, onChange }: Props) {
  const orgs = useAppSelector(selectAllOrgs);
  // Personal org is excluded on purpose: its contents ARE "Mine". Surfacing it
  // again under My Orgs would double-count the same rows in two tabs.
  const teamOrgs = orgs.filter((o) => !o.is_personal);

  const activeOrg = scope.organizationId
    ? teamOrgs.find((o) => o.id === scope.organizationId)
    : null;

  const simpleTab = (
    kind: Exclude<BrowseScopeKind, "orgs">,
    label: string,
    Icon: typeof User,
  ) => {
    const active = scope.kind === kind;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className={cn(TAB_BASE, active ? TAB_ACTIVE : TAB_IDLE)}
        onClick={() => onChange({ kind, organizationId: null })}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        <CountPill n={counts[kind]} active={active} />
      </button>
    );
  };

  const orgsActive = scope.kind === "orgs";

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
      role="tablist"
      aria-label="Agent scope"
    >
      {simpleTab("mine", "Mine", User)}

      <div className="inline-flex items-center">
        <button
          type="button"
          role="tab"
          aria-selected={orgsActive}
          className={cn(
            TAB_BASE,
            orgsActive ? TAB_ACTIVE : TAB_IDLE,
            teamOrgs.length > 0 && "rounded-r-none pr-1.5",
          )}
          onClick={() => onChange({ kind: "orgs", organizationId: null })}
          title="Agents your teammates created in organizations you belong to"
        >
          <Building2 className="h-3.5 w-3.5" />
          {activeOrg ? activeOrg.name : "My Orgs"}
          <CountPill
            n={
              activeOrg
                ? (counts.byOrg[activeOrg.id] ?? 0)
                : counts.orgs
            }
            active={orgsActive}
          />
        </button>

        {teamOrgs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Filter by organization"
                className={cn(
                  TAB_BASE,
                  "rounded-l-none border-l px-1",
                  orgsActive
                    ? "bg-primary text-primary-foreground border-primary-foreground/25"
                    : cn(TAB_IDLE, "border-border"),
                )}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuLabel className="text-xs">
                Organization
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => onChange({ kind: "orgs", organizationId: null })}
                className="justify-between"
              >
                <span className="flex items-center gap-2">
                  {!scope.organizationId && orgsActive ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <span className="w-3.5" />
                  )}
                  All my organizations
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {counts.orgs}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {teamOrgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onSelect={() =>
                    onChange({ kind: "orgs", organizationId: org.id })
                  }
                  className="justify-between"
                >
                  <span className="flex items-center gap-2 truncate">
                    {scope.organizationId === org.id ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{org.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {counts.byOrg[org.id] ?? 0}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {simpleTab("shared", "Shared", Users2)}
      {simpleTab("public", "Public", Globe)}
    </div>
  );
}
