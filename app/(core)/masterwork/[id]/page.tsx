// app/(core)/expertise/[id]/page.tsx
//
// Pack detail — THE expert surface: read and edit your rulebook.

"use client";

import { use } from "react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { PackDetailPage } from "@/features/expertise/components/detail/PackDetailPage";

export default function ExpertisePackRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/expertise" ariaLabel="Back to Expertise" />
            <h1 className="ml-2 truncate text-sm font-medium text-foreground">
              Expertise pack
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <PackDetailPage packId={id} />
      </div>
    </>
  );
}
