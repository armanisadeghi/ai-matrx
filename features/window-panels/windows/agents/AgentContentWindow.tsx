"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  Settings,
  Cpu,
  Variable,
  Wrench,
  Layers,
  Info,
  Share2,
  RefreshCw,
  Save,
  X,
  Copy,
  Circle,
  Search,
  Play,
  GitBranch,
  Clock,
  Braces,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentDefinition,
  selectAgentIsDirty,
  selectAgentIsEditable,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  fetchFullAgent,
  initializeChatAgents,
  saveAgentField,
} from "@/features/agents/redux/agent-definition/thunks";
import { setAgentField } from "@/features/agents/redux/agent-definition/slice";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { toast } from "sonner";
import { makeSelectFilteredAgents } from "@/features/agents/redux/agent-consumers/selectors";
import { useAgentConsumer } from "@/features/agents/hooks/useAgentConsumer";
import { Messages } from "@/features/agents/components/builder/message-builders/Messages";
import { SystemMessage } from "@/features/agents/components/builder/message-builders/system-instructions/SystemMessage";
import { AgentVariablesPanel } from "@/features/agents/components/variables-management/AgentVariablesPanel";
import { AgentToolsManager } from "@/features/agents/components/tools-management/AgentToolsManager";
import { AgentContextSlotsManager } from "@/features/agents/components/context-slots-management/AgentContextSlotsManager";
import { AgentSettingsForm } from "@/features/agents/components/settings/AgentSettingsForm";
import { AgentSettingsCore } from "@/features/agents/components/settings-management/AgentSettingsCore";
import { AgentSharePanel } from "@/features/agents/components/sharing/AgentSharePanel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useMemo } from "react";
import { AgentRunWrapper } from "@/features/agents/components/smart/AgentRunWrapper";
import { AgentVersionDiffPage } from "@/features/agents/components/diff/AgentVersionDiffPage";
import { AgentContentHistoryPanel } from "./AgentContentHistoryPanel";
import { AgentContentTab } from "./agent-content.types";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import {
  AgentSidebar,
  AgentTabs,
} from "@/features/agents/components/settings/AgentSettingsWorkspace";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TabDefinition {
  id: AgentContentTab;
  label: string;
  icon: React.ElementType;
  /** When true, footer save/cancel controls are hidden (tab has inline saves) */
  inlineSave?: boolean;
}

