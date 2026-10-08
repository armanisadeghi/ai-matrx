"use client";

/**
 * /commerce/labels/printers — the certified-printer register (feature entry
 * pages are LIST views). "Certify a printer" rides the header action.
 */

import { useMemo } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";

import { buildCertifiedPrinterListConfig } from "../listConfig";
import { certifyPrinterHref } from "../types";

export function CertifiedPrintersPage() {
  const router = useRouter();
  const config = useMemo(() => buildCertifiedPrinterListConfig(), []);

  const actions = (
    <ControlButton variant="primary" asChild icon={<BadgeCheck className="h-4 w-4" />} collapse="container">
      <Link href={certifyPrinterHref()}>
        Certify a printer
      </Link>
    </ControlButton>
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
          defaultScope={{ kind: "orgs" }}
          headerActions={actions}
          emptyAction={actions}
        />
      )}
    </>
  );
}
