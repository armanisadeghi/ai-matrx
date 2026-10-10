"use client";

// features/make/MakeMount.tsx — LANE MAKE-HOME.
//
// THE TWO PIECES EVERY "MAKE" SURFACE SHARES:
//   · `MakeMount` — the record store mounted for ONE organization through the real host
//     (`recordsUiHostFor` + `useRecordsUiPorts`, the ports every table surface binds). The store
//     is never off (CHAIR-ALWAYS-ON, 2026-10-03), so nothing is asked before it mounts.
//   · `NewTableDialog` — THE one place a new table's name box opens (G5 b): both data homes' header
//     "New table" and /make's Table tile ("Start from a template" leads to /make's one gallery). It says where the table will be
//     saved (the active organization, changeable in place) and, with none chosen, asks for one
//     right there — the control is never hidden for want of an organization, and none is picked
//     for the person. Guard: __tests__/new-table-is-never-hidden-and-opens-where-pressed.test.tsx.

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { RecordsMount, TablesHome } from "@ai-matrx/records-ui";
import { TEMPLATE_GALLERY_HREF } from "./gallery/galleryHref";

import { Button } from "@ai-matrx/design-system";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationName } from "@/features/scopes/redux/selectors/active-context";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { OrganizationPickerPopover } from "@/features/organizations/components/OrganizationPickerPopover";
import {
  recordsUiHostFor,
  useAppRecordsConfig,
  useRecordsUiPorts,
} from "@/features/data-tables/records-ui-host/recordsUiHost";

/** The no-organization notice's line here: nothing failed to load, a new thing needs a home. */
export const SAVED_WHERE_CHOSEN = "New things are saved in the organization you choose";

export function MakeMount({ organizationId, children }: { organizationId: string; children: ReactNode }) {
  const recordsConfig = useAppRecordsConfig(organizationId);
  const ports = useRecordsUiPorts({ organizationId, dataSource: recordsConfig.dataSource });
  return (
    // org-filter: write-target the mount is where the made thing lives: the chosen table's organization, or where new things are saved
    <RecordsMount
      letTheStoreDecideRights
      config={recordsConfig}
      host={recordsUiHostFor({ ports, merged: false })}
    >
      {children}
    </RecordsMount>
  );
}

/** One line: where new things are saved, and the control that changes it (A3). */
export function SavesTo() {
  // org-filter: write-target this names where a NEW thing is saved; nothing is read through it
  const active = useOrganizationRequired();
  // org-filter: write-target its name labels where new things are saved
  const name = useAppSelector(selectActiveOrganizationName);
  if (active.organizationState !== "ready" && active.organizationState !== "required") return null;
  const label =
    active.organizationState === "ready" && name ? `New things save to ${name}` : "Choose where new things are saved";
  return (
    <OrganizationPickerPopover
      align="end"
      trigger={
        <Button size="sm" variant="ghost" className="max-w-full gap-1.5 text-muted-foreground" data-make-saves-to={active.organizationState}>
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </Button>
      }
    />
  );
}

/**
 * The ways to make a table — blank, from an example, from a file — in the organization new things
 * are saved to; with none chosen, the organization question in its place. `what` opens the name box
 * at once; absent, the person picks: blank, a template from the gallery, or a file.
 */
export function NewTableBody({
  what,
  organization,
  onClose,
}: {
  what?: "create" | undefined;
  /** A record's own organization: the table is made there, the active organization untouched. */
  organization?: { id: string; name: string } | null;
  /** The frame this body sits in closes (Cancel, or a table was opened). */
  onClose?: (() => void) | undefined;
}) {
  const router = useRouter();
  // org-filter: write-target a new table is made in the organization new things are saved to
  const active = useOrganizationRequired();
  const targetId = organization?.id ?? active.organizationId;
  if (!organization && (active.organizationState !== "ready" || !active.organizationId)) {
    const state = active.organizationState === "ready" ? "required" : active.organizationState;
    return <OrganizationContextNotice state={state} what="New tables" description={SAVED_WHERE_CHOSEN} compact />;
  }
  const asked = what ? { create: 1 } : undefined;
  return (
    <MakeMount organizationId={targetId as string}>
      <TablesHome
        makingOnly
        className="h-full"
        templatesHref={TEMPLATE_GALLERY_HREF}
        describeHref="/make"
        connectHref="/data/connect"
        {...(asked ? { askedBy: asked } : {})}
        {...(onClose ? { onCancel: onClose } : {})}
        onOpenTable={(tableId: string, dashboardId?: string | null) => {
          onClose?.();
          router.push(dashboardId ? `/data/${tableId}?dashboard=${dashboardId}` : `/data/${tableId}`);
        }}
      />
    </MakeMount>
  );
}

/** The data homes' New table, opened where it was pressed. */
export function NewTableDialog({
  what,
  onClose,
  organization,
}: {
  what: "create" | null;
  onClose: () => void;
  /** Make the table in this organization (a record's own) instead of the active one. */
  organization?: { id: string; name: string } | null;
}) {
  return (
    <Dialog open={what !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      {/* A real size, fixed (moving between Blank, Import and the column step never resizes it); on a
          phone the same dialog is a full-height sheet. The close X has its own corner (pr-14). */}
      <DialogContent className="flex h-[min(40rem,85dvh)] w-[min(38rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 max-md:h-[90dvh]">
        <div className="flex shrink-0 flex-col gap-0.5 border-b py-3 pl-5 pr-14">
          <DialogTitle className="text-base font-semibold">New table</DialogTitle>
          {organization ? (
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground" data-make-saves-to="record">
              <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">Saves to {organization.name}</span>
            </span>
          ) : (
            <div className="-ml-2 flex min-w-0">
              <SavesTo />
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1" data-new-table-dialog={what ?? ""} data-connect-database-entry="">
          {what ? <NewTableBody what={what} organization={organization ?? null} onClose={onClose} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
