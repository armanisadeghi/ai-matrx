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

import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedPressRoom } from "@/features/marketing/pr/BrandScopedPressRoom";
import { PressRoomHeader } from "@/features/marketing/pr/PressRoomDoors";

export default async function BrandPressRoomPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  return (
    <>
      <PressRoomHeader brandId={brandId} />
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <Suspense fallback={<LoadingSurface label="Loading the press room…" />}>
          <BrandScopedPressRoom />
        </Suspense>
      </div>
    </>
  );
}
