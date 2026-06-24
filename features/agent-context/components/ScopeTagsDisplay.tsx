"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectEntityScopesWithLabels } from "../redux/scope/selectors";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";

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
  const labels = useAppSelector((state) =>
    selectEntityScopesWithLabels(state, entityType, entityId),
  );

  if (labels.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {labels.map((label) => {
        return (
          <Badge
            key={label.assignment_id}
            variant="outline"
            className="gap-1 text-xs font-medium"
            style={{
              borderColor: label.type_color,
              color: label.type_color,
            }}
          >
            <ScopeIcon name={label.type_icon} className="h-3 w-3" />
            <span>{label.scope_name}</span>
          </Badge>
        );
      })}
    </div>
  );
}
