// app/(core)/masterwork/[id]/page.tsx
//
// Rulebook detail — THE Expert surface: read and edit your Rulebook.

"use client";

import { use } from "react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { RulebookDetailPage } from "@/features/masterwork/components/detail/RulebookDetailPage";

export default function RulebookRoute({
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
            <ChevronLeftTapButton
              href="/masterwork/all"
              ariaLabel="Back to Masterwork Studio"
            />
            <h1 className="ml-2 truncate text-sm font-medium text-foreground">
              Rulebook
            </h1>
          </>
        }
        right={
          <MandateDoorLink
            feature="masterwork"
            label="Masterwork agents"
            context={{ rulebookId: id }}
          />
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <RulebookDetailPage rulebookId={id} />
      </div>
    </>
  );
}