export const ALL_TABS: TabDefinition[] = [
  { id: "overview", label: "Overview", icon: Info },
  {
    id: "system",
    label: "System Instructions",
    icon: Settings,
    inlineSave: true,
  },
  { id: "messages", label: "Messages", icon: MessageSquare, inlineSave: true },
  { id: "settings", label: "Settings", icon: Cpu },
  { id: "variables", label: "Variables", icon: Variable, inlineSave: true },
  { id: "tools", label: "Tools", icon: Wrench, inlineSave: true },
  { id: "context", label: "Context", icon: Layers, inlineSave: true },
  { id: "share", label: "Share", icon: Share2, inlineSave: true },
  { id: "run", label: "Run", icon: Play, inlineSave: true },
  { id: "history", label: "History", icon: Clock, inlineSave: true },
  { id: "versions", label: "Versions", icon: GitBranch, inlineSave: true },
  { id: "json", label: "JSON", icon: Braces, inlineSave: true },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface AgentContentWindowProps {
  initialAgentId?: string | null;
  initialTab?: AgentContentTab;
  tabs?: AgentContentTab[];
  isOpen?: boolean;
  onClose?: () => void;
  /**
   * Render the agent-picker sidebar + multi-agent browser tabs + dirty-change
   * guard. Default `true` — the editor without a sidebar leaves users stuck on
   * a single agent. Pass `false` only when the host already owns agent
   * selection and wants to lock the editor to one agent (admin tooling, etc).
   */
  multiAgentMode?: boolean;
}

// ── Compact Tab Strip ─────────────────────────────────────────────────────────

interface CompactTabStripProps {
  tabs: TabDefinition[];
  activeTab: AgentContentTab;
  onTabChange: (tab: AgentContentTab) => void;
  isDirty: boolean;
}

export function CompactTabStrip({
  tabs,
  activeTab,
  onTabChange,
  isDirty,
}: CompactTabStripProps) {
  return (
    <div className="flex items-end border-b border-border bg-muted/20 shrink-0 overflow-x-auto scrollbar-hide">
      {tabs.map((tab) => {
        const Icon = tab.icon as React.FC<React.SVGProps<SVGSVGElement>>;
        const isActive = tab.id === activeTab;
        const showDirty = isDirty && tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-all duration-150 shrink-0 relative",
              isActive
                ? "border-primary text-foreground bg-background"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40",
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span>{tab.label}</span>
            {showDirty && (
              <Circle className="h-1.5 w-1.5 fill-amber-500 text-amber-500 shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Header Actions ────────────────────────────────────────────────────────────

interface HeaderActionsProps {
  agentId: string;
  isDirty: boolean;
}

function HeaderActions({ agentId, isDirty }: HeaderActionsProps) {
  const dispatch = useAppDispatch();

  const handleRefresh = () => {
    dispatch(fetchFullAgent(agentId));
  };

  return (
    <div className="flex items-center gap-1">
      {isDirty && (
        <span className="text-[10px] text-amber-500 font-medium px-1">
          unsaved
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleRefresh}
        title="Refresh agent data"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ── Footer Controls ───────────────────────────────────────────────────────────

interface FooterControlsProps {
  agentId: string;
  activeTab: AgentContentTab;
  activeTabs: TabDefinition[];
}

function FooterControls({
  agentId,
  activeTab,
  activeTabs,
}: FooterControlsProps) {
  const dispatch = useAppDispatch();
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const isDirty = useAppSelector((state) => selectAgentIsDirty(state, agentId));
  const agentName = useAppSelector((state) => selectAgentName(state, agentId));

  const activeTabDef = activeTabs.find((t) => t.id === activeTab);
  const showSaveControls = !activeTabDef?.inlineSave && isDirty;

  const handleSave = () => {
    if (!agent) return;
    const dirtyFields = agent._dirtyFields;
    if (!dirtyFields) return;
    for (const field of Object.keys(
      dirtyFields,
    ) as (keyof import("@/features/agents/types/agent-definition.types").AgentDefinition)[]) {
      dispatch(
        saveAgentField({ agentId, field, value: agent[field] as never }),
      );
    }
  };

  const handleCancel = () => {
    dispatch(fetchFullAgent(agentId));
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(agentId);
  };

  return (
    <div className="flex items-center justify-between px-3 py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-medium text-foreground truncate max-w-[160px]">
          {agentName || "Agent"}
        </span>
        <button
          onClick={handleCopyId}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Copy agent ID"
        >
          <span className="truncate max-w-[80px]">{agentId.slice(0, 8)}…</span>
          <Copy className="h-2.5 w-2.5 shrink-0" />
        </button>
      </div>

      {showSaveControls && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={handleCancel}
          >
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleSave}
          >
            <Save className="h-3 w-3 mr-1" />
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Agent Picker Fallback ─────────────────────────────────────────────────────

const PICKER_CONSUMER_ID = "agent-advanced-editor-window-picker";

interface AgentPickerFallbackProps {
  onSelect: (agentId: string) => void;
}

function AgentPickerFallback({ onSelect }: AgentPickerFallbackProps) {
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState("");
  const consumer = useAgentConsumer(PICKER_CONSUMER_ID, {
    unregisterOnUnmount: true,
  });
  const selectFiltered = useMemo(
    () => makeSelectFilteredAgents(PICKER_CONSUMER_ID),
    [],
  );
  const agents = useAppSelector(selectFiltered);

  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.id?.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q),
    );
  }, [agents, search]);

  const handleSelect = (agentId: string) => {
    dispatch(fetchFullAgent(agentId));
    onSelect(agentId);
  };

  return (
    <div className="flex flex-col h-full min-h-0 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground mb-1">
          Select an Agent
        </h2>
        <p className="text-xs text-muted-foreground">
          Choose an agent to open in the editor.
        </p>
      </div>
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents…"
          className="h-8 pl-8 text-xs"
        />
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No agents found.
            </p>
          )}
          {filtered.map((agent) => (
            <button
              key={agent.id}
              onClick={() => handleSelect(agent.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left hover:bg-accent transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {agent.name || "Untitled"}
                </p>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── JSON Tab ──────────────────────────────────────────────────────────────────

/**
 * Fields that the JSON editor cannot change — server-managed metadata, lineage,
 * timestamps, and access flags. Edits to these are silently ignored when the
 * user commits a JSON edit (everything else is diffed and dispatched).
 */
const READ_ONLY_AGENT_FIELDS: ReadonlySet<keyof AgentDefinition> = new Set<
  keyof AgentDefinition
>([
  "id",
  "isVersion",
  "parentAgentId",
  "version",
  "changedAt",
  "changeNote",
  "userId",
  "organizationId",
  "sourceAgentId",
  "sourceSnapshotAt",
  "createdAt",
  "updatedAt",
  "isOwner",
  "accessLevel",
  "sharedByEmail",
]);

/**
 * View of the current agent's full domain definition rendered as JSON.
 *
 * `selectAgentDefinition` strips runtime flags (`_dirty`, `_loading`, etc.) so
 * the user sees only the persisted shape — useful for copy-paste, debugging,
 * and importing elsewhere.
 *
 * When the user has edit access, the inspector also exposes an "Edit" tab
 * (CodeMirror 6 with inline lint squigglies). On blur with valid JSON, we
 * diff the parsed value against the current definition and dispatch
 * `setAgentField` for every editable field that changed — same dirty-tracking
 * path as inline edits, so the footer Save button persists everything.
 */
function AgentJsonTab({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const definition = useAppSelector((state) =>
    selectAgentDefinition(state, agentId),
  );
  const isEditable = useAppSelector((state) =>
    selectAgentIsEditable(state, agentId),
  );

  const handleUpdate = useCallback(
    (next: unknown) => {
      if (!definition) return;
      if (next === null || typeof next !== "object" || Array.isArray(next)) {
        toast.error("Agent JSON must be an object.");
        return;
      }
      const incoming = next as Partial<AgentDefinition>;
      const editableKeys = (
        Object.keys(definition) as (keyof AgentDefinition)[]
      ).filter((k) => !READ_ONLY_AGENT_FIELDS.has(k));

      let changedCount = 0;
      let blockedCount = 0;
      for (const key of editableKeys) {
        if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
        const before = definition[key];
        const after = incoming[key] as AgentDefinition[typeof key];
        // Cheap deep-equality via JSON serialization. The agent definition is
        // pure JSON-serializable data, so this is correct (no functions, no
        // Dates, no Maps). Avoids pulling in lodash for one call.
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        changedCount += 1;
        dispatch(
          setAgentField({
            id: agentId,
            field: key,
            value: after as AgentDefinition[keyof AgentDefinition],
          }),
        );
      }
      // Surface attempts to mutate read-only fields as an info toast — the
      // change is silently dropped, which is otherwise confusing.
      for (const roKey of READ_ONLY_AGENT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(incoming, roKey)) continue;
        if (
          JSON.stringify(definition[roKey]) !== JSON.stringify(incoming[roKey])
        ) {
          blockedCount += 1;
        }
      }

      if (changedCount > 0) {
        const fieldsWord = changedCount === 1 ? "field" : "fields";
        toast.success(
          `Staged ${changedCount} ${fieldsWord} — Save in the footer to persist.`,
        );
      }
      if (blockedCount > 0) {
        toast.info(
          `Ignored ${blockedCount} read-only field${blockedCount === 1 ? "" : "s"} (id / version / timestamps / access).`,
        );
      }
    },
    [agentId, definition, dispatch],
  );

  return (
    <div className="h-full p-2">
      <JsonInspector
        data={definition ?? {}}
        label="Agent Definition"
        defaultView="json"
        onUpdate={isEditable ? handleUpdate : undefined}
      />
    </div>
  );
}

// ── Tab Content Router ────────────────────────────────────────────────────────

interface TabContentProps {
  agentId: string;
  activeTab: AgentContentTab;
  isOwner: boolean;
  agentName: string;
}

export function TabContent({
  agentId,
  activeTab,
  isOwner,
  agentName,
}: TabContentProps) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      {activeTab === "system" && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <SystemMessage agentId={agentId} />
          </div>
        </ScrollArea>
      )}
      {activeTab === "messages" && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <Messages agentId={agentId} />
          </div>
        </ScrollArea>
      )}

      {activeTab === "settings" && (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex-1 min-h-0 overflow-hidden px-4">
            <AgentSettingsCore agentId={agentId} />
          </div>
        </div>
      )}

      {activeTab === "variables" && <AgentVariablesPanel agentId={agentId} />}

      {activeTab === "tools" && <AgentToolsManager agentId={agentId} />}

      {activeTab === "context" && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <AgentContextSlotsManager agentId={agentId} />
          </div>
        </ScrollArea>
      )}

      {activeTab === "overview" && <AgentSettingsForm agentId={agentId} />}

      {activeTab === "share" && (
        <AgentSharePanel
          agentId={agentId}
          isOwner={isOwner}
          agentName={agentName}
        />
      )}

      {activeTab === "history" && (
        <AgentContentHistoryPanel agentId={agentId} />
      )}

      {activeTab === "versions" && <AgentVersionDiffPage agentId={agentId} />}

      {activeTab === "json" && <AgentJsonTab agentId={agentId} />}

      {activeTab === "run" && (
        <div className="h-full w-full flex justify-center min-w-0 overflow-hidden">
          <div className="h-full w-full max-w-[800px]">
            <AgentRunWrapper
              agentId={agentId}
              sourceFeature="agent-advanced-editor-window"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dirty Guard (used in multi-agent mode when switching agents) ─────────────

interface DirtyGuardProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DirtyGuardDesktop({ open, onConfirm, onCancel }: DirtyGuardProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes in this agent. Switching agents will
            discard them. Do you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep Editing</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Discard & Switch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DirtyGuardMobile({ open, onConfirm, onCancel }: DirtyGuardProps) {
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Unsaved Changes</DrawerTitle>
          <DrawerDescription>
            You have unsaved changes in this agent. Switching agents will
            discard them. Do you want to continue?
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button variant="destructive" onClick={onConfirm}>
            Discard & Switch
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Keep Editing
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AgentContentWindow({
  initialAgentId,
  initialTab = "messages",
  tabs,
  isOpen,
  onClose,
  multiAgentMode = true,
}: AgentContentWindowProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();

  // Active agent — stored in `localAgentId` so the picker fallback (and the
  // sidebar in multi-agent mode) can swap it without remount.
  const [localAgentId, setLocalAgentId] = useState<string | null>(
    initialAgentId ?? null,
  );
  const agentId = localAgentId;

  // Multi-agent browser-tab state. Only used when `multiAgentMode`.
  const [openedTabIds, setOpenedTabIds] = useState<string[]>(
    initialAgentId ? [initialAgentId] : [],
  );

  // Dirty-change guard state (multi-agent mode only).
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [showDirtyWarning, setShowDirtyWarning] = useState(false);

  const [activeTab, setActiveTab] = useState<AgentContentTab>(initialTab);

  // Resolve the active tab list — custom order/subset or all tabs
  const activeTabs = useMemo(() => {
    if (tabs && tabs.length > 0) {
      return ALL_TABS.filter((t) => tabs.includes(t.id)).sort(
        (a, b) => tabs.indexOf(a.id) - tabs.indexOf(b.id),
      );
    }
    return ALL_TABS;
  }, [tabs]);

  const isDirty = useAppSelector((state) =>
    selectAgentIsDirty(state, agentId ?? ""),
  );
  const agentName = useAppSelector((state) =>
    selectAgentName(state, agentId ?? ""),
  );
  const agent = useAppSelector((state) =>
    selectAgentById(state, agentId ?? ""),
  );
  const isOwner = agent?.isOwner === true;
  const isLoaded = !!agent && !(agent as { _loading?: boolean })._loading;

  // Mount-fetch guard — dispatch fetchFullAgent when agentId is set but not loaded
  useEffect(() => {
    if (agentId && !isLoaded) {
      dispatch(fetchFullAgent(agentId));
    }
  }, [agentId]); // only run when agentId changes

  // Ensure activeTab is in the available tab list
  useEffect(() => {
    if (
      agentId &&
      activeTabs.length > 0 &&
      !activeTabs.find((t) => t.id === activeTab)
    ) {
      setActiveTab(activeTabs[0].id);
    }
  }, [activeTabs, agentId]);

  // ── Multi-agent helpers ───────────────────────────────────────────────────

  const switchToAgent = useCallback(
    (newAgentId: string) => {
      setLocalAgentId(newAgentId);
      setOpenedTabIds((prev) =>
        prev.includes(newAgentId) ? prev : [...prev, newAgentId],
      );
      dispatch(fetchFullAgent(newAgentId));
    },
    [dispatch],
  );

  const handleOpenAgent = useCallback(
    (newAgentId: string) => {
      if (newAgentId === agentId) return;
      if (isDirty) {
        setPendingAgentId(newAgentId);
        setShowDirtyWarning(true);
      } else {
        switchToAgent(newAgentId);
      }
    },
    [agentId, isDirty, switchToAgent],
  );

  const handleDirtyConfirm = useCallback(() => {
    if (pendingAgentId) switchToAgent(pendingAgentId);
    setPendingAgentId(null);
    setShowDirtyWarning(false);
  }, [pendingAgentId, switchToAgent]);

  const handleDirtyCancel = useCallback(() => {
    setPendingAgentId(null);
    setShowDirtyWarning(false);
  }, []);

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      const next = openedTabIds.filter((id) => id !== tabId);
      setOpenedTabIds(next);
      if (agentId === tabId) {
        setLocalAgentId(next[next.length - 1] ?? null);
      }
    },
    [agentId, openedTabIds],
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({ initialAgentId: agentId, activeTab }),
    [agentId, activeTab],
  );

  // Sidebar — only present in multi-agent mode.
  const sidebarNode = multiAgentMode ? (
    <AgentSidebar
      openedTabIds={openedTabIds}
      activeTabId={agentId}
      onOpenAgent={handleOpenAgent}
    />
  ) : undefined;

  return (
    <>
      <WindowPanel
        id="agent-advanced-editor-window"
        title="Agent Advanced Editor"
        onClose={onClose}
        width={multiAgentMode ? 1200 : 1050}
        height={760}
        minWidth={multiAgentMode ? 760 : 640}
        minHeight={520}
        urlSyncKey="agent-advanced-editor"
        urlSyncId="agent-advanced-editor-window"
        urlSyncArgs={{ m: "ac" }}
        overlayId="agentAdvancedEditorWindow"
        onCollectData={collectData}
        sidebar={sidebarNode}
        sidebarDefaultSize={multiAgentMode ? 260 : undefined}
        sidebarMinSize={multiAgentMode ? 200 : undefined}
        sidebarExpandsWindow={false}
        actionsRight={
          agentId ? (
            <HeaderActions agentId={agentId} isDirty={isDirty} />
          ) : undefined
        }
        footerLeft={
          agentId ? (
            <FooterControls
              agentId={agentId}
              activeTab={activeTab}
              activeTabs={activeTabs}
            />
          ) : undefined
        }
      >
        <div className="flex flex-col h-full min-h-0 bg-background">
          {/* Multi-agent browser tabs (top of body) */}
          {multiAgentMode && (
            <AgentTabs
              openedTabIds={openedTabIds}
              activeTabId={agentId}
              onSetActive={handleOpenAgent}
              onCloseTab={handleCloseTab}
            />
          )}

          {!agentId ? (
            multiAgentMode ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
                Select an agent from the sidebar to begin editing.
              </div>
            ) : (
              <AgentPickerFallback onSelect={setLocalAgentId} />
            )
          ) : (
            <>
              <CompactTabStrip
                tabs={activeTabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                isDirty={isDirty}
              />
              <TabContent
                agentId={agentId}
                activeTab={activeTab}
                isOwner={isOwner}
                agentName={agentName ?? ""}
              />
            </>
          )}
        </div>
      </WindowPanel>

      {/* Dirty guard — desktop AlertDialog / mobile Drawer (multi-agent mode) */}
      {multiAgentMode &&
        (isMobile ? (
          <DirtyGuardMobile
            open={showDirtyWarning}
            onConfirm={handleDirtyConfirm}
            onCancel={handleDirtyCancel}
          />
        ) : (
          <DirtyGuardDesktop
            open={showDirtyWarning}
            onConfirm={handleDirtyConfirm}
            onCancel={handleDirtyCancel}
          />
        ))}
    </>
  );
}
