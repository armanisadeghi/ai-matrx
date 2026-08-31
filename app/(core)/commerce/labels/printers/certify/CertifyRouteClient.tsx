"use client";

// Client shell for /commerce/labels/printers/certify — header + scrollable
// body around the canonical CertifyPrinterWizard. `?id=` re-checks an
// existing certification against the same printer and stock.

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CertifyPrinterWizard } from "@/features/commerce-intake/labels/printers/components/CertifyPrinterWizard";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export function CertifyRouteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const existingId = searchParams.get("id") ?? undefined;

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
            {existingId ? "Re-check a printer" : "Certify a printer"}
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="px-3 pt-3">
          <CertifyPrinterWizard
            organizationId={organizationId}
            userId={userId}
            existingId={existingId}
          />
        </div>
      </div>
    </>
  );
}
