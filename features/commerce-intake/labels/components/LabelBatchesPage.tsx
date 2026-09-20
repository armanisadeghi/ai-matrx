"use client";

/**
 * /commerce/labels — the label-batch register (feature entry pages are LIST
 * views). New batch + customer-ID import ride the header actions.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, FileUp, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";

import { buildLabelBatchListConfig } from "../listConfig";
import { CreateLabelBatchDialog } from "./CreateLabelBatchDialog";
import { ImportIdentifiersDialog } from "./ImportIdentifiersDialog";

export function LabelBatchesPage() {
  // THE ACTIVE ORGANIZATION, NEVER AN "EFFECTIVE" ONE — this read the
  // personal-org fallback, so an unselected picker listed (and created batches
  // in) the PERSONAL workspace with nothing on screen saying so.
  const organizationId = useAppSelector(selectOrganizationId);
  // Without an org there is no list to build: say so rather than render a
  // header over an empty page that looks broken.
  // 🚨 THE FOURTH STATE IS NOT THE REFUSAL (R37). `orgBootstrapResolved` is
  // set TRUE by `setOrgBootstrapFailure` as well, so "resolved and still no
  // id" was ALSO the failed read — and this screen told a member of thirteen
  // organizations to pick one. The gate's discriminant separates them and the
  // ONE notice renders each, the failed one with its Retry.
  const { organizationState } = useOrganizationRequired();
  const organizationUnanswered =
    organizationState === "required" || organizationState === "unavailable";
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const config = useMemo(
    () => (organizationId ? buildLabelBatchListConfig(organizationId) : null),
    [organizationId],
  );

  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="h-11 lg:h-7" asChild>
        <Link href="/commerce/labels/printers">
          <BadgeCheck className="h-4 w-4" />
          <span className="max-sm:sr-only">Printers</span>
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-11 lg:h-7"
        onClick={() => setImporting(true)}
      >
        <FileUp className="h-4 w-4" />
        <span className="max-sm:sr-only">Import IDs</span>
      </Button>
      <Button
        size="sm"
        className="h-11 lg:h-7"
        onClick={() => setCreating(true)}
      >
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New batch</span>
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold text-foreground">
            QR Labels
          </h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Print runs of pooled intake codes
          </span>
          {/* Label batches are one printable among many — the hub indexes the rest (label stock, QR, barcodes, ZPL, documents). */}
          <Link
            href="/print"
            className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Print hub
          </Link>
        </div>
      </PageHeader>
      {organizationUnanswered && (
        <OrganizationContextNotice
          state={organizationState}
          what="Label batches"
        />
      )}
      {config && (
        <EntityListPage
          config={config}
          defaultScope={{ kind: "orgs", organizationId }}
          headerActions={actions}
          emptyAction={actions}
        />
      )}
      {organizationId && (
        <>
          <CreateLabelBatchDialog
            organizationId={organizationId}
            open={creating}
            onOpenChange={setCreating}
          />
          <ImportIdentifiersDialog
            organizationId={organizationId}
            open={importing}
            onOpenChange={setImporting}
          />
        </>
      )}
    </>
  );
}
