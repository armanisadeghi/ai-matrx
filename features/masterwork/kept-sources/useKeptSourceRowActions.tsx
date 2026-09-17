"use client";

// features/masterwork/kept-sources/useKeptSourceRowActions.tsx
//
// Row actions for one kept source.
//
// Deliberately READ-ONLY. A kept source is the Expert's own words as they were
// captured, and the rules already cite it — a "delete" here would silently
// break the provenance of every rule pointing at it, and re-capturing is what
// the capture lanes are for. Nothing on this menu changes a stored record.

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, ExternalLink, FileText } from "lucide-react";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import type { KeptSourceRow } from "./types";

function readerHref(row: KeptSourceRow): string {
  return `/masterwork/${row.rulebook_id}/sources/kept/${encodeURIComponent(
    row.source_key,
  )}`;
}

export function useKeptSourceRowActions(
  _list: EntityListController<KeptSourceRow>,
): EntityRowActionsResult<KeptSourceRow> {
  const router = useRouter();

  const menuFor = useCallback(
    (row: KeptSourceRow) => (): ItemMenuConfig => ({
      sections: [
        {
          id: "open",
          items: [
            {
              id: "read",
              label: "Read the material",
              icon: Eye,
              kind: "link",
              href: readerHref(row),
            },
            // The origin, when there is one. Absent for a paste or a played
            // card, which have no home anywhere else — that is WHY this table
            // stores their words rather than a pointer.
            ...(row.file_id
              ? [
                  {
                    id: "file",
                    label: "Open the file",
                    icon: FileText,
                    kind: "link" as const,
                    href: `/files/f/${row.file_id}`,
                  },
                ]
              : []),
            ...(row.url
              ? [
                  {
                    id: "url",
                    label: "Open the original",
                    icon: ExternalLink,
                    kind: "link" as const,
                    href: row.url,
                  },
                ]
              : []),
          ],
        },
      ],
    }),
    [],
  );

  const onOpenRow = useCallback(
    (row: KeptSourceRow) => router.push(readerHref(row)),
    [router],
  );

  return { actions: { menuFor, onOpenRow } };
}
