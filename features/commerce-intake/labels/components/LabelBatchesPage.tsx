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
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";

import { buildLabelBatchListConfig } from "../listConfig";
import { CreateLabelBatchDialog } from "./CreateLabelBatchDialog";
import { ImportIdentifiersDialog } from "./ImportIdentifiersDialog";

export function LabelBatchesPage() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
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
