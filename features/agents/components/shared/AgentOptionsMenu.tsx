"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { duplicateAgent } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
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
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { MenuTapButton } from "@/components/icons/tap-buttons";
import {
  AgentDuplicateOutcomeDialog,
  type DuplicateOutcomeState,
} from "./AgentDuplicateOutcomeDialog";

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
];

// Actions that produce something new from this agent
const AGENT_MANAGEMENT_ITEMS: MenuItem[] = [
  { label: "Create Shortcut", icon: Link2 },
  { label: "Duplicate", icon: Copy },
  { label: "Convert to Template", icon: Shield },
  { label: "Create App", icon: AppWindow },
  { label: "Add Data Storage Support", icon: Database },
];

// Global agent actions — not scoped to the current agent
const GLOBAL_AGENT_ITEMS: MenuItem[] = [
  { label: "Import Agent", icon: Upload },
];

// Items that can be opened in a new tab (have navigatable URLs).
// `basePath` lets admin surfaces (`/administration/system-agents/agents`)
// reuse this menu without escaping back to the user surface.
const NEW_TAB_ITEMS: {
  label: string;
  icon: typeof ExternalLink;
  getHref: (agentId: string, basePath: string) => string;
}[] = [
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
  { label: "Convert/Update System Agent", icon: RefreshCw },
  { label: "Find Usages (Admin)", icon: Search },
];

function comingSoon() {
  toast.info("Coming Soon");
}

/**
 * The agent menu is mounted on both user and admin surfaces. The only signal
 * we have for "I am the admin" is the route the surface declared via
 * `basePath`. This must stay in lockstep with the system-agents route in
 * `app/(authenticated)/(admin-auth)/administration/system-agents/`.
 *
 * Used to:
 *  - opt the duplicate RPC into `asSystem` mode (preserves builtin lineage)
 *  - keep navigation that bounces off this menu inside the admin shell
 */
const ADMIN_SYSTEM_AGENTS_BASE_PATH = "/administration/system-agents/agents";

function isAdminSystemAgentsContext(basePath: string): boolean {
  return basePath === ADMIN_SYSTEM_AGENTS_BASE_PATH;
}

function SoonBadge() {
  return (
    <span className="ml-2 text-[10px] font-medium text-muted-foreground/60 bg-muted rounded px-1 py-0.5 leading-none">
      soon
    </span>
  );
}

