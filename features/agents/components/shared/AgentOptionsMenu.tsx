"use client";

import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { applyOrganizationContextHeader } from "@ai-matrx/chat/host/server/organization-context";

import { invalidateAgentCache } from "@ai-matrx/chat/agents/redux/agent-definition/invalidate-agent-cache.thunk";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { useOpenAgentSettingsWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentRunHistoryWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentContentWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentRunWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentOptimizerWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentFindUsagesWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentCreateAppWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentDataStorageWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentConvertSystemWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentShortcutQuickCreateWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentAdminFindUsagesWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentImportWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenAgentInterfaceVariationsWindow } from "@ai-matrx/chat/host/window-openers";
import { useOpenSaveTemplateDialog } from "@ai-matrx/chat/host/window-openers";

/** The menu label is also this item's dispatch key. */
const SAVE_AS_TEMPLATE_LABEL = "Save as template";

import { useCallback, useState } from "react";
import { Link } from "@ai-matrx/chat/host/navigation";
import {
  MoreHorizontal,
  FileText,
  History,
  GitBranch,
  SlidersHorizontal,
  Atom,
  Maximize2,
  Play,
  Copy,
  AppWindow,
  Database,
  Layers,
  ChevronRight,
  Shield,
  RefreshCw,
  Link2,
  Search,
  Upload,
  ExternalLink,
  FileChartColumn,
  RotateCcw,
  Archive,
  ArchiveRestore,
  Trash2,
  PackagePlus,
} from "lucide-react";
import { toast } from "@ai-matrx/chat/host/notify";
import { cn } from "@ai-matrx/design-system";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { TapTargetButtonTransparent } from "@ai-matrx/tap-target";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@ai-matrx/design-system";
import { Drawer, DrawerContent, DrawerTitle } from "@ai-matrx/design-system";
import { MenuTapButton } from "@ai-matrx/tap-target/buttons";
import { useAgentDuplicateFlow } from "../../hooks/useAgentDuplicateFlow";
import { ReferenceCopyMenuItem } from "@ai-matrx/chat/host/ui-slots";
import { useAgentLifecycleActions } from "../../lifecycle/useAgentLifecycleActions";
import { selectIsSuperAdmin } from "@ai-matrx/chat/host/identity";
import { selectOrganizationId } from "@ai-matrx/chat/host/org";
import { Button, Tile } from "@ai-matrx/design-system/controls";

const INTERFACE_VARIATIONS = [
  "Full Modal",
  "Compact Modal",
  "Inline",
  "Sidebar",
  "Flexible Panel",
  "Background",
  "Toast",
  "Direct",
  "Background Process",
] as const;

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  soon?: boolean;
}

// Actions scoped to the currently active agent
const THIS_AGENT_ITEMS: MenuItem[] = [
  { label: "Edit Agent Info", icon: FileText },
  { label: "View Run History", icon: History },
  { label: "Advanced Settings View", icon: SlidersHorizontal },
  { label: "View All Versions", icon: GitBranch },
  { label: "Open Run Modal", icon: Play },
  { label: "Full Screen Editor", icon: Maximize2, soon: true },
  { label: "Matrx Agent Optimizer", icon: Atom },
  { label: "Find Usages", icon: Search },
  { label: "Drift Report", icon: FileChartColumn },
  { label: "Refresh Server Cache", icon: RotateCcw },
];

// Actions that produce something new from this agent
const AGENT_MANAGEMENT_ITEMS: MenuItem[] = [
  { label: "Create Shortcut", icon: Link2 },
  { label: "Duplicate", icon: Copy },
  // Unified link surface (user agent ⇄ system agent): create/open my personal
  // copy, pull system updates, push to system, or convert a user agent into a
  // new system agent. Valid on both user and builtin agents — the window
  // resolves the relationship and gates each action.
  { label: "Linked Agent Sync", icon: RefreshCw },
  { label: "Convert to Template", icon: Shield },
  { label: "Create App", icon: AppWindow },
  { label: "Add Data Storage Support", icon: Database },
  // Share this agent + the tables its variables read (+ the agents that share
  // them) as a template for the organization. The dialog says so plainly
  // when the agent reads no tables yet.
  { label: SAVE_AS_TEMPLATE_LABEL, icon: PackagePlus },
];

