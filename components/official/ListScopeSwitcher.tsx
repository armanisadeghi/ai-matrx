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
import { Tabs } from "@ai-matrx/design-system/controls";

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

  const data = [
    { value: "mine", label: <><User />Mine</> },
    ...(onShared ? [{ value: "shared", label: <><Users2 />Shared</> }] : []),
    ...organizations.map((org) => ({
      value: `orgs:${org.id}`,
      label: <><Building2 />{org.name}</>,
      title: org.name,
    })),
  ];

  const select = (key: string) => {
    if (key === "mine") onChange({ kind: "mine" }, null);
    else if (key === "shared") {
      onChange({ kind: "shared" }, null);
      onShared?.();
    } else if (key.startsWith("orgs:")) onChange({ kind: "orgs" }, key.slice(5));
  };

  return (
    <Tabs
      variant="capsule"
      aria-label="List scope"
      value={activeKey}
      onValueChange={select}
      data={data}
      className={className}
    />
  );
}
