// app/(core)/marketing/pr/page.tsx
//
// THE PRESS ROOM — the hub for the Press & PR pillar of the marketing platform.
//
// Server Component. It owns route chrome and nothing else; everything
// interactive lives in `features/marketing/pr/`. The workspace reads its whole
// state from the URL (`?brand`, `?site`, `?view`, `?focus`, `?data`), so this
// route needs no props and no server-side branch.
//
// `(core)` route conventions: chrome via <PageHeader>, `pr-14` on the header
// row to clear the shell's fixed 44px user-menu avatar, and a Suspense boundary
// because the workspace reads search params on the client.

import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import PressRoomWorkspace from "@/features/marketing/pr/PressRoomWorkspace";

export const metadata: Metadata = {
  title: "Press Room",
  description:
    "What is newsworthy about this business, the proof each story still needs, the journalists asking for it right now, and the coverage it produced.",
};

export default function PressRoomPage() {
  return (
    <>
      <PageHeader>
        {/* pr-14 clears the shell's fixed 44px user-menu avatar. */}
        <div className="flex w-full min-w-0 items-center gap-2 pr-14">
          <h1 className="truncate text-sm font-medium text-foreground">
            Press Room
          </h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Find the story · prove it · pitch it · prove it landed
          </span>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <Suspense fallback={<LoadingSurface label="Loading the press room…" />}>
          <PressRoomWorkspace />
        </Suspense>
      </div>
    </>
  );
}
