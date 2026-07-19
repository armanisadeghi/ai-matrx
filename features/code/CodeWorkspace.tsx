"use client";

import React from "react";
import { FolderTree, MessageCircle, History, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/utils";
// Side effect: register builtin library-source adapters (prompt_apps, aga_apps, tool_ui, html_pages).
import "./library-sources/registerBuiltinLibrarySources";
// Side effect: HTML Pages live preview tab (eye icon on `html-page:` tabs).
import "@/features/html-pages/code-preview/registerHtmlPageRenderPreview";
import type { FilesystemAdapter } from "./adapters/FilesystemAdapter";
import type { ProcessAdapter } from "./adapters/ProcessAdapter";
import { CodeWorkspaceProvider } from "./CodeWorkspaceProvider";
import { WorkspaceLayout } from "./layout/WorkspaceLayout";
import { EditorArea } from "./editor/EditorArea";
import { SidePanelRouter } from "./views/SidePanelRouter";
import { BottomPanel } from "./terminal/BottomPanel";
import {
  MobilePanelShell,
  type MobileShellPanel,
} from "@/features/shell/components/header/templates/MobilePanelShell";
import { useOpenCodeFileFromUrl } from "./hooks/useOpenCodeFileFromUrl";
import { useTabRealtimeWatcher } from "./hooks/useTabRealtimeWatcher";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveSandboxId } from "./redux/codeWorkspaceSlice";
import { useSandboxHeartbeat } from "@/hooks/sandbox/use-sandbox-heartbeat";

export interface CodeWorkspaceProps {
  /** Stable id used by agent tools to target this workspace instance. */
  workspaceId?: string;
  /** Initial filesystem adapter. Defaults to the mock project. */
  adapter?: FilesystemAdapter;
  /** Initial process adapter. Defaults to a mock echo adapter. */
  process?: ProcessAdapter;
  /** Optional chat surface (e.g. <AgentRunnerPage />). */
  rightSlot?: React.ReactNode;
  /** Optional chat-history sidebar (e.g. <AgentRunSidebarMenu />). */
  farRightSlot?: React.ReactNode;
  /** Whether to render the bottom status bar. */
  showStatusBar?: boolean;
  /** Override the side-panel's default width (percent). Smaller values
   *  de-emphasise the file tree on focused-edit surfaces (the agent-app
   *  editor uses ~12% instead of the canonical 18%). */
  defaultSideSize?: number;
  /**
   * When false, omit the 48px ActivityBar icon rail. On `/code` the shell
   * Large-Route menu owns those icons; the resizable side panel still
   * renders. Defaults to true.
   */
  showActivityBar?: boolean;
  /** When set, the Library panel auto-expands this source-folder
   *  (e.g. `"aga_apps"`) on first mount and keeps the others collapsed.
   *  Use on focused-edit routes where the user is working inside one
   *  specific source. */
  focusedLibrarySourceId?: string;
  className?: string;
}

/**
 * Self-contained VSCode-style workspace. Consumers render this directly from
 * a route, a window panel, a modal, or anywhere else — it owns its own
 * provider tree but relies on the app-level Redux store for slice state.
 */
export const CodeWorkspace: React.FC<CodeWorkspaceProps> = ({
  workspaceId,
  adapter,
  process,
  rightSlot,
  farRightSlot,
  showStatusBar = true,
  defaultSideSize,
  showActivityBar = true,
  focusedLibrarySourceId,
  className,
}) => {
  return (
    <CodeWorkspaceProvider
      workspaceId={workspaceId}
      initialFilesystem={adapter}
      initialProcess={process}
      focusedLibrarySourceId={focusedLibrarySourceId}
    >
      <UrlOpenFileBridge />
      <SandboxHeartbeatBridge />
      <TabRealtimeBridge />
      <div className={cn("flex h-full w-full min-h-0", className)}>
        <MobilePanelShell
          desktop={
            <WorkspaceLayout
              rightSlot={rightSlot}
              farRightSlot={farRightSlot}
              showStatusBar={showStatusBar}
              defaultSideSize={defaultSideSize}
              showActivityBar={showActivityBar}
            />
          }
          main={<EditorArea rightSlotAvailable={false} rightmost />}
          panels={buildMobilePanels(rightSlot, farRightSlot)}
        />
      </div>
    </CodeWorkspaceProvider>
  );
};

/**
 * Mobile drawer panels for the /code workspace. The activity-view switcher
 * (Explorer/Search/Git/Run/Extensions/Sandboxes/Library) already lives in
 * the shell's mobile hamburger menu via `CodeSidebarMenu` (route-menu
 * registry), so this list only needs the panels that have no other mobile
 * entry point: the resolved side-panel content itself, chat, chat history,
 * and the terminal (which stays mounted so a running session survives the
 * drawer opening and closing).
 */
function buildMobilePanels(
  rightSlot: React.ReactNode,
  farRightSlot: React.ReactNode,
): MobileShellPanel[] {
  const decoratedRightSlot = React.isValidElement(rightSlot)
    ? React.cloneElement(rightSlot as React.ReactElement<{ rightmost?: boolean }>, {
        rightmost: true,
      })
    : rightSlot;
  const decoratedFarRightSlot = React.isValidElement(farRightSlot)
    ? React.cloneElement(
        farRightSlot as React.ReactElement<{ rightmost?: boolean }>,
        { rightmost: true },
      )
    : farRightSlot;

  const panels: MobileShellPanel[] = [
    {
      id: "files",
      label: "Files",
      icon: FolderTree,
      content: <SidePanelRouter />,
    },
  ];
  if (rightSlot) {
    panels.push({
      id: "chat",
      label: "Chat",
      icon: MessageCircle,
      content: decoratedRightSlot,
    });
  }
  if (farRightSlot) {
    panels.push({
      id: "history",
      label: "History",
      icon: History,
      content: decoratedFarRightSlot,
    });
  }
  panels.push({
    id: "terminal",
    label: "Terminal",
    icon: SquareTerminal,
    content: <BottomPanel />,
    alwaysMount: true,
  });
  return panels;
}

export default CodeWorkspace;

/** Zero-render bridge that watches `?open=<codeFileId>` and opens the file.
 *  Split out into its own component so it can call hooks that depend on
 *  `CodeWorkspaceProvider` being mounted. */
const UrlOpenFileBridge: React.FC = () => {
  useOpenCodeFileFromUrl();
  return null;
};

/** Zero-render bridge that pings the orchestrator's heartbeat endpoint while a
 *  sandbox is connected so the idle-shutdown sweep doesn't reap an active
 *  editor session. Disabled (no network calls) when no sandbox is active. */
const SandboxHeartbeatBridge: React.FC = () => {
  const activeSandboxId = useAppSelector(selectActiveSandboxId);
  useSandboxHeartbeat(activeSandboxId, { enabled: Boolean(activeSandboxId) });
  return null;
};

/** Zero-render bridge that opens a Supabase Realtime subscription for every
 *  open library-source-backed tab so we hear about remote edits while the
 *  user is in the middle of typing. Refreshes the optimistic-concurrency
 *  watermark and warns on dirty tabs whose row moved on. */
const TabRealtimeBridge: React.FC = () => {
  useTabRealtimeWatcher();
  return null;
};
