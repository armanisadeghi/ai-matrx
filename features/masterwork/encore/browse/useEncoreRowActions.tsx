"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Link2, Play, Rocket, Undo2 } from "lucide-react";
import { toast } from "@/lib/toast";
import type { ItemMenuConfig, ItemMenuEntry } from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { setMasterworkReleased } from "../../service";
import { invalidateEncoreRows } from "./service";
import type { EncoreListRow } from "./types";
import { masterworkHref } from "../../masterworkDoors";

/**
 * Encore row actions.
 *
 * 🚨 A DRAFT ON YOUR OWN SHELF IS ONE CLICK FROM RELEASED. The shelf now
 * carries the Expert's drafts (see ../service.ts § RELEASE GOVERNS OTHER
 * PEOPLE'S SHELVES), so the control that changes that state has to be HERE —
 * sending someone three clicks away into the Studio to find a toggle they
 * never knew existed is exactly how two built Masterworks stayed invisible.
 * Same call, same guarded compare-and-swap as the Studio's own toggle.
 */
export function useEncoreRowActions(
  list: EntityListController<EncoreListRow>,
): EntityRowActionsResult<EncoreListRow> {
  const router = useRouter();
  const doorHref = (row: EncoreListRow) => masterworkHref(row.id);

  const toggleReleased = useCallback(
    async (row: EncoreListRow) => {
      const releasing = row.released_at === null;
      try {
        const updated = await setMasterworkReleased({
          masterworkId: row.id,
          expectedVersion: row.version,
          released: releasing,
        });
        invalidateEncoreRows();
        list.patchRow(row.id, {
          released_at: updated.released_at,
          version: updated.version,
          updated_at: updated.updated_at,
        } as Partial<EncoreListRow>);
        list.refresh();
        toast.success(
          releasing
            ? "Released — anyone you share it with can run it now."
            : "Back to draft — only you can see it now.",
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not change the release.",
        );
      }
    },
    [list],
  );

  const menuFor = useCallback(
    (row: EncoreListRow) => (): ItemMenuConfig => {
      const openItems: ItemMenuEntry[] = [
        {
          id: "run",
          label: "Run",
          icon: Play,
          kind: "link",
          href: doorHref(row),
        },
      ];
      if (row.rulebook) {
        openItems.push({
          id: "rulebook",
          label: "Open Rulebook",
          icon: BookOpen,
          kind: "link",
          href: `/masterwork/${row.rulebook.id}`,
        });
      }
      const sections: ItemMenuConfig["sections"] = [
        { id: "open", items: openItems },
      ];
      // Only your own shelf carries the release control — the `orgs` and
      // `public` shelves are other people's released work, and a control that
      // would refuse under RLS is worse than no control at all.
      if (row.scope === "mine") {
        sections.push({
          id: "release",
          items: [
            row.released_at === null
              ? {
                  id: "release",
                  label: "Release it",
                  icon: Rocket,
                  onSelect: () => void toggleReleased(row),
                }
              : {
                  id: "unrelease",
                  label: "Back to draft",
                  icon: Undo2,
                  onSelect: () => void toggleReleased(row),
                },
          ],
        });
      }
      sections.push({
        id: "copy",
        items: [
          {
            id: "copy-link",
            label: "Copy link",
            icon: Link2,
            onSelect: () => {
              void navigator.clipboard.writeText(
                `${window.location.origin}${doorHref(row)}`,
              );
              toast.success("Link copied");
            },
          },
        ],
      });
      return { sections };
    },
    [toggleReleased],
  );

  const onOpenRow = useCallback(
    (row: EncoreListRow) => router.push(doorHref(row)),
    [router],
  );

  return { actions: { menuFor, onOpenRow } };
}
