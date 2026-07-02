"use client";

import { ShortcutDirectory } from "@/features/agent-shortcuts/components/ShortcutDirectory";

export default function AdminAllShortcutsPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <ShortcutDirectory
        mode="admin"
        title="All Shortcuts"
        manageHref="/administration/system-agents/shortcuts"
        manageLabel="Manage global shortcuts"
      />
    </div>
  );
}
