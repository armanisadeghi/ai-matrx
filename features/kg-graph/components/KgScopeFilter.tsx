// features/kg-graph/components/KgScopeFilter.tsx
//
// Scope filter for the org knowledge graph: pick one scope (Client X, Ava…) to
// narrow the graph to the entities from that scope's tagged sources. The backend
// `/kg/graph?scope_id=` resolves scope → tagged sources → entities, so this is
// purely a picker over the org's existing scopes — it reuses the canonical
// `useScopeTree` (no refetch of its own) and never writes context (read-only filter).

"use client";

import { type CSSProperties, useMemo } from "react";
import { Layers } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";

const ALL_SCOPES = "__all_scopes__";

// Keep the leading icon + label on one centered row (shadcn's trigger forces a
// vertical -webkit-box on its child span; inline style wins).
const TRIGGER_INNER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  minWidth: 0,
};

interface KgScopeFilterProps {
  organizationId: string | null;
  /** Selected scope id, or null for "all scopes". */
  value: string | null;
  onChange: (scopeId: string | null) => void;
  /** When set, restrict the list to one scope type (e.g. only "Clients"). */
  scopeTypeId?: string | null;
  className?: string;
}

export function KgScopeFilter({
  organizationId,
  value,
  onChange,
  scopeTypeId,
  className,
}: KgScopeFilterProps) {
  const { organizations } = useScopeTree();

  const types = useMemo(() => {
    const org = organizations.find((o) => o.id === organizationId);
    const all = org?.scope_types ?? [];
    const scoped = scopeTypeId ? all.filter((t) => t.id === scopeTypeId) : all;
    return scoped.filter((t) => t.scopes.length > 0);
  }, [organizations, organizationId, scopeTypeId]);

  // Nothing to filter by → render nothing (don't show an empty control).
  if (types.length === 0) return null;

  return (
    <Select
      value={value ?? ALL_SCOPES}
      onValueChange={(v) => onChange(v === ALL_SCOPES ? null : v)}
    >
      <SelectTrigger className={className}>
        <span style={TRIGGER_INNER}>
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All scopes" />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_SCOPES} className="text-xs">
          All scopes
        </SelectItem>
        {types.flatMap((t) =>
          t.scopes.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              {t.label_singular}: {s.name}
            </SelectItem>
          )),
        )}
      </SelectContent>
    </Select>
  );
}
