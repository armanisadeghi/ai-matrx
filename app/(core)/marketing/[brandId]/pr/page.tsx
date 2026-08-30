// app/(core)/marketing/[brandId]/pr/page.tsx
//
// THE PRESS ROOM for one client — the Press & PR section of the brand
// workspace.
//
// Server Component. It owns route chrome and nothing else; everything
// interactive lives in `features/marketing/pr/`. A Suspense boundary is
// required because the workspace reads search params on the client.
//
// NOTE (agency restructure, 2026-08-29): `PressRoomWorkspace` is the canonical
// component the flat `/marketing/pr` route used and is mounted here unchanged.
// It still reads its brand from `?brand=` and self-selects the first brand when
// that is absent, so it does not yet follow the brand in the path; binding it
// to `useMarketingBrand()` is a component change, tracked in the restructure
// handoff.

import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedPressRoom } from "@/features/marketing/pr/BrandScopedPressRoom";

export const metadata: Metadata = {
  title: "Press Room",
  description:
    "What is newsworthy about this business, the proof each story still needs, the journalists asking for it right now, and the coverage it produced.",
};

export default function BrandPressRoomPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2">
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
          <BrandScopedPressRoom />
        </Suspense>
      </div>
    </>
  );
}
