"use client";

// Client shell for /commerce/labels/[batchId] — header + scrollable body
// around the canonical LabelBatchDetail.

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { LabelBatchDetail } from "@/features/commerce-intake/labels/components/LabelBatchDetail";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";

export function LabelBatchRouteClient({ batchId }: { batchId: string }) {
  const router = useRouter();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="truncate text-sm font-semibold text-foreground">
            Label batch
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="px-3 pt-3">
          <LabelBatchDetail batchId={batchId} organizationId={organizationId} />
        </div>
      </div>
    </>
  );
}
