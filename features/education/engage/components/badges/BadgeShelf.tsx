// features/education/engage/components/badges/BadgeShelf.tsx
//
// The badge shelf — earned + locked, all OUTCOME milestones (mastery, healthy
// habit, comeback), never vanity (hours logged). Locked badges show their
// criteria so the goal is transparent.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useBadges } from "../../data/useEngageMeta";
import { BADGE_LIST } from "../../engine/badges";

export function BadgeShelf() {
  const { earnedKeys, loading } = useBadges();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Badges</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BADGE_LIST.map((def) => {
          const earned = earnedKeys.has(def.key);
          const Icon = def.icon;
          return (
            <div
              key={def.key}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center",
                earned
                  ? "border-primary/40 bg-primary/5"
                  : "border-border opacity-60",
              )}
              title={def.description}
            >
              <Icon
                className={cn(
                  "h-6 w-6",
                  earned ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="text-xs font-medium text-foreground">
                {def.label}
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {def.description}
              </span>
            </div>
          );
        })}
      </div>
      {loading && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3"
            >
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
