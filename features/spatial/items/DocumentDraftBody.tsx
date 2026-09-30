"use client";

/**
 * A new Document tile before its document exists. Nothing is created until the
 * person presses Create (never on mount: a remount, a reload or a tile taken
 * off the board must not leave a stray document). Create runs the /documents
 * "New" path exactly: the organization gate (`ensureOrganizationContext`,
 * which asks when no workspace is set) and then `createDocument`. The tile
 * then refers to the new document through `onSource`.
 */

import { useRef, useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { createDocument } from "@/features/data-tables/document-service";
import { isServiceFailure } from "@/features/data-tables/types";
import type { ItemBodyProps } from "./types";
import { NEW_DOCUMENT_NAME, documentSource } from "./document-items.logic";

type Failure = { reason: string; cancelled: boolean };

export function DocumentDraftBody({ onSource }: Pick<ItemBodyProps, "onSource">) {
  // The workspace the person is in — the same hint the /documents page hands
  // the gate. The gate decides; this never picks one by itself.
  const organizationId = useAppSelector(selectOrganizationId);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // One create per press, even on a double click.
  const busy = useRef(false);

  const create = async () => {
    if (busy.current) return;
    busy.current = true;
    setCreating(true);
    setFailure(null);
    try {
      const organization = await ensureOrganizationContext({ organizationId });
      const res = await createDocument({ name: NEW_DOCUMENT_NAME, organizationId: organization });
      if (isServiceFailure(res)) throw new Error(res.error);
      onSource(documentSource(res.data.id), res.data.document_name);
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) {
        setFailure({ reason: "Choose the workspace this document belongs to, then try again.", cancelled: true });
      } else {
        console.error("[spatial/document] could not create the document", err);
        setFailure({ reason: err instanceof Error ? err.message : String(err), cancelled: false });
      }
    } finally {
      busy.current = false;
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-card p-6 text-center">
      {failure ? (
        <ErrorNotice
          size="compact"
          title={failure.cancelled ? "No workspace chosen" : "This document could not be created"}
          message={failure.reason}
          operation="Create a document on the board"
        />
      ) : (
        <p className="max-w-xs text-sm text-muted-foreground">
          A new document, saved to Documents and editable here and at its own page.
        </p>
      )}
      <Button type="button" onClick={() => void create()} disabled={creating} className="gap-1.5">
        {creating ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}
        {failure ? "Try again" : "Create document"}
      </Button>
    </div>
  );
}
