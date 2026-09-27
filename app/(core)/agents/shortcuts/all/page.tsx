"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { SettingsTapButton } from "@ai-matrx/tap-target/buttons";
import { ShortcutDirectory } from "@/features/agent-shortcuts/components/ShortcutDirectory";

export default function UserAllShortcutsPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <RouteHeader
        left={
          <>
            <h1 className="text-sm font-medium text-foreground truncate">
              All Shortcuts
            </h1>
          </>
        }
        right={
          <>
            <SettingsTapButton
              href="/agents/shortcuts"
              ariaLabel="Manage my shortcuts"
              tooltip="Manage my shortcuts"
            />
          </>
        }
      />

      <div className="flex-1 min-h-0 pt-[var(--shell-header-h)]">
        <ShortcutDirectory mode="user" title="All Shortcuts" hideTitleBar />
      </div>
    </div>
  );
}
