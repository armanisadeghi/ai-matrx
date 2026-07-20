"use client";

/**
 * AgentShortcutQuickCreateWindow
 *
 * Floating window that wraps `ShortcutQuickCreateBody`. Lets the user create
 * a shortcut pointing at a specific agent (or link an existing one) without
 * leaving the agent they were working on.
 *
 * This replaces the previous `AgentAdminShortcutWindow` placeholder. Both
 * the overlay id (`agentAdminShortcutWindow`) and the registry slug
 * (`agent-admin-shortcut-window`) are preserved so existing dispatchers
 * (`openAgentAdminShortcutWindow`) and the menu wiring continue to work.
 *
 * Layout uses the full capabilities of `WindowPanel`:
 *   - `sidebar`     → vertical tab navigation (resized via v4 resizable panel)
 *   - `footerLeft`  → scope toggle + inline save errors
 *   - `footerRight` → Cancel + Save
 *   - `actionsRight`→ Reset to defaults
 *
 * All form state + save/link/reset logic lives in `useShortcutQuickCreate`,
 * so the window shell and the body can't drift out of sync.
 */

import { useCallback, useState } from "react";
import {
  AlertCircle,
  Globe,
  Layers,
  Link as LinkIcon,
  Loader2,
  RotateCcw,
  Settings2,
  Sliders,
  Flame,
  User as UserIcon,
  Variable,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentComingSoonContent } from "@/features/agents/components/coming-soon/AgentComingSoonContent";
import { ShortcutQuickCreateBody } from "@/features/agent-shortcuts/components/ShortcutQuickCreateBody";
import {
  isQuickCreateTab,
  useShortcutQuickCreate,
  type QuickCreateTab,
  type ShortcutQuickCreateState,
} from "@/features/agent-shortcuts/hooks/useShortcutQuickCreate";

interface AgentShortcutQuickCreateWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
  /** Initial tab supplied by the opener's overlay data. */
  initialActiveTab?: QuickCreateTab;
}

const WINDOW_ID = "agent-admin-shortcut-window";
const OVERLAY_ID = "agentAdminShortcutWindow";

function coerceTab(value: unknown): QuickCreateTab {
  return isQuickCreateTab(value) ? value : "essentials";
}

export default function AgentShortcutQuickCreateWindow({
  isOpen,
  onClose,
  agentId,
  initialActiveTab,
}: AgentShortcutQuickCreateWindowProps) {
  if (!isOpen) return null;
  return (
    <AgentShortcutQuickCreateWindowInner
      onClose={onClose}
      agentId={agentId ?? null}
      initialActiveTab={coerceTab(initialActiveTab)}
    />
  );
}

function AgentShortcutQuickCreateWindowInner({
  onClose,
  agentId,
  initialActiveTab,
}: {
  onClose: () => void;
  agentId: string | null;
  initialActiveTab: QuickCreateTab;
}) {
  // No agent id means the window was opened in an invalid state (e.g. from a
  // stale URL hydrator). Render a clear placeholder instead of crashing.
  if (!agentId) {
    return (
      <WindowPanel
        id={WINDOW_ID}
        title="Create Shortcut"
        onClose={onClose}
        width={520}
        height={360}
        minWidth={420}
        minHeight={300}
        overlayId={OVERLAY_ID}
      >
        <AgentComingSoonContent
          icon={LinkIcon}
          title="No agent selected"
          description="Open this window from an agent's actions menu to create or link a shortcut."
          agentId={null}
        />
      </WindowPanel>
    );
  }

  return (
    <AgentShortcutQuickCreateWindowWithAgent
      onClose={onClose}
      agentId={agentId}
      initialActiveTab={initialActiveTab}
    />
  );
}

function AgentShortcutQuickCreateWindowWithAgent({
  onClose,
  agentId,
  initialActiveTab,
}: {
  onClose: () => void;
  agentId: string;
  initialActiveTab: QuickCreateTab;
}) {
  const [activeTab, setActiveTab] = useState<QuickCreateTab>(initialActiveTab);

  const state = useShortcutQuickCreate({
    agentId,
    activeTab,
    onActiveTabChange: setActiveTab,
    onClose,
  });

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      agentId,
      activeTab,
    }),
    [agentId, activeTab],
  );

  return (
    <WindowPanel
      id={WINDOW_ID}
      title="Create Shortcut"
      onClose={onClose}
      width={760}
      height={640}
      minWidth={560}
      minHeight={460}
      overlayId={OVERLAY_ID}
      onCollectData={collectData}
      bodyClassName="p-0"
      sidebar={<TabSidebar state={state} />}
      sidebarDefaultSize={160}
      sidebarMinSize={130}
      sidebarClassName="bg-muted/30"
      actionsRight={<HeaderActions state={state} />}
      footerLeft={<FooterLeft state={state} />}
      footerRight={<FooterRight state={state} />}
    >
      <ShortcutQuickCreateBody state={state} />
    </WindowPanel>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sidebar — vertical tab navigation
// ───────────────────────────────────────────────────────────────────────────

const TAB_META: Record<
  QuickCreateTab,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    hint: string;
  }
