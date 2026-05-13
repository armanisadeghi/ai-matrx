"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HierarchyTreePage } from "@/features/agent-context/components/HierarchyTreePage";

export default function HierarchyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full">
          <div className="w-[380px] border-r border-border/50 p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-7"
                style={{ width: `${85 - i * 6}%`, marginLeft: `${i * 16}px` }}
              />
            ))}
          </div>
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      }
    >
      <HierarchyTreePage />
    </Suspense>
  );
}
