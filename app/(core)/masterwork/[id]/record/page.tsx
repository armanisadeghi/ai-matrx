// app/(core)/masterwork/[id]/record/page.tsx
//
// "Your words" — THE RECORD. Everything the Expert has contributed to this
// Rulebook: every interview turn, every uploaded source, every recording,
// oldest first, each with a door back to where it came from.

"use client";

import { use } from "react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ExpertRecordPage } from "@/features/masterwork/record/ExpertRecordPage";

export default function RulebookRecordRoute({
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
              Your words
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <ExpertRecordPage rulebookId={id} />
      </div>
    </>
  );
}
