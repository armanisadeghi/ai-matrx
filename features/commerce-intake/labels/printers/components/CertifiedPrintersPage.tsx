"use client";

/**
 * /commerce/labels/printers — the certified-printer register (feature entry
 * pages are LIST views). "Certify a printer" rides the header action.
 */

import { useMemo } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";

import { buildCertifiedPrinterListConfig } from "../listConfig";
import { certifyPrinterHref } from "../types";

export function CertifiedPrintersPage() {
  const router = useRouter();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

  const config = useMemo(
    () =>
      organizationId ? buildCertifiedPrinterListConfig(organizationId) : null,
    [organizationId],
  );

  const actions = (
    <Button size="sm" className="h-11 lg:h-7" asChild>
      <Link href={certifyPrinterHref()}>
        <BadgeCheck className="h-4 w-4" />
        <span className="max-sm:sr-only">Certify a printer</span>
      </Link>
    </Button>
  );

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
            Certified Printers
          </h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Which printers are proven to print your label stock correctly
          </span>
        </div>
      </PageHeader>
      {config && (
        <EntityListPage
          config={config}
          defaultScope={{ kind: "orgs", organizationId }}
          headerActions={actions}
          emptyAction={actions}
        />
      )}
    </>
  );
}
