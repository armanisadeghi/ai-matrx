"use client";

import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import type { ScopeType } from "@/features/agent-context/redux/scope/types";

interface ScopeTypeCardProps {
  scopeType: ScopeType;
  scopeCount: number | null;
  itemCount: number | null;
  onClick: () => void;
}

export function ScopeTypeCard({
  scopeType,
  scopeCount,
  itemCount,
  onClick,
}: ScopeTypeCardProps) {
  const color = resolveColor(scopeType);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="p-5 cursor-pointer hover:border-primary/30 hover:bg-accent/30 transition-all group"
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-12 h-12 rounded-lg ${color.fg} flex items-center justify-center shrink-0`}
        >
          <ScopeIcon name={scopeType.icon} className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {scopeType.label_plural}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {scopeCount === null
              ? "—"
              : `${scopeCount} ${
                  scopeCount === 1
                    ? scopeType.label_singular.toLowerCase()
                    : scopeType.label_plural.toLowerCase()
                }`}
            {itemCount !== null && (
              <>
                {" · "}
                {itemCount} {itemCount === 1 ? "context item" : "context items"}
              </>
            )}
          </p>
          {scopeType.description && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {scopeType.description}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Card>
  );
}
