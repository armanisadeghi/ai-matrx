"use client";

/**
 * ExportArtifactDownload — the E-23 reference envelope, rendered honestly.
 *
 * WHAT THE ENVELOPE IS (as of aidream 6dfceff69): `{file_id, sha256, download_url}`. There is no
 * `signed_url`, `cdn_url`, or `expires_at` any more — `download_url` is the platform's durable,
 * never-expiring redemption door (`{PUBLIC_URL}/files/{file_id}/download`), authenticated on
 * every request. Every field in this envelope is safe to persist for good.
 *
 * ══ THE `a.download` FILENAME PROBLEM, AND WHICH HORN WE TOOK ══════════════════════════════════
 * `features/files/components/core/FileActions/useFileActions.ts` documents it: a signed S3 URL is
 * CROSS-ORIGIN, and browsers silently ignore the `download` attribute on a cross-origin anchor.
 * The file saves under whatever name the URL path carries — usually a bare UUID with no
 * extension. For a payroll file that is not cosmetic: `9f3e6c0a…` with no `.csv` will not open in
 * a spreadsheet by double-click, and a payroll administrator who has to rename a file by hand
 * before importing it is one rename away from importing last period's.
 *
 * There are two honest options and no third:
 *   (a) stream the bytes through the file service and save from a same-origin `blob:` URL, where
 *       `a.download` IS honoured and the server's `Content-Disposition` filename survives; or
 *   (b) hand the user the signed URL and let the browser do whatever it does with the name.
 *
 * WE TOOK (a), for the reason above, and it is the same primitive `useFileActions.download()`
 * uses — `features/files/api/files.ts` `downloadFile(file_id)` — rather than a second byte path
 * beside it. The envelope's `file_id` is exactly the handle it needs.
 *
 * (b) is still offered, deliberately and labelled: the byte stream needs the file service to be
 * reachable, and when it is not — including `NEXT_PUBLIC_HR_MOCK=1`, where the HR transport is
 * swapped but the file service is not — a payroll administrator must still be able to get their
 * file. The link is presented as "open in a new tab", not as a download, because that is the
 * truthful description of what it does.
 */

import { useState } from "react";
import { Download, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { downloadBlob } from "@/lib/python-client";
import { toast } from "@/lib/toast";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import type { ExportEnvelope } from "../types";

export function ExportArtifactDownload({
  envelope,
  /** Used only to name the saved file when the server sends no Content-Disposition. */
  filenameHint,
}: {
  envelope: ExportEnvelope;
  filenameHint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const url = envelope.download_url;

  const save = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await downloadBlob(
        `/files/${encodeURIComponent(envelope.file_id)}/download`,
      );
      // A blob: URL is same-origin, so `a.download` is honoured and the file lands with the
      // right name and extension — the whole reason we stream the bytes instead of linking.
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename ?? filenameHint ?? "payroll-export";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err: unknown) {
      // Scream, never swallow: a download that quietly does nothing reads as "the file vanished".
      toast.error(
        err instanceof Error
          ? `Couldn't save the file: ${err.message}`
          : "Couldn't save the file.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="mr-2 h-4 w-4" aria-hidden />
          )}
          {busy ? "Preparing…" : "Save the file"}
        </Button>
        {url ? (
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
              Open in a new tab
            </a>
          </Button>
        ) : null}
      </div>

      <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="flex items-center gap-1 text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Checksum (SHA-256)
        </dt>
        <dd className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-foreground" title={envelope.sha256}>
            {envelope.sha256}
          </span>
          <CopyButton content={envelope.sha256} label="checksum" size="xs" />
        </dd>

        <dt className="text-muted-foreground">File ID</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <EntityRef
            token="file"
            id={envelope.file_id}
            name={filenameHint ?? "Payroll export file"}
            showIcon={false}
            className="min-w-0 truncate font-mono text-foreground"
          />
          <CopyButton content={envelope.file_id} label="file ID" size="xs" />
        </dd>
      </dl>

      <p className="text-xs text-muted-foreground">
        The checksum identifies this exact file for good. The link above is
        durable and does not expire.
      </p>
    </div>
  );
}
