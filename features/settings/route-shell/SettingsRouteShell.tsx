"use client";

import React from "react";
import { Panel, type Layout } from "react-resizable-panels";
import { Check, Loader2 } from "lucide-react";
import { ClientGroup } from "@/app/(ssr)/demos/ssr/resizables/_lib/ClientGroup";
import { Handle } from "@/app/(ssr)/demos/ssr/resizables/_lib/Handle";
import { RegisteredPanel } from "@/app/(ssr)/demos/ssr/resizables/_lib/RegisteredPanel";
import { PanelControlProvider } from "@/app/(ssr)/demos/ssr/resizables/_lib/PanelControlProvider";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { SettingsRouteSidebar } from "./SettingsRouteSidebar";
import { SETTINGS_BASE } from "./routing";

const GROUP_ID = "settings";
const GROUP_KEY = "root";

interface Props {
  defaultLayout?: Layout;
  cookieName: string;
  children: React.ReactNode;
}

/**
 * Persistent shell for `/settings/*`. Same shape as
 * `AgentConnectionsRouteShell`:
 *   ┌──────────────┬───────────────────────────────────────┐
 *   │ Sidebar      │ Active tab (children)                 │
 *   │ (collapsible)│                                       │
 *   └──────────────┴───────────────────────────────────────┘
 *   │ Auto-saved · synced across your devices               │
 *
 * The tree-style sidebar and footer status replace what the live
 * `SettingsShell` overlay provides in its WindowPanel chrome.
 */
export function SettingsRouteShell({
  defaultLayout,
  cookieName,
  children,
}: Props) {
  return (
    <PanelControlProvider>
      <ClientGroup
        id={GROUP_ID}
        groupKey={GROUP_KEY}
        cookieName={cookieName}
        orientation="horizontal"
        defaultLayout={defaultLayout}
        className="h-full w-full"
      >
        <RegisteredPanel
          registerAs="sidebar"
          groupKey={GROUP_KEY}
          id="sidebar"
          collapsible
          collapsedSize="0%"
          defaultSize="20%"
          minSize="10%"
        >
          <div className="h-full overflow-hidden pt-[var(--shell-header-h)] bg-muted/10 border-r border-border">
            <SettingsRouteSidebar basePath={SETTINGS_BASE} />
          </div>
        </RegisteredPanel>
        <Handle hideWhenCollapsed={["sidebar"]} />
        <Panel id="main" minSize="40%">
          <div className="h-full overflow-hidden pt-[var(--shell-header-h)] flex flex-col">
            <div className="flex-1 min-h-0">{children}</div>
            <SaveStatusFooter />
          </div>
        </Panel>
      </ClientGroup>
    </PanelControlProvider>
  );
}

function SaveStatusFooter() {
  const isSaving = useAppSelector(
    (s: RootState) => s.userPreferences._meta?.isLoading ?? false,
  );
  return (
    <div className="shrink-0 border-t border-border/50 px-4 py-2.5 flex items-center justify-between">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        {isSaving ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <Check className="h-3 w-3 text-emerald-500" />
            Auto-saved · synced across your devices
          </>
        )}
      </span>
    </div>
  );
}

export default SettingsRouteShell;
