"use client";

// features/applets/browse/useAppletRowActions.tsx
//
// The ONE action list for an Applet row — the kebab, the phone card and the
// right-click menu all read this builder. It replaces the card's ten icon
// buttons. The Applet's own pages (Run / Code / Versions / Settings) are the
// record page's modes, so the row opens the record and does not repeat them.
// Archive is a soft delete; an archived row offers Restore in place.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, ExternalLink, Hammer, Link as LinkIcon, Play, Settings2 } from "lucide-react";
import { useClipboard } from "@ai-matrx/kit/clipboard";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";
import { useAppDispatch } from "@/lib/redux/hooks";
import { deleteApp } from "@/features/agents/redux/applets/thunks";
import type { EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import { toastAppletArchived } from "@/features/applets/lib/archive-undo";
import { appletRowHref, appletManageHref, forgetAppletListReads, restoreApplet, type AppletListRow } from "./service";

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The sentence the archive confirm says before anything happens. Exported for tests. */
export function archiveAppletSentence(row: Pick<AppletListRow, "name">): string {
  return archiveConfirmSentence(`"${row.name}"`, { restoreFrom: "list_filters" });
}

async function duplicateApplet(id: string): Promise<void> {
  const organizationId = await ensureOrgId(null);
  const res = await fetch(`/api/applets/${id}/duplicate`, {
    method: "POST",
    headers: applyOrganizationContextHeader({}, organizationId),
  });
  if (res.ok) return;
  let reason = `The copy was refused (${res.status}).`;
  const payload = (await res.json().catch(() => null)) as { error?: string; details?: { message?: string } } | null;
  if (payload?.details?.message) reason = payload.details.message;
  else if (payload?.error) reason = payload.error;
  throw new Error(reason);
}

export function useAppletRowActions(list: EntityListController<AppletListRow>): EntityRowActionsResult<AppletListRow> {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [, startTransition] = useTransition();
  const { copyText } = useClipboard({
    notify: (text, kind) => (kind === "error" ? toast.error(text) : toast.success(text)),
  });

  const open = (row: AppletListRow) => {
    if (row.archived) return;
    startTransition(() => router.push(appletRowHref(row)));
  };

  const archive = async (row: AppletListRow) => {
    const ok = await confirm({
      title: `Archive "${row.name}"?`,
      description: archiveAppletSentence(row),
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await dispatch(deleteApp(row.id)).unwrap();
      list.removeRow(row.id);
      forgetAppletListReads();
      list.refresh();
      toastAppletArchived(row.id, row.name, { onRestored: () => list.refresh() });
    } catch (error) {
      toast.error(message(error, "The Applet could not be archived. Try again."));
    }
  };

  const restore = async (row: AppletListRow) => {
    try {
      await restoreApplet(row.id);
      forgetAppletListReads();
      list.refresh();
      toast.success(`Restored "${row.name}"`);
    } catch (error) {
      toast.error(message(error, "The Applet could not be restored. Try again."));
    }
  };

  const menuFor = (row: AppletListRow) => (): ItemMenuConfig => {
    if (row.archived) {
      return {
        header: { title: row.name },
        sections: [
          {
            id: "manage",
            items: row.is_mine
              ? [{ id: "restore", label: "Restore", icon: ArchiveRestore, onSelect: () => void restore(row) }]
              : [{ id: "restore", label: "Restore", icon: ArchiveRestore, disabled: true, description: "Only its maker can restore it", onSelect: () => undefined }],
          },
        ],
      };
    }
    const href = appletRowHref(row);
    const appletHref = `/applets/${row.slug}`;
    return {
      header: { title: row.name },
      sections: [
        {
          id: "open",
          // Every row says where it goes (audit L7): a built Applet's own page is "Manage" (its maker) or
          // "Details" (anyone else) — the /applets/manage page was unreachable from this menu — a build
          // still open is "Continue building", and "Use the Applet" opens the running Applet itself.
          items: [
            row.build_open || row.unbuilt
              ? { id: "open", label: "Continue building", icon: Hammer, kind: "link" as const, href }
              : { id: "open", label: row.is_mine ? "Manage" : "Details", icon: Settings2, kind: "link" as const, href: appletManageHref(row) },
            { id: "open-tab", label: "Open in new tab", icon: ExternalLink, kind: "link", href, target: "_blank" },
            ...(row.unbuilt
              ? []
              : [{ id: "run", label: "Use the Applet", icon: Play, kind: "link" as const, href: appletHref, target: "_blank" as const }]),
          ],
        },
        {
          id: "manage",
          label: "Manage",
          items: [
            {
              id: "copy-link",
              label: "Copy link",
              icon: LinkIcon,
              onSelect: () => {
                void copyText(`${window.location.origin}${appletHref}`, "Link copied.", "The link could not be copied.");
              },
            },
            {
              id: "duplicate",
              label: "Make a copy",
              icon: Copy,
              onSelect: async () => {
                try {
                  await duplicateApplet(row.id);
                  forgetAppletListReads();
                  list.refresh();
                } catch (error) {
                  throw new Error(message(error, "The copy failed. Try again."));
                }
              },
              toast: { loading: "Copying…", success: "Copied", error: (e) => message(e, "Copy failed") },
            },
          ],
        },
        ...(row.is_mine
          ? [
              {
                id: "danger",
                label: "Danger",
                items: [
                  {
                    id: "archive",
                    label: "Archive",
                    icon: Archive,
                    tone: "destructive" as const,
                    onSelect: () => {
                      void archive(row);
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
  };

  return { actions: { menuFor, onOpenRow: open } };
}
