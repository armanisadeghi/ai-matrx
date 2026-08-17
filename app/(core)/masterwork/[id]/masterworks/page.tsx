// app/(core)/masterwork/[id]/masterworks/page.tsx
//
// Masterworks built from this Rulebook (workflow.definition rows stamped
// built_from_rulebook) — run them, see drift against the Rulebook's version.

"use client";

import { use } from "react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { MasterworksPage } from "@/features/masterwork/components/masterworks/MasterworksPage";

export default function RulebookMasterworksRoute({
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
              href={`/masterwork/${id}`}
              ariaLabel="Back to the Rulebook"
            />
            <h1 className="ml-2 truncate text-sm font-medium text-foreground">
              Masterworks
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <MasterworksPage rulebookId={id} />
      </div>
    </>
  );
}
