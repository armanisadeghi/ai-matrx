"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Link2, Play } from "lucide-react";
import { toast } from "@/lib/toast";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import type { EncoreListRow } from "./types";

export function useEncoreRowActions(
  _list: EntityListController<EncoreListRow>,
): EntityRowActionsResult<EncoreListRow> {
  const router = useRouter();
  const runHref = (row: EncoreListRow) => `/masterwork/encore/${row.id}`;

  const menuFor = useCallback(
    (row: EncoreListRow) => (): ItemMenuConfig => ({
      sections: [
        {
          id: "open",
          items: [
            {
              id: "run",
              label: "Run",
              icon: Play,
              kind: "link",
              href: runHref(row),
            },
            ...(row.rulebook
              ? [
                  {
                    id: "rulebook",
                    label: "Open Rulebook",
                    icon: BookOpen,
                    kind: "link" as const,
                    href: `/masterwork/${row.rulebook.id}`,
                  },
                ]
              : []),
          ],
        },
        {
          id: "copy",
          items: [
            {
              id: "copy-link",
              label: "Copy link",
              icon: Link2,
              onSelect: () => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}${runHref(row)}`,
                );
                toast.success("Link copied");
              },
            },
          ],
        },
      ],
    }),
    [],
  );

  const onOpenRow = useCallback(
    (row: EncoreListRow) => router.push(runHref(row)),
    [router],
  );

  return { actions: { menuFor, onOpenRow } };
}