// Global agent actions — not scoped to the current agent
const GLOBAL_AGENT_ITEMS: MenuItem[] = [
  { label: "Import Agent", icon: Upload },
];

// Items that can be opened in a new tab (have navigatable URLs).
// `basePath` lets admin surfaces (`/administration/agents/system-agents/agents`)
// reuse this menu without escaping back to the user surface.
const NEW_TAB_ITEMS: {
  label: string;
  icon: typeof ExternalLink;
  getHref: (agentId: string, basePath: string) => string;
}[] = [
  {
    label: "Open in Chat",
    icon: ExternalLink,
    getHref: (id) => `/chat/a/${encodeURIComponent(id)}`,
  },
  {
    label: "View Agent",
    icon: ExternalLink,
    getHref: (id, base) => `${base}/${id}`,
  },
  {
    label: "Build Agent",
    icon: ExternalLink,
    getHref: (id, base) => `${base}/${id}/build`,
  },
  {
    label: "Run Agent",
    icon: ExternalLink,
    getHref: (id, base) => `${base}/${id}/run`,
  },
  {
    label: "View Versions",
    icon: ExternalLink,
    getHref: (id, base) => `${base}/${id}/latest`,
  },
];

const ADMIN_ITEMS: MenuItem[] = [
  { label: "Find Usages (Admin)", icon: Search },
];

function comingSoon() {
  toast.info("Coming Soon");
}

/**
 * The agent menu is mounted on both user and admin surfaces. The only signal
 * we have for "I am the admin" is the route the surface declared via
 * `basePath`. This must stay in lockstep with the system-agents route in
 * `app/(authenticated)/(admin-auth)/administration/agents/system-agents/`.
 *
 * Used to:
 *  - opt the duplicate RPC into `asSystem` mode (preserves builtin lineage)
 *  - keep navigation that bounces off this menu inside the admin shell
 */

function SoonBadge() {
  return (
    <span className="ml-2 text-[10px] font-medium text-muted-foreground/60 bg-muted rounded px-1 py-0.5 leading-none">
      soon
    </span>
  );
}

