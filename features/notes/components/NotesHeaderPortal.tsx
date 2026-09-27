"use client";

import { useEffect, useState, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";

interface NotesHeaderProps {
  onCreateNote: () => void;
  onCreateFolder: () => void;
  sortConfig: { field: string; order: "asc" | "desc" };
  onSortChange: (field: string, order: "asc" | "desc") => void;
}

/** Notes-only header — kept in its own module so notes routes
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
    <PageHeader>
      <NotesHeaderCompact {...props} />
    </PageHeader>
  );
}
