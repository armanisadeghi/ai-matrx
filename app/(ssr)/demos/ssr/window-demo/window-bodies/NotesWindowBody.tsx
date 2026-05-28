"use client";

import { NotesView } from "@/features/notes/components/NotesView";

export function NotesWindowBody() {
  return (
    <NotesView
      config={{ showSidebar: false, showTabs: false }}
      className="h-full"
    />
  );
}
