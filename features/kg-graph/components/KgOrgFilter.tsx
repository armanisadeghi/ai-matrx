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

export function KgOrgFilter({ value, onChange, className }: KgOrgFilterProps) {
  const { organizations } = useScopeTree();
  // Only worth showing once the user has more than one org to choose between.
  if (organizations.length < 2) return null;

  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
      <SelectTrigger className={className}>
        <span style={TRIGGER_INNER}>
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Organization" />
        </span>
      </SelectTrigger>
      <SelectContent>
        {organizations.map((o) => (
          <SelectItem key={o.id} value={o.id} className="text-xs">
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
