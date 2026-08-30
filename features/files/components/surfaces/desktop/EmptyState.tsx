/**
 * features/files/components/surfaces/dropbox/EmptyState.tsx
 *
 * Dropbox-styled empty state used by Photos / Shared / File requests /
 * Starred / Activity sections when there's nothing to show (or the feature
 * hasn't landed yet).
 */

"use client";

import type { LucideIcon } from "lucide-react";
import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import { getComingSoon } from "@/lib/coming-soon/registry";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  comingSoonId?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  comingSoonId,
  action,
  className,
}: EmptyStateProps) {
  const registeredPromise = comingSoonId
    ? getComingSoon(comingSoonId)
    : undefined;

  if (comingSoonId && !registeredPromise) {
    throw new Error(
      `EmptyState: "${comingSoonId}" is missing from lib/coming-soon/registry.ts.`,
    );
  }

  const displayedTitle = registeredPromise?.label ?? title;
  const displayedDescription = registeredPromise?.promise ?? description;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
        <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          {displayedTitle}
          {registeredPromise ? (
            <ComingSoonBadge
              label={registeredPromise.stage}
              className="ml-2 uppercase tracking-wide"
            />
          ) : null}
        </h2>
        {displayedDescription ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            {displayedDescription}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
