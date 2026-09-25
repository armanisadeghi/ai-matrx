"use client";

import { useState } from "react";
import { Folder } from "lucide-react";
import * as icons from "lucide-react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  makeSelectEntityScopeIds,
  selectAllScopeTypesFlat,
} from "@/features/scopes/redux/selectors/tree";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

type LucideIcon = React.ComponentType<{ className?: string }>;

function resolveIcon(name: string): LucideIcon {
  const pascalName = name
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (icons as unknown as Record<string, LucideIcon>)[pascalName];
  return Icon ?? Folder;
}

interface ScopeTagsDisplayProps {
  entityType: string;
  entityId: string;
  className?: string;
}

export function ScopeTagsDisplay({
  entityType,
  entityId,
  className,
}: ScopeTagsDisplayProps) {
  // The canonical per-entity scope cache (scopesTree.entityScopesByKey) and
  // the canonical tree for names. Cache-only on purpose: a row in a list never
  // fires its own fetch; whatever loaded this entity's tags (its detail view,
  // a bulk read, a write) fills it. It read agent-context's scopeAssignments
  // slice until 2026-09-25, which nothing filled any more.
  const [selectScopeIds] = useState(makeSelectEntityScopeIds);
  const scopeIds = useAppSelector((state) =>
    selectScopeIds(state, {
      entityType: entityType as EntityTypeToken,
      entityId,
    }),
  );
  const types = useAppSelector(selectAllScopeTypesFlat);
  const labels: {
    scope_id: string;
    scope_name: string;
    type_color: string;
    type_icon: string;
  }[] = [];
  for (const scopeId of scopeIds) {
    for (const type of types) {
      const scope = type.scopes.find((candidate) => candidate.id === scopeId);
      if (!scope) continue;
      labels.push({
        scope_id: scopeId,
        scope_name: scope.name,
        type_color: type.color ?? "",
        type_icon: type.icon ?? "folder",
      });
      break;
    }
  }

  if (labels.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {labels.map((label) => {
        const Icon = resolveIcon(label.type_icon);
        return (
          <Badge
            key={label.scope_id}
            variant="outline"
            className="gap-1 text-xs font-medium"
            style={{
              borderColor: label.type_color,
              color: label.type_color,
            }}
          >
            <Icon className="h-3 w-3" />
            <span>{label.scope_name}</span>
          </Badge>
        );
      })}
    </div>
  );
}
