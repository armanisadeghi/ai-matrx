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
 *   - Tools / Skills are THE run-pick surfaces (`RunToolPicker` /
 *     `RunSkillPicker`, one shared `RunPicksSurface`): on desktop a click
 *     opens them roomy in Chat Options on their tab; on the phone sheet each
 *     is a full page;
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

import { useContext, useRef, useState, type ReactNode } from "react";
import {
  AppWindow,
  AudioLines,
  Brain,
  Camera,
  Image as ImageIcon,
  Boxes,
  Cloud,
  Eye,
  CornerDownLeft,
  Cpu,
  FileText,
  FolderOpen,
  Globe,
  Lightbulb,
  Link2,
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
import { useAppDispatch, useAppSelector } from "../../../../../store/hooks";
import { ResourcePickerMenu } from "@host/features/resource-manager/resource-picker/ResourcePickerMenu";
import {
  flattenResourcePickerItems,
  type ResourcePickerViewId,
} from "@host/features/resource-manager/resource-picker/resource-picker-menu-items";
import { useKnowledgeAttachSearch } from "@ai-matrx/chat/host/ui-slots";
import { useRunControlCounts } from "@host/features/resource-manager/resource-picker/useRunControlCounts";
import {
  useAttachResource,
  useDetachResource,
} from "../../resources/attach-resource";
import { selectAttachmentCapabilities } from "../../../../redux/execution-system/instance-input-capabilities/instance-input-capabilities.selectors";
import { selectWorkingDocEnabled } from "../../../../redux/execution-system/instance-working-document/instance-working-document.selectors";
import { setConversationDocumentEnabledThunk } from "../../../../redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "../../../../redux/execution-system/instance-working-document/scratchpad.thunks";
import { selectAgentIdFromInstance } from "../../../../redux/execution-system/conversations/conversations.selectors";
import { selectIsMemoryEnabledForConversation } from "../../../../redux/execution-system/observational-memory/observational-memory.selectors";
import {
  selectMemoryToggleRequest,
  selectAutoClearConversation,
  selectSubmitOnEnter,
} from "../../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectShouldShowAutoClearToggle } from "../../../../redux/execution-system/selectors/aggregate.selectors";
import { setAutoClearMode } from "../../../../redux/execution-system/thunks/create-instance.thunk";
import { ComposerConnectorsPanel } from "./ComposerConnectorsPanel";
import { selectUserInputText } from "../../../../redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  clearMemoryToggleRequest,
  requestMemoryToggle,
  setSubmitOnEnter,
} from "../../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { setUserInputText } from "../../../../redux/execution-system/instance-user-input/instance-user-input.slice";
import { prependTemplateToDraft } from "@host/features/message-templates/utils/prepend-template-to-draft";
import { SmartInputMessageTemplatePicker } from "@host/features/message-templates/components/SmartInputMessageTemplatePicker";
import { useOpenContextPreviewPanel } from "../../../../../host/window-openers";
import { useOpenRunControlsWindow } from "../../../../../host/window-openers";
import { useOpenCloudBrowserCanvas } from "@host/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { ActiveContextTree } from "../../../../../context/sources/scopes";
import { useComputeTargetActions } from "../use-compute-target-actions";
import type { ComputeTarget } from "../../../../../compute/targets";
import { useSandboxBindingBlocked } from "../use-compute-target-actions";
import type { Resource } from "../../../../resources/types";
import {
  COMPOSER_MENU_NO_ENTRANCE,
  ignoreOwnWrapper,
  ComposerMenuCloseAllContext,
  ComposerMenuDivider,
  ComposerFoldedSection,
  ComposerMenuLabel,
  ComposerMenuLevel,
  ComposerMenuPresentationContext,
  ComposerSheetNavContext,
  ComposerMenuRow,
  ComposerMenuSwitchRow,
  ComposerSubmenu,
} from "./ComposerMenu";
import { announceComingSoon } from "@host/lib/coming-soon/announce";
import { ComposerMenuSheet } from "./ComposerMenuSheet";
import { composerShows } from "./composer-mode-visibility";
import type { ComposerMode, ComposerSize } from "./composer-types";
import { useTouchOnlyDevice } from "@host/components/official/composer/useTouchOnlyDevice";
import { QuickRunModelSelect } from "../../../run-controls/RunModelPicker";
import { RunConfigOverrides } from "../../../run-controls/RunConfigOverrides";
import { RunInputCapabilities } from "../../../run-controls/RunInputCapabilities";
import { RunToolPicker } from "../RunToolPicker";
import { RunSkillPicker } from "../RunSkillPicker";

/** A link box sizes to its content (Notion's embed popover), growing as a
 *  preview arrives, up to the screen. */
