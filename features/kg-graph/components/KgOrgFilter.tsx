// features/kg-graph/components/KgOrgFilter.tsx
//
// Organization picker for the org knowledge graph toolbar. The graph's org is
// often set from the route (`?org=`) or the active context — but the user must
// always be able to SEE and CHANGE it (never feel stuck on a deep-linked org).
// Reuses the canonical `useScopeTree` org list (no refetch); read-only filter.

"use client";

import { type CSSProperties } from "react";
import { Building2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";

const TRIGGER_INNER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  minWidth: 0,
};

interface KgOrgFilterProps {
  value: string | null;
  onChange: (orgId: string | null) => void;
  className?: string;
}

const ALL_ORGS = "__all_orgs__";

export function KgOrgFilter({ value, onChange, className }: KgOrgFilterProps) {
  const { organizations } = useScopeTree();
  if (organizations.length === 0) return null;

  // "All organizations" (null org) is ALWAYS available so the user is never
  // trapped on a deep-linked org — the backend returns the union of the user's
  // visible orgs + the global corpus when no org_id is sent.
  return (
    <Select
      value={value ?? ALL_ORGS}
      onValueChange={(v) => onChange(v === ALL_ORGS ? null : v)}
    >
      <SelectTrigger className={className}>
        <span style={TRIGGER_INNER}>
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All organizations" />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_ORGS} className="text-xs">
          All organizations
        </SelectItem>
        {organizations.map((o) => (
          <SelectItem key={o.id} value={o.id} className="text-xs">
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
