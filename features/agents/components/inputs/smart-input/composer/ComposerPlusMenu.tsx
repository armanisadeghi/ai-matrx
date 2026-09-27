"use client";

/**
 * The composer's + menu (brief §3, Amendment 1 A1/A5) — 300px, mode-aware,
 * with cascading submenus.
 *
 * 🚨 A FACELIFT, NOT A REBUILD. Every row opens a picker or flips a switch
 * that already exists:
 *   - attach rows open `ResourcePickerMenu` straight into its own view
 *     (`initialView` + `onExitInitialView`), so every attach behaviour — the
 *     durable file edges, Google's context directive, conversation references
 *     as context entries, URL auto-detection — is the SAME code;
 *   - Tools / Skills are the run pickers (`ToolsResourcePicker` /
 *     `SkillsResourcePicker` inside `ResourcePickerMenu`);
 *   - Connectors is `ChatConnectionsStrip` (this chat's truth) + Google;
 *   - Environment is `ComputeLensBar` + the cloud browser opener;
 *   - Preview context is the context preview panel opener;
 *   - Templates, Memory, Working doc and Scratchpad are the existing picker,
 *     memory signal and document thunks.
 * What a mode hides it hides only from view (THE ONE TABLE,
 * composer-mode-visibility.ts); nothing is turned off.
 *
 * Mobile keeps the existing bottom-sheet presentation (RunControlsMenu).
 */

