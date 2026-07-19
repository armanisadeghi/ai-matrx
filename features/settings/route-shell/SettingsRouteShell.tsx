"use client";

import React from "react";
import { Panel, type Layout } from "react-resizable-panels";
import { Check, Loader2, ListTree } from "lucide-react";
import { ClientGroup } from "@/app/(dev)/demos/resizables/_lib/ClientGroup";
import { Handle } from "@/app/(dev)/demos/resizables/_lib/Handle";
import { RegisteredPanel } from "@/app/(dev)/demos/resizables/_lib/RegisteredPanel";
import { PanelControlProvider } from "@/app/(dev)/demos/resizables/_lib/PanelControlProvider";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MobilePanelShell } from "@/features/shell/components/header/templates/MobilePanelShell";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { SettingsRouteSidebar } from "./SettingsRouteSidebar";
import { SettingsHeaderControls } from "./SettingsHeaderControls";
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
 *
 * Mobile (< md): the resizable sidebar+main split is replaced via
 * `MobilePanelShell` — `main` becomes the active settings panel as one
 * full-height scrolling column, and the sections tree moves into a bottom
 * drawer reachable from a single tap target in the shell header. Desktop
 * renders the `ClientGroup` layout below byte-identical to before.
 */
export function SettingsRouteShell({
  defaultLayout,
  cookieName,
  children,
}: Props) {
  const desktopLayout = (
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
  );

  return (
    <PanelControlProvider>
      <PageHeader>
        <SettingsHeaderControls />
      </PageHeader>
      <MobilePanelShell
        desktop={desktopLayout}
        main={
          <div className="pt-[var(--shell-header-h)] pb-safe">
            {children}
            <SaveStatusFooter />
          </div>
        }
        panels={[
          {
            id: "sections",
            label: "Sections",
            icon: ListTree,
            content: <SettingsRouteSidebar basePath={SETTINGS_BASE} />,
          },
        ]}
      />
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
