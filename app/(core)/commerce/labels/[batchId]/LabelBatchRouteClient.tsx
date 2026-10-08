"use client";

// Client shell for /commerce/labels/[batchId] — header + scrollable body
// around the canonical LabelBatchDetail.

import { useRouter } from "next/navigation";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { LabelBatchDetail } from "@/features/commerce-intake/labels/components/LabelBatchDetail";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

export function LabelBatchRouteClient({ batchId }: { batchId: string }) {
  const router = useRouter();
  // The EXPLICIT active org — never a personal-workspace substitute. The
  // component below already refuses honestly when it is null.
  const organizationId = useAppSelector(selectOrganizationId);
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton onClick={() => router.back()} ariaLabel="Back" />
            <h1 className="truncate text-sm font-semibold text-foreground">
              Label batch
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="px-3 pt-3">
          <LabelBatchDetail batchId={batchId} organizationId={organizationId} />
        </div>
      </div>
    </>
  );
}
