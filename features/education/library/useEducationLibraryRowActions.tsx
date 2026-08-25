"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, GraduationCap } from "lucide-react";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { educationLibraryHref, type EducationLibraryRow } from "./types";

/**
 * The row menu, as a plain function of the row.
 *
 * Pulled out of the hook so surfaces that render library cards WITHOUT an
 * `EntityListController` — the Education home's "Recently created" block — get
 * the identical menu instead of forking a second one. A deck must offer the
 * same actions wherever the learner meets it; two menus for one object is the
 * bug this shape prevents.
 */
export function educationLibraryMenuFor(
  row: EducationLibraryRow,
): () => ItemMenuConfig {
  return (): ItemMenuConfig => {
    const href = educationLibraryHref(row);
    return {
      sections: [
        {
          id: "open",
          items: [
            { id: "open", label: "Open", icon: Eye, kind: "link", href },
            ...(row.kind === "fc_set"
              ? [
                  {
                    id: "study",
                    label: "Study",
                    icon: GraduationCap,
                    kind: "link" as const,
                    href: `/education/flashcards/${row.id}/study`,
                  },
                ]
              : []),
          ],
        },
      ],
    };
  };
}

export function useEducationLibraryRowActions(
  list: EntityListController<EducationLibraryRow>,
): EntityRowActionsResult<EducationLibraryRow> {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  void list;

  const menuFor = educationLibraryMenuFor;

  const onOpenRow = (row: EducationLibraryRow) => {
    if (isNavigating) return;
    startTransition(() => router.push(educationLibraryHref(row)));
  };

  return { actions: { menuFor, onOpenRow } };
}
