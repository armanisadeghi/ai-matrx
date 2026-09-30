"use client";

// components/official/ListScopeSwitcher.tsx
//
// Compact segmented control for THE VIEW LAW's canonical list scope:
// Mine / Shared (optional) / one chip per org. Controlled — the caller owns the
// lane AND the organization filter and re-runs its query on change. An org chip
// is the My Orgs lane with the organization filter set to that org (the two are
// separate axes: lib/list-scope/types.ts § TWO AXES).

import { User, Users2, Building2 } from "lucide-react";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { scopeKey, type ListScope } from "@/lib/list-scope/types";
import { cn } from "@/lib/utils";

export interface ListScopeSwitcherProps {
  value: ListScope;
  /** The organization filter (null = All organizations). */
  orgId?: string | null;
  onChange: (scope: ListScope, orgId: string | null) => void;
  /** Provide only if this surface has a shared-with-me source wired up. */
  onShared?: () => void;
  className?: string;
}

export function ListScopeSwitcher({
  value,
  orgId = null,
  onChange,
  onShared,
  className,
}: ListScopeSwitcherProps) {
  const { organizations } = useUserOrganizations();
  const activeKey =
    value.kind === "orgs" && orgId ? `orgs:${orgId}` : scopeKey(value);

  const baseChip =
    "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap lg:min-h-8 lg:px-2.5";
  const activeChip = "bg-primary text-primary-foreground";
  const inactiveChip =
    "text-muted-foreground hover:bg-muted hover:text-foreground";

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
        className={cn(
          baseChip,
          activeKey === "mine" ? activeChip : inactiveChip,
        )}
        onClick={() => onChange({ kind: "mine" }, null)}
      >
        <User className="h-3.5 w-3.5" />
        Mine
      </button>

      {onShared && (
        <button
          type="button"
          role="tab"
          aria-selected={activeKey === "shared"}
          className={cn(
            baseChip,
            activeKey === "shared" ? activeChip : inactiveChip,
          )}
          onClick={() => {
            onChange({ kind: "shared" }, null);
            onShared();
          }}
        >
          <Users2 className="h-3.5 w-3.5" />
          Shared
        </button>
      )}

      {organizations.map((org) => {
        const key = `orgs:${org.id}`;
        return (
          <button
            key={org.id}
            type="button"
            role="tab"
            aria-selected={activeKey === key}
            className={cn(
              baseChip,
              activeKey === key ? activeChip : inactiveChip,
            )}
            onClick={() => onChange({ kind: "orgs" }, org.id)}
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
