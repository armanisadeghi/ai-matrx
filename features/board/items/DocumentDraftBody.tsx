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
import { createDocument } from "@/features/documents/document-service";
import { isServiceFailure } from "@/features/data-tables/types";
import type { ItemBodyProps } from "./types";
import { NEW_DOCUMENT_NAME, documentSource } from "./document-items.logic";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

type Failure = { reason: string; cancelled: boolean };

/** Create the document. Outside the component: a `try` inside one makes the
 * React Compiler skip it (no memoisation at all). */
async function createDraftDocument(
  organizationId: string | null,
): Promise<{ id: string; name: string } | { failure: Failure }> {
  try {
    const organization = await ensureOrgId(organizationId);
    const res = await createDocument({ name: NEW_DOCUMENT_NAME, organizationId: organization });
    if (isServiceFailure(res)) throw new Error(res.error);
    return { id: res.data.id, name: res.data.document_name };
  } catch (err) {
    console.error("[board/document] could not create the document", err);
    return { failure: { reason: err instanceof Error ? err.message : String(err), cancelled: false } };
  }
}

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
    const result = await createDraftDocument(organizationId);
    busy.current = false;
    setCreating(false);
    if ("failure" in result) setFailure(result.failure);
    else onSource(documentSource(result.id), result.name);
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
      <Button icon={creating ? <Loader2 className="animate-spin" /> : <FilePlus2 />} variant="primary" type="button" onClick={() => void create()} disabled={creating}>
        {failure ? "Try again" : "Create document"}
      </Button>
    </div>
  );
}
