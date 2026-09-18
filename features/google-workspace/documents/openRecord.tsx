"use client";

/**
 * 🚨 THE DETAIL PRIMITIVE IS THE ONE DOC SURFACE — AND THIS IS HOW A PICKED FILE
 * REACHES IT (F-58, closing VERIFY-U-W1-U-W2 N1 and N2).
 *
 * Before this file, `workbench.google_document` was a table with no reachable
 * creator: the ONLY writer is `POST /google-sync/documents/refresh`, and its only
 * two callers — the Doc's own Detail panel and that panel's health strip — both
 * run *after* a row already exists. So the Record was created only from the
 * Record, the live table held 0 rows, and the only Doc surface a person could
 * actually reach was a bespoke "Read selected Doc" textarea plus a raw append box
 * on the Google review screen (deleted in the same commit as this file).
 *
 * So the act that already authorized the mirror — the person picking the file —
 * is also the act that brings its Record into existence:
 *
 *   1. read the Record this picked resource already has (`resource_id`);
 *   2. if there is none, refresh it into existence and use the id the server
 *      returns — the ONE birth door, never a client insert;
 *   3. open it through THE ONE opener (`useOpenDetail`), in place: window by
 *      default, docked or page per `ui.detail.default_presentation`. Nothing
 *      navigates away and no surface links to a mandate or a detail route.
 *
 * Refresh-on-open is NOT repeated here. `GoogleDocumentPanel` is the one place
 * that decides it, against `google.refresh.on_open_min_age_seconds` and with the
 * detached guard — so an already-born Record opens and the panel spends a Google
 * call only when the copy is stale, and never for a record kept as AI Matrx data.
 *
 * WHY THE ROW READ LIVES HERE and not in `documents/service.ts`: that module is
 * owned by a concurrent lane in this checkout. It is the same table, the same
 * masking view and the same `deleted_at is null` rule as `readGoogleDocumentRow`;
 * when the lanes settle, this read folds into that module.
 */

import { useCallback, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";
import type { GoogleConnectionResource } from "@/features/marketing/google/types";

import { GOOGLE_DOCUMENT_TYPE } from "./record";
import { refreshGoogleDocument } from "./service";

/**
 * The picked-resource types that HAVE a `google_document` Record.
 *
 * Exactly the two `refresh_document` resolves (`resolve_registered_resource` with
 * `google_document`, then `google_spreadsheet`). A picked Slides deck is a real,
 * listed, openable-in-Google resource with NO Record behind it, so it is never
 * offered this control — a button that answers 404 is a control that does nothing.
 */
export const GOOGLE_RECORD_RESOURCE_TYPES = [
  "google_document",
  "google_spreadsheet",
] as const;

export type GoogleRecordResourceType =
  (typeof GOOGLE_RECORD_RESOURCE_TYPES)[number];

export function hasGoogleDocumentRecord(
  resourceType: string,
): resourceType is GoogleRecordResourceType {
  return (GOOGLE_RECORD_RESOURCE_TYPES as readonly string[]).includes(
    resourceType,
  );
}

/**
 * What the click COSTS, said before it is clicked. Opening a file that has no
 * Record yet spends one Google call and keeps a copy of the file here; opening
 * one that already has a Record spends nothing. Every list that offers the
 * control prints this sentence beside it.
 */
export const OPEN_GOOGLE_RECORD_CONSEQUENCE =
  "Opening a file as its record reads it from Google the first time and keeps a copy here in AI Matrx.";

/** The Record this picked resource already has, or null. */
async function existingRecordId(
  resourceId: string,
): Promise<{ id: string; title: string } | null> {
  const { data, error } = await supabase
    .schema("workbench")
    .from("google_document")
    .select("id, title")
    .eq("resource_id", resourceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export interface PickedGoogleRecordResource {
  /** The picked-resource row's id (`users.integration_connection_resources`). */
  id: string;
  /** Google's own file id. */
  resource_ref: string;
  resource_type: string;
  display_name: string;
}

/**
 * Open a picked Google file as its Record, in place. Returns false when the
 * resource has no Record behind it (the caller should not have offered it).
 */
export function useOpenGoogleDocumentRecord(): (
  resource: PickedGoogleRecordResource,
) => Promise<boolean> {
  const openDetail = useOpenDetail(GOOGLE_DOCUMENT_TYPE);

  return useCallback(
    async (resource) => {
      if (!hasGoogleDocumentRecord(resource.resource_type)) return false;
      const existing = await existingRecordId(resource.id);
      if (existing) {
        await openDetail({
          type: GOOGLE_DOCUMENT_TYPE,
          id: existing.id,
          seed: { name: existing.title || resource.display_name, about: null },
        });
        return true;
      }
      // THE BIRTH DOOR. The server writes the Record and answers with its id;
      // this client never inserts into `workbench.google_document`.
      const born = await refreshGoogleDocument({
        fileId: resource.resource_ref,
      });
      await openDetail({
        type: GOOGLE_DOCUMENT_TYPE,
        id: born.id,
        seed: { name: born.title || resource.display_name, about: null },
      });
      return true;
    },
    [openDetail],
  );
}

function failureSentence(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.trim()
    ? raw
    : "This file could not be opened as a record. Try again, or open it in Google.";
}

/**
 * The ONE control every picked-resource list uses. One action per file: open it
 * as its Record. Never a second reader, never a second composer.
 */
export function OpenGoogleDocumentRecordButton({
  resource,
  size = "sm",
  variant = "outline",
  className,
}: {
  resource: PickedGoogleRecordResource;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
  className?: string;
}) {
  const openRecord = useOpenGoogleDocumentRecord();
  const [busy, setBusy] = useState(false);

  const click = useCallback(() => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        await openRecord(resource);
      } catch (error: unknown) {
        // NOTHING FAILS SILENTLY: a Record that could not be opened says so,
        // and the list it was clicked from is unchanged.
        toast.error(failureSentence(error));
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, openRecord, resource]);

  if (!hasGoogleDocumentRecord(resource.resource_type)) return null;

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      onClick={click}
      disabled={busy}
      title={OPEN_GOOGLE_RECORD_CONSEQUENCE}
      aria-label={`Open ${resource.display_name} as its AI Matrx record. ${OPEN_GOOGLE_RECORD_CONSEQUENCE}`}
      data-google-record-open={resource.id}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <FileText className="h-3.5 w-3.5" />
      )}
      Open the record
    </Button>
  );
}

/** Narrowing helper for inventory rows, which carry more than the four fields. */
export function pickedGoogleRecordResource(
  resource: GoogleConnectionResource,
): PickedGoogleRecordResource {
  return {
    id: resource.id,
    resource_ref: resource.resource_ref,
    resource_type: resource.resource_type,
    display_name: resource.display_name,
  };
}