> = {
  essentials: {
    label: "Essentials",
    icon: Flame,
    hint: "Category, icon, widget",
  },
  variables: {
    label: "Variables",
    icon: Variable,
    hint: "Defaults + scope mapping",
  },
  details: {
    label: "Details",
    icon: Settings2,
    hint: "Name, description, version",
  },
  advanced: {
    label: "Advanced",
    icon: Sliders,
    hint: "Keys, surfaces, behavior",
  },
  link: {
    label: "Link existing",
    icon: LinkIcon,
    hint: "Connect to an existing shortcut",
  },
  json: {
    label: "JSON",
    icon: Layers,
    hint: "Raw payload",
  },
};

const TAB_ORDER: QuickCreateTab[] = [
  "essentials",
  "variables",
  "details",
  "advanced",
  "link",
  "json",
];

function TabSidebar({ state }: { state: ShortcutQuickCreateState }) {
  const { activeTab, onActiveTabChange } = state;
  return (
    <nav className="flex flex-col gap-0.5 px-1.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium px-2 pb-1">
        Sections
      </div>
      {TAB_ORDER.map((tab) => {
        const meta = TAB_META[tab];
        const Icon = meta.icon;
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onActiveTabChange(tab)}
            className={cn(
              "group w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors",
              "flex items-start gap-2",
              isActive
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 mt-0.5 shrink-0",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block font-medium truncate",
                  isActive ? "text-foreground" : "",
                )}
              >
                {meta.label}
              </span>
              <span className="block text-[10px] text-muted-foreground/80 truncate">
                {meta.hint}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Header actions (right)
// ───────────────────────────────────────────────────────────────────────────

function HeaderActions({ state }: { state: ShortcutQuickCreateState }) {
  return (
    <button
      type="button"
      onClick={state.resetToDefaults}
      disabled={state.isSaving}
      title="Reset all fields to defaults"
      className={cn(
        "inline-flex items-center gap-1 px-1.5 h-5 text-[11px] rounded",
        "text-muted-foreground hover:text-foreground hover:bg-accent",
        "disabled:opacity-40 disabled:pointer-events-none",
      )}
    >
      <RotateCcw className="h-3 w-3" />
      Reset
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Footer left — scope indicator + scope toggle (admin) + inline errors
// ───────────────────────────────────────────────────────────────────────────

function FooterLeft({ state }: { state: ShortcutQuickCreateState }) {
  const { scope, setScope, isAdmin, error, isSaving } = state;
  const isGlobal = scope === "global";
  return (
    <div className="flex items-center gap-2 min-w-0">
      {error ? (
        <div className="flex items-center gap-1 text-destructive min-w-0">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[260px]">{error}</span>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {isGlobal ? (
            <>
              <Globe className="h-3 w-3" />
              Global
            </>
          ) : (
            <>
              <UserIcon className="h-3 w-3" />
              Personal
            </>
          )}
        </span>
      )}
      {isAdmin && (
        <div className="inline-flex items-center gap-1 pl-1 border-l border-border/60">
          <Label
            htmlFor="qc-scope-toggle"
            className="text-[11px] font-normal cursor-pointer inline-flex items-center gap-1"
          >
            <Globe className="h-3 w-3" />
            Global
          </Label>
          <Switch
            id="qc-scope-toggle"
            checked={isGlobal}
            onCheckedChange={(next) => setScope(next ? "global" : "user")}
            disabled={isSaving}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Footer right — Cancel + Save
// ───────────────────────────────────────────────────────────────────────────

function FooterRight({ state }: { state: ShortcutQuickCreateState }) {
  const { handlePrimary, primaryLabel, primaryDisabled, isSaving, onClose } =
    state;
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        disabled={isSaving}
        className="h-5 px-2 text-xs"
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={handlePrimary}
        disabled={primaryDisabled}
        className="h-5 px-2.5 text-xs"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Saving…
          </>
        ) : (
          primaryLabel
        )}
      </Button>
    </div>
  );
}
