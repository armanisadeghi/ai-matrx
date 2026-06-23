"use client";

/**
 * MultiFileSmartCodeEditorWindow
 *
 * Multi-file code editor (from `CodeEditorWindow`) fused with the agent
 * lifecycle (from `SmartCodeEditorModal`). One agent conversation is
 * launched per window; the widget handle + IDE context are always wired
 * to the currently ACTIVE file, so the agent sees whichever file the
 * user is looking at.
 *
 * This is intentionally the simplest-possible combination of the two
 * systems. Richer per-file context mappings (e.g. exposing every open
 * file as a separate `vsc_*` context slot) are a follow-up — the event
 * surface in `callbacks.ts` is designed to support them without touching
 * this component.
 *
 * Event channel:
 *   Handlers NEVER enter Redux. The opener creates a callback group via
 *   `createMultiFileSmartCodeEditorCallbackGroup`, passes the resulting
 *   `callbackGroupId` through `openOverlay`'s `data`, and this window
 *   emits events (`file-change`, `active-file-change`, `agent-complete`,
 *   …) onto the group. See `./callbacks.ts` for the event surface.
 *
 * Ephemerality:
 *   Registered with `ephemeral: true` — the live agent stream cannot be
 *   restored across reloads, so no DB row is written.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pencil,
  Eye,
  Copy,
  Check,
  WrapText,
  Map as MapIcon,
  Zap,
  FolderOpen,
  CircleDot
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import CodeSidebar from "@/features/code-editor/multi-file-core/CodeSidebar";
import SmallCodeEditor from "@/features/code-editor/components/code-block/SmallCodeEditor";
import { getLanguageIconNode } from "@/features/code-editor/components/code-block/LanguageDisplay";
import { CodeEditorTabBar } from "@/features/window-panels/windows/code/CodeEditorTabBar";
import { useCodeEditorWindowState } from "@/features/window-panels/windows/code/useCodeEditorWindowState";
import type { CodeFile } from "@/features/code-editor/multi-file-core/types";

import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { useCodeEditorWidgetHandle } from "@/features/code-editor/agent-code-editor/hooks/useCodeEditorWidgetHandle";
import { useIdeContextSync } from "@/features/code-editor/agent-code-editor/hooks/useIdeContextSync";
import { SMART_CODE_EDITOR_SURFACE_KEY } from "@/features/code-editor/agent-code-editor/constants";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { setInputPlaceholder } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

import { useMultiFileSmartCodeEditorEmitter } from "./useMultiFileSmartCodeEditorEmitter";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MultiFileSmartCodeEditorWindowProps {
  /** Overlay instanceId — stable across re-renders, unique per window. */
  windowInstanceId: string;
  /** Callback group from the caller (via `useOpenMultiFileSmartCodeEditorWindow`). */
  callbackGroupId?: string | null;

  // From overlay `data`:
  /** Agent UUID to launch. Required. */
  agentId: string;
  /** Initial file set. */
  files: CodeFile[];
  /** Optionally pin which file starts active. Defaults to `files[0]`. */
  initialActiveFile?: string | null;
  /** Editor header + WindowPanel title. */
  title?: string | null;
  defaultWordWrap?: "on" | "off";
  autoFormatOnOpen?: boolean;
  /** Optional per-turn variable seed forwarded to `launchAgentExecution`. */
  variables?: Record<string, unknown> | null;

  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MultiFileSmartCodeEditorWindow({
  windowInstanceId,
  callbackGroupId,
  agentId,
  files: initialFiles,
  initialActiveFile = null,
  title,
  defaultWordWrap = "off",
  autoFormatOnOpen = false,
  variables,
  onClose,
}: MultiFileSmartCodeEditorWindowProps) {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((s) => s.theme.mode);

  // ── Multi-file state ─────────────────────────────────────────────────────
  const {
    files,
    setFiles,
    currentFile,
    openTabs,
    activeTab,
    openFile,
    closeTab,
    selectTab,
    isEditing,
    setIsEditing,
    showWrapLines,
    setShowWrapLines,
    minimapEnabled,
    setMinimapEnabled,
    formatTrigger,
    isCopied,
    handleContentChange: baseHandleContentChange,
    handleCopy,
    handleFormat,
    getEditorPath,
    mapLanguageForMonaco,
    editorWrapperRef,
    editorHeight,
  } = useCodeEditorWindowState({
    initialFiles,
    initialActiveFile,
  });

  // Latest files ref — used by the widget handle + window-close snapshot
  // so those closures always see the freshest content without re-registering.
  const filesRef = useRef(files);
  filesRef.current = files;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // ── Launch lifecycle state ───────────────────────────────────────────────
  const [conversationId, setConversationId] = useState<string | null>(null);
  const launchedIdRef = useRef<string | null>(null);

  // ── Emitter ──────────────────────────────────────────────────────────────
  const { emit } = useMultiFileSmartCodeEditorEmitter(
    callbackGroupId,
    windowInstanceId,
    () =>
      filesRef.current.map((f) => ({
        path: f.path,
        language: f.language,
        content: f.content,
      })),
  );

  // Sync input placeholder into Redux whenever the active file or conversationId changes.
  useEffect(() => {
    if (!conversationId) return;
    dispatch(
      setInputPlaceholder({
        conversationId,
        value: currentFile
          ? `Describe the changes you want in ${currentFile.name}…`
          : "Open a file to start a conversation…",
      }),
    );
  }, [conversationId, currentFile, dispatch]);

  // Emit active-file-change whenever activeTab flips (including open/close).
  const lastEmittedActiveRef = useRef<string | null>(activeTab);
  useEffect(() => {
    if (lastEmittedActiveRef.current === activeTab) return;
    lastEmittedActiveRef.current = activeTab;
    emit({ type: "active-file-change", path: activeTab });
  }, [activeTab, emit]);

  // ── File mutation pipeline ───────────────────────────────────────────────
  // User edits via Monaco go through baseHandleContentChange; we wrap it so
  // we can emit a file-change event (fromAgent: false).
  const handleUserContentChange = useCallback(
    (content: string | undefined) => {
      if (content === undefined) return;
      const path = activeTabRef.current;
      if (!path) return;
      baseHandleContentChange(content);
      const f = filesRef.current.find((x) => x.path === path);
      emit({
        type: "file-change",
        path,
        language: f?.language ?? "plaintext",
        content,
        fromAgent: false,
      });
    },
    [baseHandleContentChange, emit],
  );

  // Agent-driven mutations (via the widget handle) call this — it writes
  // into the active file and emits a file-change event (fromAgent: true).
  const handleAgentCodeChange = useCallback(
    (nextCode: string) => {
      const path = activeTabRef.current;
      if (!path) return;
      setFiles((prev) =>
        prev.map((f) => (f.path === path ? { ...f, content: nextCode } : f)),
      );
      const f = filesRef.current.find((x) => x.path === path);
      emit({
        type: "file-change",
        path,
        language: f?.language ?? "plaintext",
        content: nextCode,
        fromAgent: true,
      });
    },
    [setFiles, emit],
  );

  // ── File-open / file-close wrappers (emit events) ────────────────────────
  const handleOpenFile = useCallback(
    (path: string) => {
      openFile(path);
      emit({ type: "file-open", path });
    },
    [openFile, emit],
  );
  const handleCloseTab = useCallback(
    (path: string, e?: React.MouseEvent) => {
      closeTab(path, e);
      emit({ type: "file-close", path });
    },
    [closeTab, emit],
  );

  // ── Widget handle (agent tool-call surface) ──────────────────────────────
  // Legacy LIVE mode — this window doesn't have a review stage, so widget
  // edits are applied immediately via `onCodeChange`. (The SmartCodeEditor
  // surface, in contrast, runs in buffered mode and flushes at stream-end.)
  const { widgetHandleId } = useCodeEditorWidgetHandle({
    code: currentFile?.content ?? "",
    onCodeChange: handleAgentCodeChange,
    onComplete: () => {
      emit({
        type: "agent-complete",
        conversationId: launchedIdRef.current ?? "",
        activePath: activeTabRef.current,
      });
    },
    onError: (err) => {
      emit({
        type: "agent-error",
        message:
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Unknown agent error",
      });
    },
  });

  // ── IDE context sync (vsc_* keys) — always for the active file ───────────
  useIdeContextSync(conversationId, {
    code: currentFile?.content ?? "",
    language: currentFile?.language ?? "plaintext",
    filePath: currentFile?.path,
  });

  // ── Launch lifecycle ─────────────────────────────────────────────────────
  const variablesRef = useRef(variables);
  variablesRef.current = variables;

  useEffect(() => {
    if (launchedIdRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await dispatch(
          launchAgentExecution({
            agentId,
            surfaceKey: SMART_CODE_EDITOR_SURFACE_KEY,
            sourceFeature: "code-editor",
            apiEndpointMode: "agent",
            config: {
              displayMode: "direct",
              autoRun: false,
              allowChat: true,
            },
            runtime: {
              widgetHandleId,
              ...(variablesRef.current
                ? { variables: variablesRef.current }
                : {}),
            },
          }),
        ).unwrap();

        if (cancelled) {
          dispatch(destroyInstanceIfAllowed(result.conversationId));
          return;
        }

        launchedIdRef.current = result.conversationId;
        setConversationId(result.conversationId);
        emit({ type: "launched", conversationId: result.conversationId });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[MultiFileSmartCodeEditorWindow] launch failed", err);
        emit({
          type: "agent-error",
          message:
            err instanceof Error
              ? err.message
              : typeof err === "string"
                ? err
                : "Failed to launch agent",
        });
      }
    })();

    return () => {
      cancelled = true;
      const id = launchedIdRef.current;
      if (id) {
        launchedIdRef.current = null;
        dispatch(destroyInstanceIfAllowed(id));
      }
    };
  }, [agentId, widgetHandleId, dispatch, emit]);

  // ── Persistence collect (ephemeral, but called by WindowPanel) ───────────
  const collectData = useCallback(
    (): Record<string, unknown> => ({
      // callbackGroupId + agent conversation state are deliberately omitted
      // (they cannot survive a reload). We keep the file shape + agent id so
      // the row — if it ever becomes non-ephemeral — is self-describing.
      agentId,
      files,
      activeFile: activeTab,
      title: title ?? null,
    }),
    [agentId, files, activeTab, title],
  );

  // ── Derived editor props ─────────────────────────────────────────────────
  const editorPath = currentFile ? getEditorPath(currentFile) : undefined;
  const monacoLanguage = currentFile
    ? mapLanguageForMonaco(currentFile.language)
    : "plaintext";

  // Remount Monaco per file-path so "initialCode" is re-applied cleanly
  // when the agent rewrites the file via a tool call. Without a path-based
  // key, Monaco keeps the old buffer content even after we setFiles().
  const editorKey = useMemo(
    () =>
      currentFile
        ? `${currentFile.path}::${currentFile.content.length}::${currentFile.content.slice(0, 64)}`
        : "empty",
    [currentFile],
  );

  return (
    <WindowPanel
      id={`multi-file-smart-code-editor-window-${windowInstanceId}`}
      title={title ?? "Smart Multi-file Editor"}
      overlayId="multiFileSmartCodeEditorWindow"
      minWidth={760}
      minHeight={480}
      width={1200}
      height={780}
      position="center"
      onClose={onClose}
      onCollectData={collectData}
      sidebar={
        <CodeSidebar
          files={files}
          activeFile={activeTab ?? ""}
          handleFileSelect={handleOpenFile}
          className="border-r-0 w-full"
        />
      }
      sidebarDefaultSize={200}
      sidebarMinSize={140}
      sidebarExpandsWindow
      defaultSidebarOpen
      // ── Header chrome ──────────────────────────────────────────────────
      // Left: active-file identity + "launching agent" indicator.
      // Right: the editor action strip (edit/format/wrap/minimap/copy).
      // Both read the already-hoisted `useCodeEditorWindowState` state, so the
      // body stays content-only.
      actionsLeft={
        currentFile ? (
          <ActiveFileIndicator
            currentFile={currentFile}
            conversationId={conversationId}
          />
        ) : undefined
      }
      actionsRight={
        currentFile ? (
          <EditorActionStrip
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            handleFormat={handleFormat}
            showWrapLines={showWrapLines}
            setShowWrapLines={setShowWrapLines}
            minimapEnabled={minimapEnabled}
            setMinimapEnabled={setMinimapEnabled}
            handleCopy={handleCopy}
            isCopied={isCopied}
          />
        ) : undefined
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {/* ── Body ──────────────────────────────────────────────────────────
          Content only: the tab bar, the active file's editor, and the agent
          composer the user types into. The editor toolbar + active-file
          identity now live in the header slots (above).

          The agent composer stays in the body (NOT the `footer` slot): the
          WindowPanel footer bar hardcodes compact metadata-bar styling
          (`text-xs`, `[&_button]:h-5`, `[&_svg]:h-3`) that would crush the
          multi-row `SmartAgentInput` composer (36px send button, 14px icons,
          textarea). A rich-footer escape hatch on WindowPanel is the missing
          primitive — see FEATURE.md follow-up. The composer is the user's
          input surface (like a chat composer), so it reads as content. */}
      <CodeEditorTabBar
        openTabs={openTabs}
        activeTab={activeTab}
        files={files}
        onTabClick={selectTab}
        onTabClose={handleCloseTab}
      />

      {currentFile ? (
        <div ref={editorWrapperRef} className="flex-1 min-h-0">
          <SmallCodeEditor
            key={editorKey}
            path={editorPath}
            language={monacoLanguage}
            initialCode={currentFile.content}
            onChange={handleUserContentChange}
            mode={mode}
            autoFormat={autoFormatOnOpen}
            defaultWordWrap={defaultWordWrap}
            height={editorHeight}
            readOnly={!isEditing || currentFile.readOnly}
            formatTrigger={formatTrigger}
            controlledWordWrap={showWrapLines ? "on" : "off"}
            controlledMinimap={minimapEnabled}
            showFormatButton={false}
            showCopyButton={false}
            showResetButton={false}
            showWordWrapToggle={false}
            showMinimapToggle={false}
          />
        </div>
      ) : (
        <EmptyState files={files} onOpenFile={handleOpenFile} />
      )}

      {/* Agent composer — the user's input surface for the embedded agent. */}
      <div className="px-2 py-2 border-t shrink-0 bg-background">
        <SmartAgentInput
          conversationId={conversationId}
          sendButtonVariant="default"
          uploadBucket="userContent"
          uploadPath="code-editor-attachments"
          enablePasteImages={true}
          surfaceKey={SMART_CODE_EDITOR_SURFACE_KEY}
          disableSend={!currentFile}
        />
      </div>
    </WindowPanel>
  );
}

