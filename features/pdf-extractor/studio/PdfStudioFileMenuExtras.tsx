"use client";

/**
 * Studio-only actions injected into the canonical FileContextMenu when a
 * sidebar row is backed by a cloud file. Keeps the full files-route menu
 * and adds extractor-specific affordances on top.
 */

import { Link as LinkIcon, Archive } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";
import type { StudioDocSummary } from "./hooks/usePdfStudioDocs";

function resolveAbsoluteHref(href: string): string {
  if (typeof window === "undefined") return href;
  return `${window.location.origin}${href.startsWith("/") ? href : `/${href}`}`;
}

export interface PdfStudioFileMenuExtrasProps {
  doc: StudioDocSummary;
  onRemoveFromExtractor: (docId: string) => Promise<void>;
}

export function PdfStudioFileMenuExtras({
  doc,
  onRemoveFromExtractor,
}: PdfStudioFileMenuExtrasProps) {
  const studioHref = `/tools/pdf-extractor/${doc.id}`;

  return (
    <>
      <DropdownMenuItem
        onClick={() => {
          void (async () => {
            try {
              await navigator.clipboard.writeText(
                resolveAbsoluteHref(studioHref),
              );
              toast.success("Extractor link copied");
            } catch {
              toast.error(
                "Couldn't copy — your browser blocked clipboard access",
              );
            }
          })();
        }}
      >
        <LinkIcon className="mr-2 h-4 w-4" />
        Copy extractor link
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onClick={() => {
          void (async () => {
            const ok = await confirm({
              title: "Remove from extractor",
              description: (
                <>
                  Hide <b>{doc.name}</b> from the PDF Extractor. The cloud file
                  stays — only this processed document is archived.
                </>
              ),
              confirmLabel: "Remove",
              variant: "destructive",
            });
            if (!ok) return;
            try {
              await onRemoveFromExtractor(doc.id);
              toast.success("Removed from extractor");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Remove failed");
            }
          })();
        }}
      >
        <Archive className="mr-2 h-4 w-4" />
        Remove from extractor
      </DropdownMenuItem>
    </>
  );
}
