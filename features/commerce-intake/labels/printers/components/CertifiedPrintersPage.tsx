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
import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";

import { buildCertifiedPrinterListConfig } from "../listConfig";
import { certifyPrinterHref } from "../types";

export function CertifiedPrintersPage() {
  const router = useRouter();
  // THE ACTIVE ORGANIZATION, NEVER AN "EFFECTIVE" ONE — this read the
  // personal-org fallback, so an unselected picker listed the PERSONAL
  // workspace's printers as if they were the organization's.
  const organizationId = useAppSelector(selectOrganizationId);
  // Without an org there is no list to build: say so rather than render a
  // header over an empty page that looks broken.
  const orgBootstrapResolved = useAppSelector(selectOrgBootstrapResolved);

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
          {/* Certification is one step in printing — the hub indexes the rest. */}
          <Link
            href="/print"
            className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Print hub
          </Link>
        </div>
      </PageHeader>
      {!organizationId && orgBootstrapResolved && (
        <OrganizationRequiredNotice what="Certified printers" />
      )}
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