async function convertToTemplate(agentId: string): Promise<void> {
  const response = await fetch(`/api/agents/${agentId}/convert-to-template`, {
    method: "POST",
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
   *  `/administration/system-agents/agents` so internal links stay in the
   *  admin context. */
  basePath?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const dispatch = useAppDispatch();
  const pathname = usePathname();

  // Post-duplicate outcome dialog — the user picks whether to navigate to the
  // copy, open it in a new tab, or stay put. State is lifted here (rather
  // than inside the desktop/mobile branches) so the dialog survives the
  // closing of the parent dropdown / drawer that triggered the duplicate.
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateState, setDuplicateState] =
    useState<DuplicateOutcomeState>("loading");
  const [duplicatedAgentId, setDuplicatedAgentId] = useState<string | null>(
    null,
  );
  const [duplicatedAgentName, setDuplicatedAgentName] = useState<string>("");
  const [duplicateError, setDuplicateError] = useState<string>("");
  const [duplicateAsSystem, setDuplicateAsSystem] = useState(false);

  // Builtin/system agents need different menu options than user agents.
  // - "Convert to Template" is meaningless — builtins ARE the templates users
  //   fork from. Showing it would just produce a confusing redundant row in
  //   the templates table.
  // - "Convert/Update System Agent" promotes a user agent into a builtin;
  //   running it on something that's already a builtin is a no-op category
  //   error.
  // We compute one filtered version of each item list per render rather than
  // sprinkling conditionals through the JSX.
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const isBuiltin = agent?.agentType === "builtin";

  // Admin surfaces (the system-agents route family) want every action to
  // operate on the system catalogue rather than the admin's personal one.
  // The route declares this by passing `basePath`; we don't try to detect it
  // any other way so the contract stays explicit.
  const isAdminContext = isAdminSystemAgentsContext(basePath);

  /**
   * Compute where "Open new agent" / "Open in new tab" should land for the
   * duplicated copy. We mirror the user's current sub-route (e.g. `/build`,
   * `/run`, `/widgets`) so they keep the working context they were just in.
   * If the source-agent segment isn't found in the pathname (the menu is
   * rendered from a list page, etc.), the destination is the bare agent
   * overview — a sensible default.
   */
  const newAgentPath = duplicatedAgentId
    ? (() => {
        const sourceSegment = `${basePath}/${agentId}`;
        const suffix =
          pathname && pathname.startsWith(sourceSegment)
            ? pathname.slice(sourceSegment.length)
            : "";
        return `${basePath}/${duplicatedAgentId}${suffix}`;
      })()
    : null;

  /**
   * Kicks off the duplicate flow and drives the outcome dialog through
   * loading → success | error. Both the desktop dropdown row and the mobile
   * drawer item route through this function so the dialog state lives in
   * exactly one place. Each caller is responsible for closing its own
   * surrounding surface (dropdown / drawer) before invoking this.
   */
  const runDuplicate = useCallback(async () => {
    // From the admin surface, "Duplicate" must produce another system agent
    // — duplicating a builtin into a personal user agent silently smuggled
    // it out of the system catalogue (the original bug). On the user
    // surface, this is the legitimate "fork a builtin into my workspace"
    // flow so we leave it alone.
    const asSystem = isAdminContext && isBuiltin;
    setDuplicateAsSystem(asSystem);
    setDuplicatedAgentId(null);
    setDuplicatedAgentName(agent?.name ? `Copy of ${agent.name}` : "");
    setDuplicateError("");
    setDuplicateState("loading");
    setDuplicateOpen(true);

    try {
      const newId = await dispatch(
        duplicateAgent({ agentId, asSystem }),
      ).unwrap();
      setDuplicatedAgentId(newId);
      setDuplicateState("success");
    } catch (err) {
      setDuplicateError(
        err instanceof Error ? err.message : "Failed to duplicate agent.",
      );
      setDuplicateState("error");
    }
  }, [agent?.name, agentId, dispatch, isAdminContext, isBuiltin]);

  const managementItems = isBuiltin
    ? AGENT_MANAGEMENT_ITEMS.filter(
        (item) => item.label !== "Convert to Template",
      )
    : AGENT_MANAGEMENT_ITEMS;

  const adminItems = isBuiltin
    ? ADMIN_ITEMS.filter((item) => item.label !== "Convert/Update System Agent")
    : ADMIN_ITEMS;

  const handleDesktopItemClick = async (label: string) => {
    if (label === "Edit Agent Info") {
      dispatch(
        openOverlay({
          overlayId: "agentSettingsWindow",
          data: { initialAgentId: agentId },
        }),
      );
      setOpen(false);
    } else if (label === "View Run History") {
      dispatch(
        openOverlay({
          overlayId: "agentRunHistoryWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      setOpen(false);
    } else if (label === "Advanced Settings View") {
      dispatch(
        openOverlay({
          overlayId: "agentAdvancedEditorWindow",
          data: {
            initialAgentId: agentId ?? null,
            initialTab: undefined,
            tabs: null,
          },
        }),
      );
      setOpen(false);
    } else if (label === "Open Run Modal") {
      dispatch(
        openOverlay({
          overlayId: "agentRunWindow",
          data: {
            agentId: agentId ?? null,
            selectedConversationId: null,
          },
        }),
      );
      setOpen(false);
    } else if (label === "Matrx Agent Optimizer") {
      dispatch(
        openOverlay({
          overlayId: "agentOptimizerWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      setOpen(false);
    } else if (label === "Find Usages") {
      dispatch(
        openOverlay({
          overlayId: "agentFindUsagesWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      setOpen(false);
    } else if (label === "Create App") {
      dispatch(
        openOverlay({
          overlayId: "agentCreateAppWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      setOpen(false);
    } else if (label === "Add Data Storage Support") {
      dispatch(
        openOverlay({
          overlayId: "agentDataStorageWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      setOpen(false);
    } else if (label === "Convert/Update System Agent") {
      dispatch(
        openOverlay({
          overlayId: "agentConvertSystemWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      setOpen(false);
    } else if (label === "Create Shortcut") {
      dispatch(
        openOverlay({
          overlayId: "agentAdminShortcutWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      setOpen(false);
    } else if (label === "Find Usages (Admin)") {
      dispatch(
        openOverlay({
          overlayId: "agentAdminFindUsagesWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      setOpen(false);
    } else if (label === "Import Agent") {
      dispatch(openOverlay({ overlayId: "agentImportWindow", data: {} }));
      setOpen(false);
    } else if (label === "Duplicate") {
      // Close the dropdown first so the outcome dialog has a clean stage.
      // The dialog itself owns the loading / success / error UX; we just
      // delegate to the shared `runDuplicate` orchestrator.
      setOpen(false);
      void runDuplicate();
    } else if (label === "Convert to Template") {
      setIsConverting(true);
      try {
        await convertToTemplate(agentId);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save as template",
        );
      } finally {
        setIsConverting(false);
        setOpen(false);
      }
    } else {
      comingSoon();
    }
  };

  const handleInterfaceVariationClick = () => {
    dispatch(
      openOverlay({
        overlayId: "agentInterfaceVariationsWindow",
        data: { agentId: agentId ?? null },
      }),
    );
    setOpen(false);
  };

  const trigger = <MenuTapButton />;

  // Single dialog instance shared by both desktop and mobile flows. Lives at
  // the parent level so the dropdown / drawer that triggered the duplicate
  // can close cleanly without unmounting the in-flight dialog.
  const duplicateDialog = (
    <AgentDuplicateOutcomeDialog
      open={duplicateOpen}
      onOpenChange={setDuplicateOpen}
      state={duplicateState}
      newAgentName={duplicatedAgentName}
      newAgentPath={newAgentPath}
      errorMessage={duplicateError}
      asSystem={duplicateAsSystem}
    />
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={setOpen}>
          {asTapTarget ? (
            <TapTargetButton
              icon={<MoreHorizontal className="w-4 h-4" />}
              ariaLabel="Agent options"
              onClick={() => setOpen(true)}
            />
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}
          <DrawerContent className="max-h-[85dvh]">
            <DrawerTitle className="sr-only">Agent Options</DrawerTitle>
            <MobileMenuContent
              onClose={() => setOpen(false)}
              agentId={agentId}
              basePath={basePath}
              onTriggerDuplicate={runDuplicate}
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
          {/* ── This Agent ── */}
          {THIS_AGENT_ITEMS.map(({ label, icon: Icon, soon }) => {
            if (label === "View All Versions") {
              return (
                <DropdownMenuItem key={label} asChild>
                  <Link
                    href={`${basePath}/${agentId}/latest?tab=history`}
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
                onClick={() => handleDesktopItemClick(label)}
                className={cn(soon && "text-muted-foreground")}
              >
                <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="flex-1">{label}</span>
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
            const duplicateInFlight =
              duplicateOpen && duplicateState === "loading";
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
}: {
  onClose: () => void;
  agentId: string;
  basePath: string;
  /** Parent-owned duplicate orchestrator. The mobile drawer closes itself
   *  immediately after invoking this; the parent's outcome dialog takes
   *  over from there. */
  onTriggerDuplicate: () => Promise<void>;
}) {
  const [variationsOpen, setVariationsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const dispatch = useAppDispatch();

  // Same builtin-aware filtering as the desktop variant — see AgentOptionsMenu
  // for the full rationale.
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const isBuiltin = agent?.agentType === "builtin";
  const managementItems = isBuiltin
    ? AGENT_MANAGEMENT_ITEMS.filter(
        (item) => item.label !== "Convert to Template",
      )
    : AGENT_MANAGEMENT_ITEMS;
  const adminItems = isBuiltin
    ? ADMIN_ITEMS.filter((item) => item.label !== "Convert/Update System Agent")
    : ADMIN_ITEMS;

  const handleItem = async (label: string) => {
    if (label === "Edit Agent Info") {
      dispatch(
        openOverlay({
          overlayId: "agentSettingsWindow",
          data: { initialAgentId: agentId },
        }),
      );
      onClose();
    } else if (label === "View Run History") {
      dispatch(
        openOverlay({
          overlayId: "agentRunHistoryWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      onClose();
    } else if (label === "Advanced Settings View") {
      dispatch(
        openOverlay({
          overlayId: "agentAdvancedEditorWindow",
          data: {
            initialAgentId: agentId ?? null,
            initialTab: undefined,
            tabs: null,
          },
        }),
      );
      onClose();
    } else if (label === "Open Run Modal") {
      dispatch(
        openOverlay({
          overlayId: "agentRunWindow",
          data: {
            agentId: agentId ?? null,
            selectedConversationId: null,
          },
        }),
      );
      onClose();
    } else if (label === "Matrx Agent Optimizer") {
      dispatch(
        openOverlay({
          overlayId: "agentOptimizerWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      onClose();
    } else if (label === "Find Usages") {
      dispatch(
        openOverlay({
          overlayId: "agentFindUsagesWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      onClose();
    } else if (label === "Create App") {
      dispatch(
        openOverlay({
          overlayId: "agentCreateAppWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      onClose();
    } else if (label === "Add Data Storage Support") {
      dispatch(
        openOverlay({
          overlayId: "agentDataStorageWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      onClose();
    } else if (label === "Convert/Update System Agent") {
      dispatch(
        openOverlay({
          overlayId: "agentConvertSystemWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      onClose();
    } else if (label === "Create Shortcut") {
      dispatch(
        openOverlay({
          overlayId: "agentAdminShortcutWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      onClose();
    } else if (label === "Find Usages (Admin)") {
      dispatch(
        openOverlay({
          overlayId: "agentAdminFindUsagesWindow",
          data: { agentId: agentId ?? null },
        }),
      );
      onClose();
    } else if (label === "Import Agent") {
      dispatch(openOverlay({ overlayId: "agentImportWindow", data: {} }));
      onClose();
    } else if (label === "Duplicate") {
      // Close the drawer first so the outcome dialog has a clean stage —
      // mobile cannot stack a Drawer + Drawer well. The parent's
      // `onTriggerDuplicate` owns the dispatch + dialog lifecycle.
      onClose();
      void onTriggerDuplicate();
    } else if (label === "Convert to Template") {
      setIsBusy(true);
      try {
        await convertToTemplate(agentId);
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
    dispatch(
      openOverlay({
        overlayId: "agentInterfaceVariationsWindow",
        data: { agentId: agentId ?? null },
      }),
    );
    onClose();
  };

  return (
    <div className="flex flex-col overflow-y-auto max-h-[calc(85dvh-2rem)] pb-safe">
      {/* ── This Agent ── */}
      <div className="py-1">
        {THIS_AGENT_ITEMS.map(({ label, icon: Icon, soon }) => {
          if (label === "View All Versions") {
            return (
              <Link
                key={label}
                href={`${basePath}/${agentId}/latest?tab=history`}
                onClick={onClose}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-left">{label}</span>
              </Link>
            );
          }
          return (
            <button
              key={label}
              onClick={() => handleItem(label)}
              className={cn(
                "flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-muted/50 active:bg-muted/70 transition-colors",
                soon ? "text-muted-foreground" : "text-foreground",
              )}
            >
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {soon && <SoonBadge />}
            </button>
          );
        })}

        <button
          onClick={() => setVariationsOpen(!variationsOpen)}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
        >
          <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left">Try Interface Variations</span>
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform ml-1",
              variationsOpen && "rotate-90",
            )}
          />
        </button>
        {variationsOpen && (
          <div className="pl-6 bg-muted/20">
            {INTERFACE_VARIATIONS.map((v) => (
              <button
                key={v}
                onClick={handleVariationClick}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 active:bg-muted/70 transition-colors"
              >
                {v}
              </button>
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
          <button
            key={label}
            onClick={() => handleItem(label)}
            disabled={isBusy && label === "Convert to Template"}
            className={cn(
              "flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-muted/50 active:bg-muted/70 transition-colors",
              soon ? "text-muted-foreground" : "text-foreground",
            )}
          >
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            {soon && <SoonBadge />}
          </button>
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
          <button
            key={label}
            onClick={() => handleItem(label)}
            className={cn(
              "flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-muted/50 active:bg-muted/70 transition-colors",
              soon ? "text-muted-foreground" : "text-foreground",
            )}
          >
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            {soon && <SoonBadge />}
          </button>
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
              <button
                key={label}
                onClick={() => handleItem(label)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-left">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
