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
 *   - Connectors is `ComposerConnectorsPanel` (every connector: on/off per
 *     chat, reconnect, choose repositories/files, browse all) + Google files;
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
  Cloud,
  Eye,
  CornerDownLeft,
  Cpu,
  FileText,
  FolderOpen,
  Globe,
  Layers,
  Lightbulb,
  Link2,
  Mic,
  Monitor,
  NotebookPen,
  Plug,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
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
  selectBuilderAdvancedSettings,
  selectMemoryToggleRequest,
  selectAutoClearConversation,
  selectSubmitOnEnter,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectShouldShowAutoClearToggle } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { setAutoClearMode } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { ComposerConnectorsPanel } from "./ComposerConnectorsPanel";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  clearMemoryToggleRequest,
  requestMemoryToggle,
  setBuilderAdvancedSettings,
  setSubmitOnEnter,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { prependTemplateToDraft } from "@/features/message-templates/utils/prepend-template-to-draft";
import { SmartInputMessageTemplatePicker } from "@/features/message-templates/components/SmartInputMessageTemplatePicker";
import { useOpenContextPreviewPanel } from "@/features/overlays/openers/contextPreviewPanel";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { useOpenCloudBrowserCanvas } from "@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { ActiveContextTree } from "@/features/scopes/components/active-context/ActiveContextTree";
import { useComputeTargetActions } from "../use-compute-target-actions";
import type { ComputeTarget } from "@/hooks/sandbox/use-compute-targets";
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
import { useTouchOnlyDevice } from "@/components/official/composer/useTouchOnlyDevice";
import { QuickRunModelSelect } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { RunInputCapabilities } from "@/features/agents/components/run-controls/RunInputCapabilities";

/** Picker cascades need a definite height for their internal scroll chains. */
const PICKER_PANEL = "w-[380px] h-[min(70dvh,520px)] p-0";

interface ComposerPlusMenuProps {
  conversationId: string;
  trigger: ReactNode;
  mode: ComposerMode;
  size: ComposerSize;
  side: "top" | "bottom";
  /** The host's surface key — auto-clear keeps its display slot in step. */
  surfaceKey?: string;
  onRequestInputExpand?: () => void;
}

