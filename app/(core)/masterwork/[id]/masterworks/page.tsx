// app/(core)/expertise/[id]/desks/page.tsx
//
// Desks compiled from this pack (workflow.definition rows stamped
// compiled_from_pack) — run them, see drift against the pack's version.

"use client";

import { use } from "react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { PackDesksPage } from "@/features/expertise/components/desks/PackDesksPage";

export default function ExpertisePackDesksRoute({
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
              href={`/expertise/${id}`}
              ariaLabel="Back to the pack"
            />
            <h1 className="ml-2 truncate text-sm font-medium text-foreground">
              Desks
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <PackDesksPage packId={id} />
      </div>
    </>
  );
}