const LINK_PANEL = "w-[420px] p-0";
/** A short list that drills in place: sized to the list, then to the view. */
const CONTENT_PANEL = LINK_PANEL;

/** Picker cascades need a definite height for their internal scroll chains;
 *  the available-height cap keeps the bottom on screen. */
const PICKER_PANEL =
  "w-[420px] h-[min(600px,80dvh,var(--radix-popover-content-available-height))] p-0";

interface ComposerPlusMenuProps {
  conversationId: string;
  trigger: ReactNode;
  mode: ComposerMode;
  /** Which style hosts the menu (rows do not vary by it; width folds via the next prop). */
  size?: ComposerSize;
  /** The composer is narrow: Scope lives here (Output and Effort ride the agent menu). */
  folded?: boolean;
  /** Compact and narrow: live audio lives here too. */
  foldLiveAudio?: boolean;
  side: "top" | "bottom";
  /** The host's surface key — auto-clear keeps its display slot in step. */
  surfaceKey?: string;
  onRequestInputExpand?: () => void;
  /** "sheet" = the phone presentation (ComposerMenuSheet); same rows. */
  presentation?: "popover" | "sheet";
  /** Controlled open (the phone host's trigger owns its own click). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ComposerPlusMenu({
  conversationId,
  surfaceKey,
  trigger,
  mode,
  folded = false,
  foldLiveAudio = false,
  side,
  onRequestInputExpand,
  presentation = "popover",
  open: openProp,
  onOpenChange,
}: ComposerPlusMenuProps) {
  const dispatch = useAppDispatch();
  const touchOnly = useTouchOnlyDevice();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
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
  const picker = (
    view: Exclude<ResourcePickerViewId, null>,
    closeCascade: () => void,
    initialUploadFiles?: readonly File[],
  ) => (
    <ResourcePickerMenu
      conversationId={conversationId}
      initialView={view}
      initialUploadFiles={initialUploadFiles}
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

  // Search hands off to the ⌘K bar — the modern search, not a picker list.
  const openAttachSearch = useKnowledgeAttachSearch({
    conversationId,
    onResourceSelected: (resource: Resource) => attachResource(resource),
    onResourceDeselected: detachResource,
    attachmentCapabilities,
  });

  const body = (
        <ComposerMenuCloseAllContext.Provider value={close}>
        <ComposerMenuLevel>
        {/* Phone sheet only: Claude's Camera / Photos / Files row. */}
        <SheetQuickAdd openFiles={(files, back) => picker("files", back, files)} />
        {/* Attach — every mode */}
        {presentation === "sheet" ? null : (
          // On the phone the Files tile above is this door.
          <ComposerSubmenu row={{ icon: FolderOpen, label: "Add files or photos" }} panelClassName={PICKER_PANEL}>
            {(closeCascade) => picker("files", closeCascade)}
          </ComposerSubmenu>
        )}
        <ComposerSubmenu row={{ icon: Link2, label: "Add a link" }} panelClassName={LINK_PANEL}>
          {(closeCascade) => picker("webpage", closeCascade)}
        </ComposerSubmenu>
        <ComposerSubmenu
          row={{ icon: Boxes, label: "From your workspace" }}
          panelClassName={CONTENT_PANEL}
          drillInPlace
        >
          <div className="flex flex-col p-1.5">
            <ComposerMenuLabel>Attach from AI Matrx</ComposerMenuLabel>
            {WORKSPACE_ROWS.map((row) => (
              <ComposerSubmenu key={row.view} row={{ icon: row.icon, label: row.label }}>
                {(back) => picker(row.view, back)}
              </ComposerSubmenu>
            ))}
          </div>
        </ComposerSubmenu>
        <ComposerSubmenu
          row={{ icon: CONTEXT_VALUES_ITEM.icon, label: CONTEXT_VALUES_ITEM.label }}
          panelClassName={PICKER_PANEL}
        >
          {(closeCascade) => picker("context_values", closeCascade)}
        </ComposerSubmenu>
        <ComposerMenuRow
          icon={Search}
          label="Search your knowledge"
          detail={touchOnly ? undefined : "⌘K"}
          onClick={() => {
            close();
            openAttachSearch();
          }}
        />

        {shows("plus.skills") || shows("plus.tools") || shows("plus.connectors") || shows("plus.environment") ? (
          <ComposerMenuDivider />
        ) : null}
        {shows("plus.skills") ? (
          presentation === "sheet" ? (
            <ComposerSubmenu row={{ icon: Lightbulb, label: "Skills", badge: counts.skills }}>
              <RunSkillPicker conversationId={conversationId} />
            </ComposerSubmenu>
          ) : (
            <ComposerMenuRow
              icon={Lightbulb}
              label="Skills"
              badge={counts.skills}
              onClick={() => {
                close();
                openRunControlsWindow({ conversationId, initialTab: "skills" });
              }}
            />
          )
        ) : null}
        {shows("plus.tools") ? (
          presentation === "sheet" ? (
            // Phone: a full-height page — THE Tools surface, one pane at a time.
            <ComposerSubmenu row={{ icon: Wrench, label: "Tools", badge: counts.tools }}>
              <RunToolPicker conversationId={conversationId} />
            </ComposerSubmenu>
          ) : (
            // Desktop: a click (never a hover cascade) opens THE Tools surface
            // roomy, in Chat Options on its Tools tab.
            <ComposerMenuRow
              icon={Wrench}
              label="Tools"
              badge={counts.tools}
              onClick={() => {
                close();
                openRunControlsWindow({ conversationId, initialTab: "tools" });
              }}
            />
          )
        ) : null}
        {shows("plus.connectors") ? (
          <ComposerSubmenu row={{ icon: Plug, label: "Connections" }} panelClassName="w-[360px] h-[min(70dvh,480px)]">
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
        {/* A narrow composer (under 480px) folds Scope — and Compact's live
            audio — down here; Output and Effort ride the agent menu. */}
        {folded ? (
          <ComposerFoldedSection>
            <ComposerSubmenu row={{ icon: Target, label: "Scope" }} panelClassName="w-[340px] p-0">
              <ActiveContextTree conversationId={conversationId} maxHeight={360} className="w-full" />
            </ComposerSubmenu>
            {foldLiveAudio ? (
              <ComposerMenuRow
                icon={AudioLines}
                label="Live audio"
                onClick={() => {
                  close();
                  void announceComingSoon("chat.live-audio");
                }}
              />
            ) : null}
          </ComposerFoldedSection>
        ) : null}
        </ComposerMenuLevel>
        </ComposerMenuCloseAllContext.Provider>
  );

  if (presentation === "sheet") {
    return (
      <>
        {trigger}
        <ComposerMenuSheet open={open} onOpenChange={setOpen} accessibleName="Add to chat">
          {body}
        </ComposerMenuSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — the + menu is 300px by the brief (§2 text rule) */
        side={side}
        align="start"
        sideOffset={8}
        onPointerDownOutside={ignoreOwnWrapper}
        className={`flex w-[300px] max-h-[var(--radix-popover-content-available-height)] flex-col overflow-y-auto p-1 ${COMPOSER_MENU_NO_ENTRANCE}`}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

/** Workspace records — label and icon from the ONE item list. */
const WORKSPACE_VIEWS: Exclude<ResourcePickerViewId, null>[] = [
  "conversations",
  "tables",
  "notes",
  "tasks",
  "workbooks",
  "documents",
];
function pickerItem(view: Exclude<ResourcePickerViewId, null>) {
  const item = flattenResourcePickerItems().find((i) => i.id === view);
  if (!item) throw new Error(`ComposerPlusMenu: no picker item "${view}"`);
  return item;
}
const WORKSPACE_ROWS = WORKSPACE_VIEWS.map((view) => {
  const { label, icon } = pickerItem(view);
  return { view, label, icon };
});
const CONTEXT_VALUES_ITEM = pickerItem("context_values");

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
          Cloud-only chat; a sandbox or computer can't attach
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

/**
 * The phone sheet's top row — Claude iOS's Camera / Photos / Files. Camera
 * and Photos use the device's own pickers, then open the Files page with
 * those files already uploading through the one upload pipeline; Files opens
 * the Files page. Renders nothing in the desktop popover.
 */
function SheetQuickAdd({
  openFiles,
}: {
  openFiles: (files: readonly File[] | undefined, back: () => void) => ReactNode;
}) {
  const presentation = useContext(ComposerMenuPresentationContext);
  const nav = useContext(ComposerSheetNavContext);
  const camera = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  if (presentation !== "sheet" || !nav) return null;
  const open = (files?: readonly File[]) =>
    nav.push({ title: "Add files or photos", render: () => openFiles(files, nav.pop) });
  const fromInput = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length > 0) open(files);
  };
  const tiles = [
    { label: "Camera", icon: Camera, onClick: () => camera.current?.click() },
    { label: "Photos", icon: ImageIcon, onClick: () => photos.current?.click() },
    { label: "Files", icon: FolderOpen, onClick: () => open() },
  ];
  return (
    <div className="sheet-gap mb-6 grid shrink-0 grid-cols-3 gap-2.5">
      {tiles.map(({ label, icon: Icon, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className="flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl bg-card text-sm text-foreground active:bg-accent"
        >
          <Icon className="h-6 w-6" />
          {label}
        </button>
      ))}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => fromInput(e.currentTarget)}
      />
      <input
        ref={photos}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => fromInput(e.currentTarget)}
      />
    </div>
  );
}