async function convertToTemplate(
  agentId: string,
  organizationId: string,
): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/convert-to-template`, {
    method: "POST",
    // The template is filed in the organization the person selected — the
    // route refuses without it rather than filing in a own organization.
    headers: applyOrganizationContextHeader({}, organizationId),
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      data.details ? `${data.error}: ${data.details}` : data.error || "Failed",
    );
  }
  const data = await response.json();
  toast.success(data.message ?? "Saved as template!");
}

export function AgentOptionsMenu({
  agentId,
  asTapTarget,
  basePath = "/agents",
}: {
  agentId: string;
  asTapTarget?: boolean;
  /** Base path for routing. Defaults to `/agents`. Admin surfaces pass
   *  `/administration/agents/system-agents/agents` so internal links stay in the
   *  admin context. */
  basePath?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);
  const dispatch = useAppDispatch();
  const openSettings = useOpenAgentSettingsWindow();
  const openRunHistory = useOpenAgentRunHistoryWindow();
  const openAdvancedEditor = useOpenAgentContentWindow();
  const openRun = useOpenAgentRunWindow();
  const openOptimizer = useOpenAgentOptimizerWindow();
  const openFindUsages = useOpenAgentFindUsagesWindow();
  const openCreateApp = useOpenAgentCreateAppWindow();
  const openDataStorage = useOpenAgentDataStorageWindow();
  const openConvertSystem = useOpenAgentConvertSystemWindow();
  const openShortcut = useOpenAgentShortcutQuickCreateWindow();
  const openSaveTemplate = useOpenSaveTemplateDialog();
  const openAdminFindUsages = useOpenAgentAdminFindUsagesWindow();
  const openImport = useOpenAgentImportWindow();
  const openInterfaceVariations = useOpenAgentInterfaceVariationsWindow();

  // Duplicate asks which version to copy (default: current), then runs the
  // shared flow. The dialog lives at this level so it survives the dropdown /
  // drawer that opened it closing.
  const duplicateFlow = useAgentDuplicateFlow(agentId, {
    basePath,
    fallbackSuffix: "",
  });

  // Builtin/system agents need different menu options than user agents.
  // - "Convert to Template" is meaningless — builtins ARE the templates users
  //   fork from. Showing it would just produce a confusing redundant row in
  //   the templates table.
  // "Linked Agent Sync" is intentionally NOT filtered for builtins: on a system
  // agent it offers "create my personal copy" + pull/push, which is exactly the
  // reverse-direction flow we want there.
  // We compute one filtered version of each item list per render rather than
  // sprinkling conditionals through the JSX.
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const isBuiltin = agent?.agentType === "builtin";

  const runDuplicate = duplicateFlow.openChooser;

  const managementItems = AGENT_MANAGEMENT_ITEMS.filter(
    (item) =>
      !isBuiltin || item.label !== "Convert to Template",
  );

  // Admin actions (incl. "Find Usages (Admin)") are super-admin only. The
  // server RPCs enforce is_super_admin() regardless; this hides the entry.
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  // Archive and delete, on the screen where a person decides they are done with an
  // agent. Before 2026-09-19 this menu had neither and said nothing about where to go
  // instead, so the builder was a dead end for the one thing you cannot do anywhere else
  // while you are standing in it.
  const lifecycle = useAgentLifecycleActions(agentId, basePath);
  // The organization a converted template is filed in — carried to the
  // route as `X-Organization-Id`, never resolved into a personal one.
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const adminItems = isSuperAdmin ? ADMIN_ITEMS : [];

  const runRefreshServerCache = useCallback(async () => {
    setIsRefreshingCache(true);
    try {
      const result = await dispatch(invalidateAgentCache({ agentId })).unwrap();
      if (result.cleared) {
        toast.success(
          "Server cache cleared. The next run will load the latest agent definition.",
        );
      } else {
        toast.error("Server did not confirm cache clearance.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to refresh server cache.",
      );
    } finally {
      setIsRefreshingCache(false);
    }
  }, [agentId, dispatch]);

  const handleDesktopItemClick = async (label: string) => {
    console.log("[AGENT OPTIONS MENU] Clicked item:", label);
    if (label === "Edit Agent Info") {
      console.log(
        "[AGENT OPTIONS MENU] Editing agent info, Agent ID:",
        agentId,
      );
      openSettings({ initialAgentId: agentId });
      setOpen(false);
    } else if (label === "View Run History") {
      console.log(
        "[AGENT OPTIONS MENU] Viewing run history, Agent ID:",
        agentId,
      );
      openRunHistory({
        agentId: agentId ?? null,
        initialSelectedConversationId: null,
      });
      setOpen(false);
    } else if (label === "Advanced Settings View") {
      console.log(
        "[AGENT OPTIONS MENU] Viewing advanced settings, Agent ID:",
        agentId,
      );
      openAdvancedEditor({
        initialAgentId: agentId ?? null,
        initialTab: undefined,
        tabs: null,
      });
      setOpen(false);
    } else if (label === "Open Run Modal") {
      console.log("[AGENT OPTIONS MENU] Opening run modal, Agent ID:", agentId);
      openRun({
        initialAgentId: agentId ?? null,
        initialSelectedConversationId: null,
      });
      setOpen(false);
    } else if (label === "Matrx Agent Optimizer") {
      console.log(
        "[AGENT OPTIONS MENU] Opening matrx agent optimizer, Agent ID:",
        agentId,
      );
      openOptimizer({ agentId: agentId ?? null });
      setOpen(false);
    } else if (label === "Find Usages") {
      console.log("[AGENT OPTIONS MENU] Finding usages, Agent ID:", agentId);
      openFindUsages({ agentId: agentId ?? null });
      setOpen(false);
    } else if (label === "Create App") {
      console.log("[AGENT OPTIONS MENU] Creating app, Agent ID:", agentId);
      openCreateApp();
      setOpen(false);
    } else if (label === "Add Data Storage Support") {
      console.log(
        "[AGENT OPTIONS MENU] Adding data storage support, Agent ID:",
        agentId,
      );
      openDataStorage({ agentId: agentId ?? null });
      setOpen(false);
    } else if (label === "Linked Agent Sync") {
      console.log(
        "[AGENT OPTIONS MENU] Opening linked agent sync, Agent ID:",
        agentId,
      );
      openConvertSystem({ agentId: agentId ?? null });
      setOpen(false);
    } else if (label === SAVE_AS_TEMPLATE_LABEL) {
      openSaveTemplate({ initialAgentId: agentId ?? null });
      setOpen(false);
    } else if (label === "Create Shortcut") {
      console.log("[AGENT OPTIONS MENU] Creating shortcut, Agent ID:", agentId);
      openShortcut({ agentId: agentId ?? null });
      setOpen(false);
    } else if (label === "Find Usages (Admin)") {
      console.log(
        "[AGENT OPTIONS MENU] Finding usages (admin), Agent ID:",
        agentId,
      );
      openAdminFindUsages({ agentId: agentId ?? null });
      setOpen(false);
    } else if (label === "Import Agent") {
      console.log("[AGENT OPTIONS MENU] Importing agent, Agent ID:", agentId);
      openImport({});
      setOpen(false);
    } else if (label === "Duplicate") {
      console.log("[AGENT OPTIONS MENU] Duplicating agent, Agent ID:", agentId);
      // Close the dropdown first so the outcome dialog has a clean stage.
      // The dialog itself owns the loading / success / error UX; we just
      // delegate to the shared `runDuplicate` orchestrator.
      setOpen(false);
      void runDuplicate();
    } else if (label === "Refresh Server Cache") {
      setOpen(false);
      void runRefreshServerCache();
    } else if (label === "Convert to Template") {
      console.log(
        "[AGENT OPTIONS MENU] Converting to template, Agent ID:",
        agentId,
      );
      if (!selectedOrganizationId) {
        // The route files the template in the admitted organization and
        // refuses without one — say so rather than send a request that 400s.
        toast.error(
          "Select an organization from the avatar menu, then try again.",
        );
        return;
      }
      setIsConverting(true);
      try {
        await convertToTemplate(agentId, selectedOrganizationId);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save as template",
        );
      } finally {
        setIsConverting(false);
        setOpen(false);
      }
    } else {
      console.log(
        "[AGENT OPTIONS MENU] Unknow Clicked Item: ",
        label,
        "Coming soon, Agent ID:",
        agentId,
      );
      comingSoon();
    }
  };

  const handleInterfaceVariationClick = () => {
    console.log(
      "[AGENT OPTIONS MENU] Handling interface variation click, Agent ID:",
      agentId,
    );
    openInterfaceVariations({ agentId: agentId ?? null });
    setOpen(false);
  };

  const trigger = <MenuTapButton variant="transparent" />;

  // Single dialog instance shared by both desktop and mobile flows. Lives at
  // the parent level so the dropdown / drawer that triggered the duplicate
  // can close cleanly without unmounting the in-flight dialog.
  const duplicateDialog = duplicateFlow.dialog;

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={setOpen}>
          {asTapTarget ? (
            <TapTargetButtonTransparent
              icon={<MoreHorizontal className="w-4 h-4" />}
              ariaLabel="Agent options"
              onClick={() => setOpen(true)}
            />
          ) : (
            <Button variant="quiet" icon={<MoreHorizontal />} aria-label="Agent options" onClick={() => setOpen(true)} />
          )}
          <DrawerContent className="max-h-[85dvh]">
            <DrawerTitle className="sr-only">Agent Options</DrawerTitle>
            <MobileMenuContent
              onClose={() => setOpen(false)}
              agentId={agentId}
              basePath={basePath}
              onTriggerDuplicate={runDuplicate}
              onTriggerRefreshCache={runRefreshServerCache}
              isRefreshingCache={isRefreshingCache}
            />
          </DrawerContent>
        </Drawer>
        {duplicateDialog}
      </>
    );
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <ReferenceCopyMenuItem
            referenceType="agent"
            id={agentId}
            label={agent?.name ?? undefined}
            toastLabel={agent?.name ?? "Agent"}
            onCopied={() => setOpen(false)}
          />
          <DropdownMenuSeparator />
          {/* ── This Agent ── */}
          {THIS_AGENT_ITEMS.map(({ label, icon: Icon, soon }) => {
            if (label === "View All Versions" || label === "Drift Report") {
              const href =
                label === "Drift Report"
                  ? "/reports/agent-drift"
                  : `${basePath}/${agentId}/latest?tab=history`;
              return (
                <DropdownMenuItem key={label} asChild>
                  <Link
                    href={href}
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span className="flex-1">{label}</span>
                  </Link>
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem
                key={label}
                disabled={label === "Refresh Server Cache" && isRefreshingCache}
                onClick={() => handleDesktopItemClick(label)}
                className={cn(soon && "text-muted-foreground")}
              >
                <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="flex-1">
                  {label === "Refresh Server Cache" && isRefreshingCache
                    ? "Refreshing..."
                    : label}
                </span>
                {soon && <SoonBadge />}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Layers className="w-4 h-4 mr-2 text-muted-foreground" />
              <span className="flex-1">Try Interface Variations</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {INTERFACE_VARIATIONS.map((v) => (
                <DropdownMenuItem
                  key={v}
                  onClick={handleInterfaceVariationClick}
                >
                  {v}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {/* new-tab-icon: this is the submenu trigger; every item inside NEW_TAB_ITEMS renders as <Link target="_blank"> */}
              <ExternalLink className="w-4 h-4 mr-2 text-muted-foreground" />
              Open in New Tab
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {NEW_TAB_ITEMS.map(({ label, icon: Icon, getHref }) => (
                <DropdownMenuItem key={label} asChild>
                  <Link
                    href={getHref(agentId, basePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* ── Manage This Agent ── */}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
            Manage
          </DropdownMenuLabel>
          {managementItems.map(({ label, icon: Icon, soon }) => {
            const duplicateInFlight = duplicateFlow.isDuplicating;
            const isLoading =
              (label === "Convert to Template" && isConverting) ||
              (label === "Duplicate" && duplicateInFlight);
            const displayLabel =
              label === "Convert to Template" && isConverting
                ? "Saving..."
                : label === "Duplicate" && duplicateInFlight
                  ? "Duplicating..."
                  : label;
            return (
              <DropdownMenuItem
                key={label}
                disabled={isLoading}
                onClick={() => handleDesktopItemClick(label)}
                className={cn(soon && "text-muted-foreground")}
              >
                <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="flex-1">{displayLabel}</span>
                {soon && <SoonBadge />}
              </DropdownMenuItem>
            );
          })}

          {/* ── Global (not agent-specific) ── */}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
            Agents
          </DropdownMenuLabel>
          {GLOBAL_AGENT_ITEMS.map(({ label, icon: Icon, soon }) => (
            <DropdownMenuItem
              key={label}
              onClick={() => handleDesktopItemClick(label)}
              className={cn(soon && "text-muted-foreground")}
            >
              <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
              <span className="flex-1">{label}</span>
              {soon && <SoonBadge />}
            </DropdownMenuItem>
          ))}

          {/* ── Admin ── */}
          {adminItems.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                Admin
              </DropdownMenuLabel>
              {adminItems.map(({ label, icon: Icon }) => (
                <DropdownMenuItem
                  key={label}
                  onClick={() => handleDesktopItemClick(label)}
                >
                  <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="flex-1">{label}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          {lifecycle.available && (
            <>
          {/* ── Manage this agent ── */}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
            Manage
          </DropdownMenuLabel>
          <DropdownMenuItem
            disabled={lifecycle.isBusy}
            onClick={() => {
              setOpen(false);
              void lifecycle.toggleArchived();
            }}
          >
            {lifecycle.isArchived ? (
              <ArchiveRestore className="w-4 h-4 mr-2 text-muted-foreground" />
            ) : (
              <Archive className="w-4 h-4 mr-2 text-muted-foreground" />
            )}
            <span className="flex-1">{lifecycle.archiveLabel}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={lifecycle.isBusy}
            onClick={() => {
              setOpen(false);
              void lifecycle.remove();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            <span className="flex-1">Delete</span>
          </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {duplicateDialog}
    </>
  );
}

function MobileMenuContent({
  onClose,
  agentId,
  basePath,
  onTriggerDuplicate,
  onTriggerRefreshCache,
  isRefreshingCache,
}: {
  onClose: () => void;
  agentId: string;
  basePath: string;
  /** Parent-owned duplicate orchestrator. The mobile drawer closes itself
   *  immediately after invoking this; the parent's outcome dialog takes
   *  over from there. */
  onTriggerDuplicate: () => Promise<void> | void;
  onTriggerRefreshCache: () => Promise<void>;
  isRefreshingCache: boolean;
}) {
  const [variationsOpen, setVariationsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const openSettings = useOpenAgentSettingsWindow();
  const openRunHistory = useOpenAgentRunHistoryWindow();
  const openAdvancedEditor = useOpenAgentContentWindow();
  const openRun = useOpenAgentRunWindow();
  const openOptimizer = useOpenAgentOptimizerWindow();
  const openFindUsages = useOpenAgentFindUsagesWindow();
  const openCreateApp = useOpenAgentCreateAppWindow();
  const openDataStorage = useOpenAgentDataStorageWindow();
  const openConvertSystem = useOpenAgentConvertSystemWindow();
  const openShortcut = useOpenAgentShortcutQuickCreateWindow();
  const openSaveTemplate = useOpenSaveTemplateDialog();
  const openAdminFindUsages = useOpenAgentAdminFindUsagesWindow();
  const openImport = useOpenAgentImportWindow();
  const openInterfaceVariations = useOpenAgentInterfaceVariationsWindow();

  // Same builtin-aware filtering as the desktop variant — see AgentOptionsMenu
  // for the full rationale.
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const isBuiltin = agent?.agentType === "builtin";
  const managementItems = AGENT_MANAGEMENT_ITEMS.filter(
    (item) =>
      !isBuiltin || item.label !== "Convert to Template",
  );
  // Admin actions (incl. "Find Usages (Admin)") are super-admin only. The
  // server RPCs enforce is_super_admin() regardless; this hides the entry.
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  // Archive and delete, on the screen where a person decides they are done with an
  // agent. Before 2026-09-19 this menu had neither and said nothing about where to go
  // instead, so the builder was a dead end for the one thing you cannot do anywhere else
  // while you are standing in it.
  const lifecycle = useAgentLifecycleActions(agentId, basePath);
  // The organization a converted template is filed in — carried to the
  // route as `X-Organization-Id`, never resolved into a personal one.
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const adminItems = isSuperAdmin ? ADMIN_ITEMS : [];

  const handleItem = async (label: string) => {
    if (label === "Edit Agent Info") {
      openSettings({ initialAgentId: agentId });
      onClose();
    } else if (label === "View Run History") {
      openRunHistory({
        agentId: agentId ?? null,
        initialSelectedConversationId: null,
      });
      onClose();
    } else if (label === "Advanced Settings View") {
      openAdvancedEditor({
        initialAgentId: agentId ?? null,
        initialTab: undefined,
        tabs: null,
      });
      onClose();
    } else if (label === "Open Run Modal") {
      openRun({
        initialAgentId: agentId ?? null,
        initialSelectedConversationId: null,
      });
      onClose();
    } else if (label === "Matrx Agent Optimizer") {
      openOptimizer({ agentId: agentId ?? null });
      onClose();
    } else if (label === "Find Usages") {
      openFindUsages({ agentId: agentId ?? null });
      onClose();
    } else if (label === "Create App") {
      openCreateApp();
      onClose();
    } else if (label === "Add Data Storage Support") {
      openDataStorage({ agentId: agentId ?? null });
      onClose();
    } else if (label === "Linked Agent Sync") {
      openConvertSystem({ agentId: agentId ?? null });
      onClose();
    } else if (label === SAVE_AS_TEMPLATE_LABEL) {
      openSaveTemplate({ initialAgentId: agentId ?? null });
      onClose();
    } else if (label === "Create Shortcut") {
      openShortcut({ agentId: agentId ?? null });
      onClose();
    } else if (label === "Find Usages (Admin)") {
      openAdminFindUsages({ agentId: agentId ?? null });
      onClose();
    } else if (label === "Import Agent") {
      openImport({});
      onClose();
    } else if (label === "Duplicate") {
      // Close the drawer first so the outcome dialog has a clean stage —
      // mobile cannot stack a Drawer + Drawer well. The parent's
      // `onTriggerDuplicate` owns the dispatch + dialog lifecycle.
      onClose();
      void onTriggerDuplicate();
    } else if (label === "Refresh Server Cache") {
      onClose();
      void onTriggerRefreshCache();
    } else if (label === "Convert to Template") {
      if (!selectedOrganizationId) {
        // The route files the template in the admitted organization and
        // refuses without one — say so rather than send a request that 400s.
        toast.error(
          "Select an organization from the avatar menu, then try again.",
        );
        return;
      }
      setIsBusy(true);
      try {
        await convertToTemplate(agentId, selectedOrganizationId);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save as template",
        );
      } finally {
        setIsBusy(false);
        onClose();
      }
    } else {
      comingSoon();
      onClose();
    }
  };

  const handleVariationClick = () => {
    openInterfaceVariations({ agentId: agentId ?? null });
    onClose();
  };

  return (
    <div className="flex flex-col overflow-y-auto max-h-[calc(85dvh-2rem)] pb-safe">
      {/* ── This Agent ── */}
      <div className="py-1">
        {THIS_AGENT_ITEMS.map(({ label, icon: Icon, soon }) => {
          if (label === "View All Versions" || label === "Drift Report") {
            const href =
              label === "Drift Report"
                ? "/reports/agent-drift"
                : `${basePath}/${agentId}/latest?tab=history`;
            return (
              <Link
                key={label}
                href={href}
                onClick={onClose}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-left">{label}</span>
              </Link>
            );
          }
          return (
            <Tile
              key={label}
              variant="quiet"
              onClick={() => handleItem(label)}
              disabled={label === "Refresh Server Cache" && isRefreshingCache}
              icon={<Icon />}
              title={label === "Refresh Server Cache" && isRefreshingCache ? "Refreshing..." : label}
              end={soon ? <SoonBadge /> : undefined}
            />
          );
        })}

        <Tile variant="quiet" icon={<Layers />} title="Try Interface Variations" end={<ChevronRight />} onClick={() => setVariationsOpen(!variationsOpen)} />
        {variationsOpen && (
          <div className="pl-6 bg-muted/20">
            {INTERFACE_VARIATIONS.map((v) => (
              <Button variant="quiet" key={v} onClick={handleVariationClick} className="w-full">{v}</Button>
            ))}
          </div>
        )}
      </div>

      {/* ── Open in New Tab ── */}
      <div className="h-px bg-border mx-3 my-1" />
      <div className="px-4 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
          Open in New Tab
        </span>
      </div>
      <div className="py-1">
        {NEW_TAB_ITEMS.map(({ label, icon: Icon, getHref }) => (
          <Link
            key={label}
            href={getHref(agentId, basePath)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
          >
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            {label}
          </Link>
        ))}
      </div>

      {/* ── Manage This Agent ── */}
      <div className="h-px bg-border mx-3 my-1" />
      <div className="px-4 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
          Manage
        </span>
      </div>
      <div className="py-1">
        {managementItems.map(({ label, icon: Icon, soon }) => (
          <Tile
            key={label}
            variant="quiet"
            onClick={() => handleItem(label)}
            disabled={isBusy && label === "Convert to Template"}
            icon={<Icon />}
            title={label}
            end={soon ? <SoonBadge /> : undefined}
          />
        ))}
      </div>

      {/* ── Agents (global) ── */}
      <div className="h-px bg-border mx-3 my-1" />
      <div className="px-4 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
          Agents
        </span>
      </div>
      <div className="py-1">
        {GLOBAL_AGENT_ITEMS.map(({ label, icon: Icon, soon }) => (
          <Tile
            key={label}
            variant="quiet"
            onClick={() => handleItem(label)}
            icon={<Icon />}
            title={label}
            end={soon ? <SoonBadge /> : undefined}
          />
        ))}
      </div>

      {/* ── Admin ── */}
      {adminItems.length > 0 && (
        <>
          <div className="h-px bg-border mx-3 my-1" />
          <div className="px-4 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
              Admin
            </span>
          </div>
          <div className="py-1">
            {adminItems.map(({ label, icon: Icon }) => (
              <Tile variant="quiet" icon={<Icon />} title={label} key={label} onClick={() => handleItem(label)} />
            ))}
          </div>
        </>
      )}

      {lifecycle.available && (
        <>
      {/* ── Manage this agent ── */}
      <div className="h-px bg-border mx-3 my-1" />
      <div className="px-4 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
          Manage
        </span>
      </div>
      <div className="py-1">
        <Tile variant="quiet" icon={lifecycle.isArchived ? <ArchiveRestore /> : <Archive />} title={lifecycle.archiveLabel} disabled={lifecycle.isBusy} onClick={() => {
            onClose();
            void lifecycle.toggleArchived();
          }} />
        <Button variant="quiet" icon={<Trash2 />} disabled={lifecycle.isBusy} onClick={() => {
            onClose();
            void lifecycle.remove();
          }} className="w-full">
          <span className="flex-1 text-left">Delete</span>
        </Button>
      </div>
        </>
      )}
    </div>
  );
}
