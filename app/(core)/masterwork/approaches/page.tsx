// app/(core)/masterwork/approaches/page.tsx
//
// The standing catalog of Distillation Approaches. Before this route the only
// way to meet an Approach was to be mid-task inside a funnel — so an Approach
// that existed could still be invisible (Arman, 2026-08-21). One URL, every
// Approach, honest status.

"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ApproachCatalogPage } from "@/features/masterwork/browse/ApproachCatalogPage";

export default function ApproachesRoute() {
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/masterwork" ariaLabel="Back to Masterwork" />
            <h1 className="ml-2 truncate text-sm font-medium text-foreground">
              Ways to start
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <ApproachCatalogPage />
      </div>
    </>
  );
}
