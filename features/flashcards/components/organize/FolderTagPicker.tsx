"use client";

// features/flashcards/components/organize/FolderTagPicker.tsx
//
// Folders/tags for flashcard sets — a `platform.categories` row under the
// `flashcard-folder` dimension, attached via a `theme` edge (fc_set →
// category). Folders and tags are the SAME primitive; the only difference
// from Quizlet's two concepts is navigational, not structural.
//
// The picker UI is the generic CategoryTagPicker (features/scopes) — this file
// keeps only the flashcard binding (dimension + edge role) and the derived
// folder-ids hook.

import { FolderPlus } from "lucide-react";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { CategoryTagPicker } from "@/features/scopes/components/CategoryTagPicker";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { EDGE_ROLE } from "@/features/flashcards/data/types";

const DIMENSION = CATEGORY_DIMENSIONS.flashcardFolder;

/** The set's currently-attached folder/tag category ids, derived from its edges. */
export function useSetFolderIds(setId: string | null): {
  folderIds: string[];
  loading: boolean;
} {
  const { edges, status } = useAssociations({ type: "fc_set", id: setId });
  const folderIds = edges
    .filter(
      (e) =>
        e.direction === "outgoing" &&
        e.otherType === "category" &&
        e.role === EDGE_ROLE.theme,
    )
    .map((e) => e.otherId);
  return { folderIds, loading: status === "loading" || status === "idle" };
}

/**
 * Multi-select combobox: pick existing folders/tags for one flashcard set, or
 * create a new one inline. Fully self-contained — mount it once per set (edit
 * page) and it reads/writes the theme edges itself.
 */
export function FolderTagPicker({ setId }: { setId: string }) {
  return (
    <CategoryTagPicker
      entityType="fc_set"
      entityId={setId}
      dimension={DIMENSION}
      edgeRole={EDGE_ROLE.theme}
      addLabel="Add folder / tag"
      icon={FolderPlus}
      emptyText="No folders yet."
    />
  );
}