// ─── Header units (slot content) ──────────────────────────────────────────────

/** `actionsLeft` slot — active-file identity + agent-launch indicator. */
function ActiveFileIndicator({
  currentFile,
  conversationId,
}: {
  currentFile: CodeFile;
  conversationId: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
      <span className="shrink-0">
        {getLanguageIconNode(currentFile.language, false, currentFile.icon)}
      </span>
      <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate font-mono">
        {currentFile.path}
      </span>
      {!conversationId && (
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-2 shrink-0">
          <CircleDot className="w-3 h-3" /> Launching agent…
        </span>
      )}
    </div>
  );
}

/** `actionsRight` slot — the editor action strip. */
function EditorActionStrip({
  isEditing,
  setIsEditing,
  handleFormat,
  showWrapLines,
  setShowWrapLines,
  minimapEnabled,
  setMinimapEnabled,
  handleCopy,
  isCopied,
}: {
  isEditing: boolean;
  setIsEditing: (next: boolean) => void;
  handleFormat: () => void;
  showWrapLines: boolean;
  setShowWrapLines: (next: boolean) => void;
  minimapEnabled: boolean;
  setMinimapEnabled: (next: boolean) => void;
  handleCopy: () => void;
  isCopied: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <ActionBtn
        onClick={() => setIsEditing(!isEditing)}
        active={isEditing}
        title={isEditing ? "Switch to read-only" : "Edit file"}
      >
        {isEditing ? (
          <Eye className="w-3.5 h-3.5" />
        ) : (
          <Pencil className="w-3.5 h-3.5" />
        )}
      </ActionBtn>

      <ActionBtn
        onClick={handleFormat}
        disabled={!isEditing}
        title="Format document"
      >
        <Zap className="w-3.5 h-3.5" />
      </ActionBtn>

      <span className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5" />

      <ActionBtn
        onClick={() => setShowWrapLines(!showWrapLines)}
        active={showWrapLines}
        title={showWrapLines ? "Disable word wrap" : "Enable word wrap"}
      >
        <WrapText className="w-3.5 h-3.5" />
      </ActionBtn>

      <ActionBtn
        onClick={() => setMinimapEnabled(!minimapEnabled)}
        active={minimapEnabled}
        title={minimapEnabled ? "Hide minimap" : "Show minimap"}
      >
        <MapIcon className="w-3.5 h-3.5" />
      </ActionBtn>

      <span className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5" />

      <ActionBtn onClick={handleCopy} title="Copy file contents">
        {isCopied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </ActionBtn>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  files,
  onOpenFile,
}: {
  files: CodeFile[];
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6 py-8">
      <FolderOpen className="w-10 h-10 text-gray-300 dark:text-gray-600" />
      {files.length > 0 ? (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select a file from the sidebar to open it
          </p>
          <div className="flex flex-col gap-1.5 w-full max-w-xs mt-2">
            {files.map((f) => (
              <button
                key={f.path}
                onClick={() => onOpenFile(f.path)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-left rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              >
                {getLanguageIconNode(f.language, true, f.icon)}
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No files loaded.
        </p>
      )}
    </div>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center w-6 h-6 rounded transition-colors",
        active
          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
          : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200",
        disabled && "opacity-35 cursor-not-allowed pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

export default MultiFileSmartCodeEditorWindow;
