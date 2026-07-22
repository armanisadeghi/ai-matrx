"use client";

// components/official/ListScopeSwitcher.tsx
//
// Compact segmented control for THE VIEW LAW's canonical list scope:
// Mine / Shared (optional) / one chip per non-personal org. Controlled —
// the caller owns the ListScope value and re-runs its query on change.
//
// Personal org is excluded from the org chips: content in the personal org
// IS "Mine" — surfacing it again as an org chip would duplicate the tab.

import { User, Users2, Building2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllOrgs } from "@/features/agent-context/redux/organizationsSlice";
import type { ListScope } from "@/lib/list-scope/types";
import { cn } from "@/lib/utils";

export interface ListScopeSwitcherProps {
  value: ListScope;
  onChange: (scope: ListScope) => void;
  /** Provide only if this surface has a shared-with-me source wired up. */
  onShared?: () => void;
  className?: string;
}

function scopeKey(scope: ListScope): string {
  return scope.kind === "org" ? `org:${scope.organizationId}` : scope.kind;
}

export function ListScopeSwitcher({
  value,
  onChange,
  onShared,
  className,
}: ListScopeSwitcherProps) {
  const orgs = useAppSelector(selectAllOrgs);
  const nonPersonalOrgs = orgs.filter((o) => !o.is_personal);
  const activeKey = scopeKey(value);

  const baseChip =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap";
  const activeChip = "bg-primary text-primary-foreground";
  const inactiveChip = "text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1",
        className,
      )}
      role="tablist"
      aria-label="List scope"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeKey === "mine"}
        className={cn(baseChip, activeKey === "mine" ? activeChip : inactiveChip)}
        onClick={() => onChange({ kind: "mine" })}
      >
        <User className="h-3.5 w-3.5" />
        Mine
      </button>

      {onShared && (
        <button
          type="button"
          role="tab"
          aria-selected={activeKey === "shared"}
          className={cn(baseChip, activeKey === "shared" ? activeChip : inactiveChip)}
          onClick={() => {
            onChange({ kind: "shared" });
            onShared();
          }}
        >
          <Users2 className="h-3.5 w-3.5" />
          Shared
        </button>
      )}

      {nonPersonalOrgs.map((org) => {
        const key = `org:${org.id}`;
        return (
          <button
            key={org.id}
            type="button"
            role="tab"
            aria-selected={activeKey === key}
            className={cn(baseChip, activeKey === key ? activeChip : inactiveChip)}
            onClick={() => onChange({ kind: "org", organizationId: org.id })}
            title={org.name}
          >
            <Building2 className="h-3.5 w-3.5" />
            {org.name}
          </button>
        );
      })}
    </div>
  );
}
