"use client";

import { useRouter } from "next/navigation";
import {
  ClipboardCopy,
  Eye,
  FileJson,
  FlaskConical,
  Link2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import {
  shapeDetailHref,
  shapeSchemaHref,
  shapeTestHref,
} from "@/features/content-ir/studio/constants";
import type { ShapeBrowseRow } from "./types";

export function useShapeRowActions(
  list: EntityListController<ShapeBrowseRow>,
): EntityRowActionsResult<ShapeBrowseRow> {
  const router = useRouter();

  const menuFor = (row: ShapeBrowseRow) => (): ItemMenuConfig => {
    const href = shapeDetailHref(row.kind);
    return {
      header: { title: row.label, description: row.kind },
      sections: [
        {
          id: "open",
          items: [
            {
              id: "preview",
              label: "Open preview",
              icon: Eye,
              kind: "link",
              href,
            },
            {
              id: "test",
              label: "Test shape",
              icon: FlaskConical,
              kind: "link",
              href: shapeTestHref(row.kind),
            },
            {
              id: "schema",
              label: "View schema",
              icon: FileJson,
              kind: "link",
              href: shapeSchemaHref(row.kind),
            },
          ],
        },
        {
          id: "copy",
          items: [
            {
              id: "copy-link",
              label: "Copy link",
              icon: Link2,
              onSelect: async () => {
                await navigator.clipboard.writeText(
                  `${window.location.origin}${href}`,
                );
                toast.success("Shape link copied");
              },
            },
            {
              id: "copy-reference",
              label: "Copy reference",
              icon: ClipboardCopy,
              onSelect: async () => {
                await navigator.clipboard.writeText(
                  buildRecordReferenceFence({
                    type: "content_ir_kind",
                    id: row.id,
                    label: row.label,
                  }),
                );
                toast.success("Shape reference copied");
              },
            },
          ],
        },
      ],
    };
  };

  void list;
  return {
    actions: {
      menuFor,
      onOpenRow: (row) => router.push(shapeDetailHref(row.kind)),
    },
  };
}
