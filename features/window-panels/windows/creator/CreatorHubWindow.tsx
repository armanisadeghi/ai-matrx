/**
 * features/window-panels/windows/creator/CreatorHubWindow.tsx
 *
 * The Creator Hub — a global home for creator chrome, opened from the Crown in
 * the main sidebar. The creator analogue of the admin Bug indicator.
 *
 * Layout: a WindowPanel whose left sidebar is the tab list; each entry is a
 * tab page. The first page is creator Settings (incl. the creator-debug master
 * toggle); the Data page renders the arbitrary creator debug bag; the rest are
 * a faithful duplicate of the agent run page's CreatorRunPanel tab list,
 * rendered as placeholders (those tabs are conversation-scoped and wired later).
 */

"use client";

import { useState } from "react";
import {
  Settings,
  Database,
  Play,
  Layers,
  FileJson,
  ToyBrick,
  SlidersHorizontal,
  ScrollText,
  Activity,
  Brain,
  BarChart3,
  Gauge,
  Server,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import CreatorSettingsTab from "./tabs/CreatorSettingsTab";
import CreatorDataTab from "./tabs/CreatorDataTab";
import CreatorHubPlaceholder from "./tabs/CreatorHubPlaceholder";
import type { CreatorHubTabId } from "@/features/overlays/openers/creatorHub";

interface CreatorHubTabDef {
  id: CreatorHubTabId;
  label: string;
  icon: LucideIcon;
}

// Order: real tabs first (Settings, Data), then a duplicate of CreatorRunPanel's
// ALL_TABS. The run panel's "settings"/"Run" entry is id "run" here so the new
// creator Settings page can own id "settings".
const CREATOR_HUB_TABS: CreatorHubTabDef[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "data", label: "Data", icon: Database },
  { id: "actions", label: "Actions", icon: Play },
  { id: "context", label: "Context", icon: Layers },
  { id: "payload", label: "Payload", icon: FileJson },
  { id: "widget_invoker", label: "Widgets", icon: ToyBrick },
  { id: "run", label: "Run", icon: SlidersHorizontal },
  { id: "sysprompt", label: "System", icon: ScrollText },
  { id: "last", label: "Request", icon: Activity },
  { id: "model_context", label: "Model Context", icon: Brain },
  { id: "session", label: "Session", icon: BarChart3 },
  { id: "client", label: "Client", icon: Gauge },
  { id: "backend", label: "Backend", icon: Server },
];

export interface CreatorHubWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: CreatorHubTabId;
}

export default function CreatorHubWindow({
  isOpen,
  onClose,
  initialTab = "settings",
}: CreatorHubWindowProps) {
  const [activeTab, setActiveTab] = useState<CreatorHubTabId>(initialTab);

  if (!isOpen) return null;

  const active =
    CREATOR_HUB_TABS.find((t) => t.id === activeTab) ?? CREATOR_HUB_TABS[0];

  const sidebar = (
    <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-2">
      {CREATOR_HUB_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <WindowPanel
      title="Creator Hub"
      width={760}
      height={620}
      minWidth={520}
      minHeight={420}
      urlSyncKey="creator_hub"
      overlayId="creatorHub"
      onClose={onClose}
      sidebar={sidebar}
      sidebarDefaultSize={190}
      sidebarMinSize={150}
      onCollectData={() => ({ activeTab })}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-background">
        {activeTab === "settings" ? (
          <CreatorSettingsTab />
        ) : activeTab === "data" ? (
          <CreatorDataTab />
        ) : (
          <CreatorHubPlaceholder label={active.label} />
        )}
      </div>
    </WindowPanel>
  );
}
