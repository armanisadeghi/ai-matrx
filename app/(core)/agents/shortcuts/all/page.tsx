"use client";

import { ShortcutDirectory } from "@/features/agent-shortcuts/components/ShortcutDirectory";

export default function UserAllShortcutsPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <ShortcutDirectory
        mode="user"
        title="All Shortcuts"
        manageHref="/agents/shortcuts"
        manageLabel="Manage my shortcuts"
      />
    </div>
  );
}