import { useState, type ReactNode } from "react";
import {
  AppWindow,
  Brain,
  Eye,
  FileText,
  FolderOpen,
  Globe,
  Layers,
  Lightbulb,
  Link2,
  Mic,
  NotebookPen,
  Plug,
  Server,
  Target,
  Wrench,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import type { ResourcePickerViewId } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";
import { useRunControlCounts } from "@/features/resource-manager/resource-picker/useRunControlCounts";
import {
  useAttachResource,
  useDetachResource,
} from "@/features/agents/components/inputs/resources/attach-resource";
import { selectAttachmentCapabilities } from "@/features/agents/redux/execution-system/instance-input-capabilities/instance-input-capabilities.selectors";
import { selectWorkingDocEnabled } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { setConversationDocumentEnabledThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectIsMemoryEnabledForConversation } from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import {
  selectIsMemoryToggleRequested,
  selectMemoryToggleTarget,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { requestMemoryToggle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { prependTemplateToDraft } from "@/features/message-templates/utils/prepend-template-to-draft";
import { SmartInputMessageTemplatePicker } from "@/features/message-templates/components/SmartInputMessageTemplatePicker";
import { useOpenContextPreviewPanel } from "@/features/overlays/openers/contextPreviewPanel";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { useOpenCloudBrowserCanvas } from "@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { ActiveContextTree } from "@/features/scopes/components/active-context/ActiveContextTree";
import { ChatConnectionsStrip } from "../ChatConnectionsStrip";
import { ComputeLensBar } from "../ComputeLensBar";
import { useSandboxBindingBlocked } from "../use-compute-target-actions";
import type { Resource } from "@/features/agents/resources/types";
import {
  ComposerMenuDivider,
  ComposerMenuLabel,
  ComposerMenuRow,
  ComposerMenuSwitchRow,
  ComposerSubmenu,
} from "./ComposerMenu";
import { ComposerOutputPanel } from "./ComposerOutput";
import { composerShows, metaRowHoldsScopeAndOutput } from "./composer-mode-visibility";
import type { ComposerMode, ComposerSize } from "./composer-types";

/** Picker cascades need a definite height for their internal scroll chains. */
const PICKER_PANEL = "w-[380px] h-[min(70dvh,520px)] p-0";

interface ComposerPlusMenuProps {
  conversationId: string;
  trigger: ReactNode;
  mode: ComposerMode;
  size: ComposerSize;
  side: "top" | "bottom";
  onRequestInputExpand?: () => void;
}

export function ComposerPlusMenu({
  conversationId,
  trigger,
  mode,
  size,
  side,
  onRequestInputExpand,
}: ComposerPlusMenuProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const counts = useRunControlCounts(conversationId);
  const attachmentCapabilities = useAppSelector(selectAttachmentCapabilities(conversationId));
  const attachResource = useAttachResource(conversationId);
  const detachResource = useDetachResource(conversationId);
  const inputText = useAppSelector(selectUserInputText(conversationId));
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const openContextPreview = useOpenContextPreviewPanel();
  const openRunControlsWindow = useOpenRunControlsWindow();
  const openCloudBrowser = useOpenCloudBrowserCanvas();
  const sandboxBlocked = useSandboxBindingBlocked(conversationId);

  const workingDocEnabled = useAppSelector(selectWorkingDocEnabled(conversationId));
  const scratchEnabled = useAppSelector(selectWorkingDocEnabled(conversationId, "scratch"));
  const memoryEnabled = useAppSelector(selectIsMemoryEnabledForConversation(conversationId));
  const memoryRequested = useAppSelector(selectIsMemoryToggleRequested);
  const memoryTarget = useAppSelector(selectMemoryToggleTarget);
  const memoryOn = memoryRequested ? memoryTarget : memoryEnabled;

  const shows = (control: Parameters<typeof composerShows>[1]) => composerShows(mode, control);
  const close = () => setOpen(false);

  /** One existing picker, opened straight into its own view, in a cascade. */
  const picker = (view: Exclude<ResourcePickerViewId, null>, closeCascade: () => void) => (
    <ResourcePickerMenu
      conversationId={conversationId}
      initialView={view}
      onExitInitialView={closeCascade}
      fillHost
      onResourceSelected={(resource: Resource) => attachResource(resource)}
      onResourceDeselected={detachResource}
      onClose={close}
      attachmentCapabilities={attachmentCapabilities}
    />
  );

  const insertTemplate = (templateText: string) => {
    dispatch(setUserInputText({ conversationId, text: prependTemplateToDraft(templateText, inputText) }));
    onRequestInputExpand?.();
  };

  const supportsAudio = attachmentCapabilities?.supportsAudio === true;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — the + menu is 300px by the brief (§2 text rule) */
        side={side}
        align="start"
        sideOffset={8}
        className="flex w-[300px] max-h-[var(--radix-popover-content-available-height)] flex-col overflow-y-auto p-1"
      >
        {/* Attach — every mode */}
        <ComposerSubmenu row={{ icon: FolderOpen, label: "Add files or photos" }} panelClassName={PICKER_PANEL}>
          {(closeCascade) => picker("files", closeCascade)}
        </ComposerSubmenu>
        {supportsAudio ? (
          <ComposerSubmenu row={{ icon: Mic, label: "Record voice" }} panelClassName={PICKER_PANEL}>
            {(closeCascade) => picker("audio", closeCascade)}
          </ComposerSubmenu>
        ) : null}
        <ComposerSubmenu row={{ icon: Link2, label: "Add a link" }} panelClassName={PICKER_PANEL}>
          {(closeCascade) => picker("webpage", closeCascade)}
        </ComposerSubmenu>
        <ComposerSubmenu row={{ icon: Layers, label: "From your workspace" }} panelClassName="w-60">
          <ComposerMenuLabel>Attach from AI Matrx</ComposerMenuLabel>
          {WORKSPACE_ROWS.map((row) => (
            <ComposerSubmenu key={row.view} row={{ label: row.label }} panelClassName={PICKER_PANEL}>
              {(closeCascade) => picker(row.view, closeCascade)}
            </ComposerSubmenu>
          ))}
        </ComposerSubmenu>

        {/* At compact width Scope and Output live here (A5). */}
        {!metaRowHoldsScopeAndOutput(size) ? (
          <>
            <ComposerMenuDivider />
            <ComposerSubmenu row={{ icon: Target, label: "Scope" }} panelClassName="w-[340px] p-0">
              <ActiveContextTree conversationId={conversationId} maxHeight={360} className="w-full" />
            </ComposerSubmenu>
            <ComposerSubmenu row={{ icon: AppWindow, label: "Output" }} panelClassName="w-64">
              <ComposerOutputPanel conversationId={conversationId} />
            </ComposerSubmenu>
          </>
        ) : null}

        {shows("plus.skills") || shows("plus.tools") || shows("plus.connectors") || shows("plus.environment") ? (
          <ComposerMenuDivider />
        ) : null}
        {shows("plus.skills") ? (
          <ComposerSubmenu
            row={{ icon: Lightbulb, label: "Skills", badge: counts.skills }}
            panelClassName={PICKER_PANEL}
          >
            {(closeCascade) => picker("skills", closeCascade)}
          </ComposerSubmenu>
        ) : null}
        {shows("plus.tools") ? (
          <ComposerSubmenu row={{ icon: Wrench, label: "Tools", badge: counts.tools }} panelClassName={PICKER_PANEL}>
            {(closeCascade) => picker("tools", closeCascade)}
          </ComposerSubmenu>
        ) : null}
        {shows("plus.connectors") ? (
          <ComposerSubmenu row={{ icon: Plug, label: "Connectors" }} panelClassName="w-[360px]">
            <ComposerMenuLabel>In this chat</ComposerMenuLabel>
            <div className="px-2.5 pb-1.5">
              <ChatConnectionsStrip conversationId={conversationId} />
            </div>
            <ComposerMenuDivider />
            <ComposerSubmenu row={{ icon: Globe, label: "Google Workspace" }} panelClassName={PICKER_PANEL}>
              {(closeCascade) => picker("google", closeCascade)}
            </ComposerSubmenu>
          </ComposerSubmenu>
        ) : null}
        {shows("plus.environment") ? (
          <ComposerSubmenu row={{ icon: Server, label: "Environment" }} panelClassName="w-80">
            <ComposerEnvironmentPanel
              conversationId={conversationId}
              sandboxBlocked={sandboxBlocked}
              onOpenSandbox={() => {
                close();
                openRunControlsWindow({ conversationId, initialTab: "sandbox" });
              }}
              onOpenBrowser={() => {
                close();
                openCloudBrowser({ conversationId });
              }}
            />
          </ComposerSubmenu>
        ) : null}

        <ComposerMenuDivider />
        {shows("plus.previewContext") ? (
          <ComposerMenuRow
            icon={Eye}
            label="Preview context"
            onClick={() => {
              close();
              openContextPreview({ conversationId, agentId: agentId ?? undefined });
            }}
          />
        ) : null}
        <ComposerSubmenu row={{ icon: FileText, label: "Message templates" }} panelClassName="w-[360px] h-[min(60dvh,440px)] p-0">
          {(closeCascade) => (
            <SmartInputMessageTemplatePicker
              onSelect={(templateText) => {
                insertTemplate(templateText);
                closeCascade();
                close();
              }}
            />
          )}
        </ComposerSubmenu>
        <ComposerMenuRow
          icon={Brain}
          label="Memory"
          description={
            memoryRequested
              ? memoryTarget
                ? "Turns on with your next message"
                : "Turns off with your next message"
              : undefined
          }
          checked={memoryOn}
          onClick={() => dispatch(requestMemoryToggle({ enabled: !memoryOn }))}
        />
        {shows("plus.documents") ? (
          <>
            <ComposerMenuSwitchRow
              icon={NotebookPen}
              label="Working doc"
              checked={workingDocEnabled}
              onCheckedChange={(value) =>
                void dispatch(setConversationDocumentEnabledThunk({ conversationId, kind: "working", enabled: value }))
              }
            />
            <ComposerMenuSwitchRow
              icon={FileText}
              label="Scratchpad"
              checked={scratchEnabled}
              onCheckedChange={(value) => void dispatch(setScratchpadGateThunk({ conversationId, enabled: value }))}
            />
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const WORKSPACE_ROWS: { view: Exclude<ResourcePickerViewId, null>; label: string }[] = [
  { view: "conversations", label: "Chats" },
  { view: "tables", label: "Tables" },
  { view: "notes", label: "Notes" },
  { view: "tasks", label: "Tasks" },
  { view: "workbooks", label: "Workbooks" },
  { view: "documents", label: "Documents" },
  { view: "context_values", label: "Context values" },
];

/**
 * Environment (brief §6) — where the agent runs. The SAME menu opens from the
 * + row and from the Cloud chip (two doors, one menu). Built from the compute
 * lens (sandbox / your computer) and the cloud-browser opener. Team sandbox and
 * the per-chat Vault switch do not exist yet and are not shown.
 */
export function ComposerEnvironmentPanel({
  conversationId,
  sandboxBlocked,
  onOpenSandbox,
  onOpenBrowser,
}: {
  conversationId: string;
  sandboxBlocked: boolean;
  onOpenSandbox: () => void;
  onOpenBrowser: () => void;
}) {
  return (
    <>
      <ComposerMenuLabel>Run on</ComposerMenuLabel>
      {sandboxBlocked ? (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          This chat runs in the cloud. A sandbox or your computer cannot be attached here.
        </p>
      ) : (
        <div className="px-1.5 pb-1">
          <ComputeLensBar conversationId={conversationId} className="h-8 w-full max-w-full" onOpenPanel={onOpenSandbox} />
        </div>
      )}
      <ComposerMenuDivider />
      <ComposerMenuRow icon={AppWindow} label="Persistent browser" description="Open the agent's cloud browser" onClick={onOpenBrowser} />
      <ComposerMenuDivider />
      <ComposerMenuRow label="Manage sandboxes" detail="rename · files · new" chevron onClick={onOpenSandbox} />
    </>
  );
}
