// app/(core)/masterwork/encore/[id]/page.tsx
//
// Run one released Masterwork — the Encore run experience (input form, live
// streamed run, result, this Operator's own run history).

"use client";

import { use } from "react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { EncoreRunPage } from "@/features/masterwork/encore/EncoreRunPage";

export default function EncoreRunRoute({
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
              href="/masterwork/encore"
              ariaLabel="Back to Encore"
            />
            <h1 className="ml-2 truncate text-sm font-medium text-foreground">
              Run
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <EncoreRunPage masterworkId={id} />
      </div>
    </>
  );
}
