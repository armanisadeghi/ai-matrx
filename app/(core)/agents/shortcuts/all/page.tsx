"use client";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { SettingsTapButton } from "@/components/icons/tap-buttons";
import { ShortcutDirectory } from "@/features/agent-shortcuts/components/ShortcutDirectory";

export default function UserAllShortcutsPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0">
          <h1 className="text-sm font-medium text-foreground truncate">
            All Shortcuts
          </h1>
          <div className="ml-auto flex items-center">
            <SettingsTapButton
              href="/agents/shortcuts"
              ariaLabel="Manage my shortcuts"
              tooltip="Manage my shortcuts"
            />
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 pt-[var(--shell-header-h)]">
        <ShortcutDirectory mode="user" title="All Shortcuts" hideTitleBar />
      </div>
    </div>
  );
}
