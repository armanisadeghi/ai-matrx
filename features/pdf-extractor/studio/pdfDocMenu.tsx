/**
 * buildPdfDocMenu — the `ItemMenuConfig` for a studio document row.
 *
 * Consumed by the sidebar `DocRow` (kebab + right-click) so a project manager
 * can open, copy a link to, or delete a document without leaving the list.
 * Mirrors the chat sidebar's conversation menu pattern (Open / Copy link /
 * Delete) but scoped to `processed_documents`.
 *
 * Delete archives the row (soft-delete) via the host-provided `onDelete`,
 * which owns the optimistic list update + any active-doc cleanup.
 */

import { ExternalLink, Link as LinkIcon, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";
import type { StudioDocSummary } from "./hooks/usePdfStudioDocs";

function resolveAbsoluteHref(href: string): string {
  if (typeof window === "undefined") return href;
  return `${window.location.origin}${href.startsWith("/") ? href : `/${href}`}`;
}

/** A browser-openable source URL for the doc, or null if not viewable. */
export function docSourceHref(doc: StudioDocSummary): string | null {
  if (doc.sourceKind === "cld_file" && doc.sourceId) {
    return `/files/f/${doc.sourceId}`;
  }
  const src = doc.source?.trim();
  if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
    return src;
  }
  return null;
}

export interface PdfDocMenuContext {
  doc: StudioDocSummary;
  /** Archive (soft-delete) the doc. Owns optimistic update + active cleanup. */
  onDelete: (id: string) => Promise<void>;
}

export function buildPdfDocMenu(ctx: PdfDocMenuContext): ItemMenuConfig {
  const { doc } = ctx;
  const studioHref = `/tools/pdf-extractor/${doc.id}`;
  const sourceHref = docSourceHref(doc);

  return {
    header: { title: doc.name },
    sections: [
      {
        id: "actions",
        items: [
          {
            id: "open-new-tab",
            kind: "link",
            label: "Open in new tab",
            icon: ExternalLink,
            href: studioHref,
            target: "_blank",
          },
          {
            id: "open-source",
            kind: "link",
            label: "Open original file",
            icon: FileText,
            href: sourceHref ?? studioHref,
            target: "_blank",
            hidden: !sourceHref,
          },
          {
            id: "copy-link",
            label: "Copy link",
            icon: LinkIcon,
            onSelect: async () => {
              try {
                await navigator.clipboard.writeText(
                  resolveAbsoluteHref(studioHref),
                );
                toast.success("Link copied");
              } catch {
                toast.error(
                  "Couldn't copy — your browser blocked clipboard access",
                );
              }
            },
          },
        ],
      },
      {
        id: "danger",
        items: [
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            tone: "destructive",
            onSelect: async () => {
              const ok = await confirm({
                title: "Delete document",
                description: (
                  <>
                    Remove <b>{doc.name}</b> from the studio. This archives the
                    document — its extracted text and pages are kept in the
                    database for recovery, but it disappears from every list.
                  </>
                ),
                confirmLabel: "Delete",
                variant: "destructive",
              });
              if (!ok) return;
              try {
                await ctx.onDelete(doc.id);
                toast.success("Document deleted");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Delete failed",
                );
              }
            },
          },
        ],
      },
    ],
  };
}
