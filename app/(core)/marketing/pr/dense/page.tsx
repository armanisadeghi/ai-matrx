import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import PressRoomWorkspace from "@/features/marketing/pr/dense/PressRoomWorkspace";

export const metadata: Metadata = {
  title: "The Press Room",
  description:
    "Find what is newsworthy about this business, prove it, match it to the journalists asking for it right now, and track what landed.",
};

export default function PressRoomDensePage() {
  return (
    <>
      <PageHeader>
        {/* pr-14 clears the shell's fixed 44x44 user-menu avatar. */}
        <div className="flex w-full min-w-0 items-center gap-2 pr-14">
          <h1 className="truncate text-sm font-medium text-foreground">
            The Press Room
          </h1>
          <span className="hidden truncate text-xs text-muted-foreground lg:inline">
            What is newsworthy about you, what proves it, and who is asking
          </span>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <Suspense fallback={<LoadingSurface label="Opening the press room…" />}>
          <PressRoomWorkspace />
        </Suspense>
      </div>
    </>
  );
}