export function ComposerPlusMenu({
  conversationId,
  surfaceKey,
  trigger,
  mode,
  size,
  side,
  onRequestInputExpand,
}: ComposerPlusMenuProps) {
  const dispatch = useAppDispatch();
  const touchOnly = useTouchOnlyDevice();
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

  const advancedSettings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ?? DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const workingDocEnabled = useAppSelector(selectWorkingDocEnabled(conversationId));
  const scratchEnabled = useAppSelector(selectWorkingDocEnabled(conversationId, "scratch"));
  const memoryEnabled = useAppSelector(selectIsMemoryEnabledForConversation(conversationId));
  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));
  const autoClear = useAppSelector(selectAutoClearConversation(conversationId));
  const showAutoClear = useAppSelector(selectShouldShowAutoClearToggle(conversationId));
  const pendingMemory = useAppSelector(selectMemoryToggleRequest(conversationId));
  const memoryRequested = pendingMemory !== undefined;
  const memoryTarget = pendingMemory === true;
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
        {/* The classic attach list in full — knowledge search (⌘K) first, then
            every source (image / file / YouTube URLs, cloud browser, …): nothing
            the old + offered is out of reach. */}
        <ComposerSubmenu row={{ icon: Search, label: "Search your knowledge" }} panelClassName={PICKER_PANEL}>
          {() => (
            <ResourcePickerMenu
              conversationId={conversationId}
              fillHost
              onResourceSelected={(resource: Resource) => attachResource(resource)}
              onResourceDeselected={detachResource}
              onClose={close}
              attachmentCapabilities={attachmentCapabilities}
            />
          )}
        </ComposerSubmenu>

        {/* At compact width Scope and Output live here (A5). */}
        {!metaRowHoldsScopeAndOutput(size) ? (
          <>
            <ComposerMenuDivider />
            <ComposerSubmenu row={{ icon: Target, label: "Scope" }} panelClassName="w-[340px] p-0">
              <ActiveContextTree conversationId={conversationId} maxHeight={360} className="w-full" />
            </ComposerSubmenu>
            <ComposerSubmenu row={{ icon: AppWindow, label: "Output" }} panelClassName="w-80">
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
            {(closeCascade) => (
              <div className="flex h-full min-h-0 flex-col">
                {/* Brief §4: the server may hand the agent tools the chat
                    needs (a RAG tool for a large document). The same
                    per-conversation switch Advanced Settings carries, worded
                    as what it does. */}
                <div className="shrink-0 p-1">
                  <ComposerMenuSwitchRow
                    label="Let the server add tools"
                    description="e.g. a search tool when you attach a large document"
                    checked={!(advancedSettings.disableToolInjection ?? false)}
                    onCheckedChange={(allow) =>
                      dispatch(
                        setBuilderAdvancedSettings({
                          conversationId,
                          changes: { disableToolInjection: !allow },
                        }),
                      )
                    }
                  />
                </div>
                <div className="min-h-0 flex-1">{picker("tools", closeCascade)}</div>
              </div>
            )}
          </ComposerSubmenu>
        ) : null}
        {shows("plus.connectors") ? (
          <ComposerSubmenu row={{ icon: Plug, label: "Connectors" }} panelClassName="w-[360px]">
            <ComposerConnectorsPanel conversationId={conversationId} onNavigate={close} />
            <ComposerSubmenu row={{ icon: Globe, label: "Google Workspace files" }} panelClassName={PICKER_PANEL}>
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
              onChosen={close}
            />
          </ComposerSubmenu>
        ) : null}
        {shows("plus.model") ? (
          // The model is secondary to the agent (an agent is built with one) —
          // here, beside the per-run overrides, in every mode.
          <ComposerSubmenu row={{ icon: Cpu, label: "Model and overrides" }} panelClassName="w-[360px] h-[min(70dvh,520px)] p-0">
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 p-1.5">
                <QuickRunModelSelect conversationId={conversationId} className="h-8 w-full" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <RunConfigOverrides conversationId={conversationId} />
                <RunInputCapabilities conversationId={conversationId} />
              </div>
            </div>
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
          onClick={() => {
            const next = !memoryOn;
            // Back to what the conversation already has = nothing to send.
            if (next === memoryEnabled) dispatch(clearMemoryToggleRequest({ conversationId }));
            else dispatch(requestMemoryToggle({ conversationId, enabled: next }));
          }}
        />
        {shows("plus.enterSends") && !touchOnly ? (
          <ComposerMenuSwitchRow
            icon={CornerDownLeft}
            label="Enter sends"
            description={submitOnEnter ? "Shift+Enter adds a new line" : "Enter adds a new line; ⌘/Ctrl+Enter sends"}
            checked={submitOnEnter}
            onCheckedChange={(value) => dispatch(setSubmitOnEnter({ conversationId, value }))}
          />
        ) : null}
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
        {showAutoClear ? (
          <ComposerMenuSwitchRow
            icon={RefreshCcw}
            label="Auto-clear"
            description={autoClear ? "Each send starts a fresh conversation" : "The conversation continues"}
            checked={autoClear}
            onCheckedChange={(value) => dispatch(setAutoClearMode({ conversationId, value, surfaceKey }))}
          />
        ) : null}
        <ComposerMenuDivider />
        {/* Every setting this chat has, in the full Chat Options window — in every
            mode, always, until the new menu carries all of it (Arman, 2026-09-27). */}
        <ComposerMenuRow
          icon={SlidersHorizontal}
          label="All options"
          onClick={() => {
            close();
            openRunControlsWindow({ conversationId });
          }}
        />
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
 * Environment (brief §6) — where the agent runs, as ONE flat list: Cloud, then
 * every computer and sandbox this person can use. One click chooses (Arman,
 * 2026-09-27: no nested components, no nested clicks). The SAME list opens
 * from the Cloud chip and from + › Environment. Data and the bind are
 * `useComputeTargetActions` — the one binding path.
 */
export function ComposerEnvironmentPanel({
  conversationId,
  sandboxBlocked,
  onOpenSandbox,
  onOpenBrowser,
  onChosen,
}: {
  conversationId: string;
  sandboxBlocked: boolean;
  onOpenSandbox: () => void;
  onOpenBrowser: () => void;
  /** A choice was made — the host closes its menu. */
  onChosen?: () => void;
}) {
  const compute = useComputeTargetActions(conversationId);
  const bound = compute.boundView;
  const choose = (target: ComputeTarget | null) => {
    if ((target?.id ?? null) !== (bound?.rowId ?? null)) compute.applyBinding(target);
    onChosen?.();
  };
  // The bound box first in its group even when it is asleep or gone (named, never dropped).
  const rows: { id: string; name: string; kind: ComputeTarget["kind"]; target: ComputeTarget | null; note?: string }[] = [
    ...(bound
      ? [{
          id: bound.rowId,
          name: bound.name,
          kind: bound.kind,
          target: bound.target,
          note: bound.state === "asleep" ? "Asleep" : bound.state === "gone" ? "Gone" : bound.state === "checking" ? "Checking…" : undefined,
        }]
      : []),
    ...compute.availableTargets.map((target) => ({ id: target.id, name: target.name, kind: target.kind, target })),
  ];
  const computers = rows.filter((row) => row.kind === "local-pc");
  const sandboxes = rows.filter((row) => row.kind !== "local-pc");
  const renderRow = (row: (typeof rows)[number]) => (
    <ComposerMenuRow
      key={row.id}
      icon={row.kind === "local-pc" ? Monitor : Server}
      label={row.name}
      detail={row.note}
      checked={row.id === bound?.rowId}
      disabled={sandboxBlocked || !row.target}
      onClick={() => row.target && choose(row.target)}
    />
  );

  return (
    <>
      <ComposerMenuLabel>Run on</ComposerMenuLabel>
      <ComposerMenuRow
        icon={Cloud}
        label="Cloud"
        description="AI Matrx runs it for you"
        checked={!bound}
        onClick={() => choose(null)}
      />
      {sandboxBlocked ? (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          This chat runs in the cloud only — a sandbox or your computer cannot be attached here.
        </p>
      ) : compute.loading && rows.length === 0 ? (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Looking for your computers and sandboxes…</p>
      ) : (
        <>
          {computers.length > 0 ? <ComposerMenuLabel>Your computers</ComposerMenuLabel> : null}
          {computers.map(renderRow)}
          {sandboxes.length > 0 ? <ComposerMenuLabel>Sandboxes</ComposerMenuLabel> : null}
          {sandboxes.map(renderRow)}
        </>
      )}
      <ComposerMenuDivider />
      <ComposerMenuRow icon={AppWindow} label="Persistent browser" description="Open the agent's cloud browser" onClick={onOpenBrowser} />
      <ComposerMenuRow icon={Plus} label="Add a sandbox or computer" onClick={onOpenSandbox} />
    </>
  );
}
