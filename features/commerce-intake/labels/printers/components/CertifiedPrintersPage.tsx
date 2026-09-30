"use client";

/**
 * /commerce/labels/printers — the certified-printer register (feature entry
 * pages are LIST views). "Certify a printer" rides the header action.
 */

import { useMemo } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";

import { buildCertifiedPrinterListConfig } from "../listConfig";
import { certifyPrinterHref } from "../types";

export function CertifiedPrintersPage() {
  const router = useRouter();
  const config = useMemo(() => buildCertifiedPrinterListConfig(), []);

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
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton onClick={() => router.back()} ariaLabel="Back" />
            <h1 className="truncate text-sm font-semibold text-foreground">
              Certified Printers
            </h1>
            <span className="ml-2 hidden truncate text-xs text-muted-foreground sm:inline">
              Which printers are proven to print your label stock correctly
            </span>
          </>
        }
        right={
          // Certification is one step in printing — the hub indexes the rest.
          <Link
            href="/print"
            aria-label="Print hub"
            className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Print hub
          </Link>
        }
      />
      {config && (
        <EntityListPage
          config={config}
          defaultScope={{ kind: "orgs", organizationId: null }}
          headerActions={actions}
          emptyAction={actions}
        />
      )}
    </>
  );
}
