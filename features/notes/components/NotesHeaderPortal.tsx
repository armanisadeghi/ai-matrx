"use client";

import { useEffect, useState, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";

interface NotesHeaderProps {
  onCreateNote: () => void;
  onCreateFolder: () => void;
  sortConfig: { field: string; order: "asc" | "desc" };
  onSortChange: (field: string, order: "asc" | "desc") => void;
}

/** Notes-only header portal — kept out of PageSpecificHeader.tsx so notes routes
 *  do not pull the prompts builder header graph into unrelated overlays. */
export function NotesHeader(props: NotesHeaderProps) {
  const pathname = usePathname();
  const [NotesHeaderCompact, setNotesHeaderCompact] =
    useState<ComponentType<NotesHeaderProps> | null>(null);

  useEffect(() => {
    if (!pathname?.includes("/notes")) return;
    import("@/features/notes/components/NotesHeaderCompact").then((module) => {
      setNotesHeaderCompact(() => module.NotesHeaderCompact);
    });
  }, [pathname]);

  if (!pathname?.includes("/notes") || !NotesHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <NotesHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}
