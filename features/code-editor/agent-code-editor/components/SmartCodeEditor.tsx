"use client";

/**
 * SmartCodeEditor — the 4-column agent-native code-editor surface.
 *
 * Layout (all columns resizable):
 *   ┌──────────┬──────────────────┬──────────────┬─────────┐
 *   │ History  │ Agent Runner     │ Code / Diff  │ Files   │
 *   │ (drafts  │ (picker +        │ (in-place    │ (multi- │
 *   │  merge)  │  conversation +  │  swap)       │  file)  │
 *   │          │  SmartAgentInput)│              │         │
 *   └──────────┴──────────────────┴──────────────┴─────────┘
 *
 * File state is owned by the shared `useCodeEditorWindowState` hook — same
 * one `CodeEditorWindow` and `MultiFileSmartCodeEditorWindow` use. That
 * means we inherit the proven tab + file-content + toolbar state machine
 * for free, and the UI is visually identical to those surfaces.
 *
 * Agent state:
 *   - Widget handle registered ONCE per editor mount (reused across every
 *     conversation launched from this editor).
 *   - Widget tool calls BUFFER — they don't mutate `code` live. At stream-
 *     end `useSmartCodeEditor` flushes the buffer and transitions the UI
 *     to the full 4-tab `ReviewStage`.
 *   - IDE context + other-file context slots dispatch into the active
 *     conversation's `instanceContext` on every relevant change.
 *   - First-turn variable is seeded from the active file's code per agent
 *     (`codeVariableKey`).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { editor as MonacoEditorNs } from "monaco-editor";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createSmartCodeEditorScope,
  smartCodeEditorManifest,
} from "@/features/surfaces/manifests/smart-code-editor.manifest";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { pct } from "@/components/matrx/resizable/pct";
import { useCodeEditorWindowState } from "@/features/window-panels/windows/code/useCodeEditorWindowState";
import type { CodeFile } from "@/features/code-editor/multi-file-core/types";

import { useCodeEditorWidgetHandle } from "../hooks/useCodeEditorWidgetHandle";
import { useIdeContextSync } from "../hooks/useIdeContextSync";
import { useSmartCodeEditor } from "../hooks/useSmartCodeEditor";
import { CodeEditorHistoryPanel } from "./parts/CodeEditorHistoryPanel";
import { AgentRunnerColumn } from "./parts/AgentRunnerColumn";
import { CodeOrDiffColumn } from "./parts/CodeOrDiffColumn";
import { FilesPanel } from "./parts/FilesPanel";
import { TerminalPlaceholder } from "./parts/TerminalPlaceholder";
import { SMART_CODE_EDITOR_SURFACE_KEY } from "../constants";
import type { CodeEditorAgentConfig } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SINGLE_FILE_PATH = "__single_file__";

/**
 * Build a stable, Claude-friendly context key for another file. The agent
 * retrieves via `ctx_get("file_<slug>")`.
 */
function fileContextKey(filePath: string, fileName: string): string {
  const rawSlug = fileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const slug =
    rawSlug.length > 0 ? rawSlug : filePath.replace(/[^a-z0-9]/gi, "_");
  return `file_${slug}`;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface SmartCodeEditorProps {
  /** The set of agents the editor supports. First agent is the picker default. */
  agents: CodeEditorAgentConfig[];
  /** Initial picker-selected agent id. Defaults to `agents[0]`. */
  defaultPickerAgentId?: string;

  /** Single-file content (ignored when `files` is provided). */
  initialCode?: string;
  /** Language identifier (single-file mode, or fallback when a file omits one). */
  language: string;
  /** Fires every time the active file's code changes. */
  onCodeChange?: (code: string, filePath: string | null) => void;

  /** Multi-file mode — when provided, activates the Files column. */
  files?: CodeFile[];
  /** Which file is active on mount (default: files[0].path). */
  initialActiveFilePath?: string;

  // ── Optional IDE context (fed into vsc_* slots) ────────────────────────────
  filePath?: string;
  selection?: string;
  diagnostics?: string;
  workspaceName?: string;
  workspaceFolders?: string;
  gitBranch?: string;
  gitStatus?: string;
  agentSkills?: string;

  /** Ignored — the window/modal shell already renders the title. Kept for API compat. */
  title?: string;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SmartCodeEditor({
  agents,
  defaultPickerAgentId,
  initialCode = "",
  language,
  onCodeChange,
  files,
  initialActiveFilePath,
  filePath,
  selection,
  diagnostics,
  workspaceName,
  workspaceFolders,
  gitBranch,
  gitStatus,
  agentSkills,
  title,
  className,
}: SmartCodeEditorProps) {
  void title; // intentionally unused — window shell renders the title.

  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { launchAgent } = useAgentLauncher();

  // ── Picker state ──────────────────────────────────────────────────────────
  const [pickerAgentId, setPickerAgentId] = useState<string>(
    defaultPickerAgentId ?? agents[0]?.id ?? "",
  );

  // ── Active conversation ───────────────────────────────────────────────────
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  const activeAgent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) ?? null,
    [agents, activeAgentId],
  );

  // ── File state (shared CodeEditorWindow hook) ─────────────────────────────
  const isMultiFile = (files?.length ?? 0) > 0;

  // In single-file mode, synthesize a one-item CodeFile list so the hook
  // has something to manage. The tab bar still shows one tab (minimal UI).
  const seedFiles: CodeFile[] = useMemo(() => {
    if (files && files.length > 0) return files;
    return [
      {
        name: "code",
        path: SINGLE_FILE_PATH,
        language,
        content: initialCode,
      },
    ];
    // Intentional: we don't re-seed on `initialCode` changes — after first
    // mount the hook owns content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, language]);

  const editorState = useCodeEditorWindowState({
    initialFiles: seedFiles,
    initialActiveFile:
      initialActiveFilePath ?? seedFiles[0]?.path ?? null,
  });

  const {
    files: currentFiles,
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
    handleContentChange,
    handleCopy,
    handleFormat,
    getEditorPath,
    mapLanguageForMonaco,
    editorWrapperRef,
    editorHeight,
  } = editorState;

  const code = currentFile?.content ?? "";
  const activeLanguage = currentFile?.language ?? language;

  // Intercept Monaco edits so we can notify the external `onCodeChange`
  // alongside the hook's internal state update.
  const wrappedHandleContentChange = useCallback(
    (value: string | undefined) => {
      handleContentChange(value);
      if (value !== undefined) onCodeChange?.(value, activeTab);
    },
    [handleContentChange, onCodeChange, activeTab],
  );

  // Called when the widget applies edits on Apply — mirrors the Monaco path.
  const widgetOnCodeChange = useCallback(
    (next: string) => {
      handleContentChange(next);
      onCodeChange?.(next, activeTab);
    },
    [handleContentChange, onCodeChange, activeTab],
  );

  // ── Widget handle (buffered; flushes at stream-end) ───────────────────────
  const { widgetHandleId, consumePending } = useCodeEditorWidgetHandle({
    code,
  });

  // ── IDE context sync ──────────────────────────────────────────────────────
  useIdeContextSync(activeConversationId, {
    code,
    language: activeLanguage,
    filePath: currentFile?.path ?? filePath,
    selection,
    diagnostics,
    workspaceName,
    workspaceFolders,
    gitBranch,
    gitStatus,
    agentSkills,
  });

  // ── Other-files context slots (multi-file only) ───────────────────────────
  useEffect(() => {
    if (!activeConversationId || !isMultiFile) return;
    const entries = currentFiles
      .filter((f) => f.path !== activeTab)
      .map((f) => ({
        key: fileContextKey(f.path, f.name),
        value: `File: ${f.name}${f.language ? ` (${f.language})` : ""}\n\n${f.content}`,
        type: "text" as const,
        label: f.name,
      }));
    if (entries.length === 0) return;
    import(
      "@/features/agents/redux/execution-system/instance-context/instance-context.slice"
    ).then(({ setContextEntries }) => {
      dispatch(
        setContextEntries({ conversationId: activeConversationId, entries }),
      );
    });
  }, [activeConversationId, isMultiFile, currentFiles, activeTab, dispatch]);

  // ── Variable sync (first-turn only; context takes over after) ────────────
  useEffect(() => {
    if (!activeConversationId || !activeAgent) return;
    dispatch(
      setUserVariableValues({
        conversationId: activeConversationId,
        values: { [activeAgent.codeVariableKey]: code },
      }),
    );
  }, [activeConversationId, activeAgent, code, dispatch]);

  // ── Agent state machine (buffered widget edits → review) ─────────────────
  const {
    state,
    setState,
    parsedEdits,
    modifiedCode,
    errorMessage,
    rawAIResponse,
    isCopied: reviewIsCopied,
    diffStats,
    handleApplyChanges,
    handleCopyResponse,
    handleRejectEdits,
  } = useSmartCodeEditor({
    conversationId: activeConversationId,
    currentCode: code,
    onCodeChange: widgetOnCodeChange,
    consumeWidgetEdits: consumePending,
  });

  // ── Draft creation ────────────────────────────────────────────────────────
  const handleCreateDraft = useCallback(
    async (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) return;
      try {
        const result = await launchAgent(agentId, {
          surfaceKey: SMART_CODE_EDITOR_SURFACE_KEY,
          sourceFeature: "code-editor",
          apiEndpointMode: "agent",
          config: {
            displayMode: "direct",
            autoRun: false,
            allowChat: true,
            defaultVariables: { [agent.codeVariableKey]: code },
          },
          runtime: {
            widgetHandleId,
          },
        });
        setActiveConversationId(result.conversationId);
        setActiveAgentId(agentId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[SmartCodeEditor] launchAgent failed", err);
      }
    },
    [agents, code, launchAgent, widgetHandleId],
  );

  // ── Select an existing conversation (mirrors AgentRunnerPage URL-sync) ────
  const handleSelectConversation = useCallback(
    async (conversationId: string, agentId: string) => {
      setActiveConversationId(conversationId);
      setActiveAgentId(agentId);

      // Mirror of AgentRunnerPage's URL-sync pattern — direct lookup on the
      // store snapshot instead of a curried selector call.
      const exists =
        !!store.getState().conversations?.byConversationId[conversationId];

      if (!exists) {
        try {
          await dispatch(
            createManualInstance({
              agentId,
              conversationId,
              apiEndpointMode: "agent",
              widgetHandleId,
            }),
          ).unwrap();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[SmartCodeEditor] createManualInstance failed", err);
          return;
        }
      }

      try {
        await dispatch(
          loadConversation({
            conversationId,
            surfaceKey: SMART_CODE_EDITOR_SURFACE_KEY,
          }),
        ).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[SmartCodeEditor] loadConversation failed", err);
      }
    },
    [store, dispatch, widgetHandleId],
  );

  // ── Surface runtime (read scope + agent write targets) ────────────────────
  // The live Monaco instance. Held in a ref — NOT state — because the write
  // handlers below must read the editor as it is WHEN THE USER CONFIRMS, not
  // as it was when the handler closure was built. The writeback seam resolves
  // every staged handler before the first confirm dialog is answered, so a
  // handler that read a render-closure snapshot could replace a range the user
  // has since moved off.
  const monacoRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null);
  const handleEditorMount = useCallback(
    (ed: MonacoEditorNs.IStandaloneCodeEditor | null) => {
      monacoRef.current = ed;
    },
    [],
  );

  // Same reason: the agent state machine gates every write, so it is read live.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /**
   * The ONE edit path these handlers may use.
   *
   * `pushEditOperations` on the MODEL, bracketed by undo stops — not
   * `model.setValue()`, which would throw away the user's undo history, and
   * not the widget's `executeEdits`, which the read-only toggle (this editor
   * opens in preview mode, pencil off) would silently swallow. A model edit
   * fires Monaco's change event, which flows through `onContentChange` into
   * `handleContentChange` — the exact path the user's own keystrokes take, so
   * an agent edit lands in the same state, fires the same `code-change` emit,
   * and ⌘Z reverses it like a paste.
   */
  const applyEditorEdits = useCallback(
    (
      source: string,
      edits: MonacoEditorNs.IIdentifiedSingleEditOperation[],
    ) => {
      const ed = monacoRef.current;
      const model = ed?.getModel();
      if (!ed || !model)
        throw new Error(
          "The Smart Code Editor has no open buffer, so there is nothing to write into.",
        );
      model.pushStackElement();
      model.pushEditOperations(null, edits, () => null);
      model.pushStackElement();
      void source;
    },
    [],
  );

  /** Refuse every write while the editor is showing the agent diff overlay. */
  const assertWritableState = useCallback(() => {
    if (stateRef.current !== "input")
      throw new Error(
        "The editor is not accepting edits right now — it is showing an agent diff for review. Ask the user to Apply or Discard those changes first.",
      );
  }, []);

  /**
   * Every target takes PLAIN TEXT. Spelled out in the throw because the
   * inline-tool layer parses a JSON-looking argument before the handler sees
   * it: without this sentence the agent "fixes" a rejected value by
   * double-encoding it, and the user's buffer fills with escaped newlines.
   */
  const assertCodeString = useCallback(
    (target: string, value: unknown): string => {
      if (typeof value !== "string" || !value.trim())
        throw new Error(
          `${target} expects a non-empty plain text string, not JSON and not JSON-encoded. Pass raw code only — no markdown fences, no commentary, no surrounding quotes.`,
        );
      return value;
    },
    [],
  );

  const getSurfaceWriteHandlers = useCallback(
    (): SurfaceWriteHandlers => ({
      replace_selection: (value: unknown) => {
        const text = assertCodeString("replace_selection", value);
        assertWritableState();
        const ed = monacoRef.current;
        const sel = ed?.getSelection();
        if (!ed || !sel || sel.isEmpty())
          throw new Error(
            "replace_selection needs a selection, and nothing is selected in the editor. Ask the user to highlight the code to replace, or use insert_at_cursor / content instead — do not guess a range.",
          );
        applyEditorEdits("agent-replace-selection", [
          { range: sel, text, forceMoveMarkers: true },
        ]);
      },
      insert_at_cursor: (value: unknown) => {
        const text = assertCodeString("insert_at_cursor", value);
        assertWritableState();
        const ed = monacoRef.current;
        const sel = ed?.getSelection();
        const position = ed?.getPosition();
        // With a selection, land AFTER it — never clobber what the user picked.
        const at =
          sel && !sel.isEmpty()
            ? { lineNumber: sel.endLineNumber, column: sel.endColumn }
            : position;
        if (!ed || !at)
          throw new Error(
            "The editor has no cursor position to insert at. Ask the user to click into the code first.",
          );
        applyEditorEdits("agent-insert", [
          {
            range: {
              startLineNumber: at.lineNumber,
              startColumn: at.column,
              endLineNumber: at.lineNumber,
              endColumn: at.column,
            },
            text,
            forceMoveMarkers: true,
          },
        ]);
      },
      content: (value: unknown) => {
        const text = assertCodeString("content", value);
        assertWritableState();
        const model = monacoRef.current?.getModel();
        if (!model)
          throw new Error(
            "The Smart Code Editor has no open buffer, so there is nothing to replace.",
          );
        // ONE edit over the full range keeps this a single undo step.
        const lastLine = model.getLineCount();
        applyEditorEdits("agent-replace-buffer", [
          {
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: lastLine,
              endColumn: model.getLineContent(lastLine).length + 1,
            },
            text,
            forceMoveMarkers: true,
          },
        ]);
      },
    }),
    [applyEditorEdits, assertCodeString, assertWritableState],
  );

  /**
   * Live read scope, built through the manifest's own typed builder rather
   * than a second hand-rolled one. Re-derived on every call: the Monaco model
   * is the truth for content and selection, so a scope taken at trigger time
   * matches what the user is looking at.
   */
  const getSurfaceScope = useCallback(() => {
    const ed = monacoRef.current;
    const model = ed?.getModel();
    const sel = ed?.getSelection();
    const liveSelection =
      model && sel && !sel.isEmpty() ? model.getValueInRange(sel) : undefined;

    return createSmartCodeEditorScope({
      content: model?.getValue() ?? currentFile?.content ?? "",
      language: currentFile?.language ?? language,
      files: isMultiFile
        ? currentFiles.map((f) => ({
            path: f.path,
            name: f.name,
            language: f.language,
            content: f.content,
          }))
        : undefined,
      active_file_path: isMultiFile ? (activeTab ?? undefined) : undefined,
      editor_title: title,
      file_path: currentFile?.path ?? filePath,
      diagnostics,
      workspace_name: workspaceName,
      workspace_folders: workspaceFolders,
      git_branch: gitBranch,
      git_status: gitStatus,
      agent_skills: agentSkills,
      selection: liveSelection ?? selection,
    });
  }, [
    currentFile,
    language,
    isMultiFile,
    currentFiles,
    activeTab,
    title,
    filePath,
    diagnostics,
    workspaceName,
    workspaceFolders,
    gitBranch,
    gitStatus,
    agentSkills,
    selection,
  ]);

  // ── Derived Monaco props ──────────────────────────────────────────────────
  const editorPath = currentFile ? getEditorPath(currentFile) : undefined;
  const monacoLanguage = currentFile
    ? mapLanguageForMonaco(currentFile.language)
    : "plaintext";

  return (
    <SurfaceRuntimeProvider
      surfaceName={smartCodeEditorManifest.surfaceName}
      getScope={getSurfaceScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
    <div className={`h-full w-full flex flex-col ${className ?? ""}`}>
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full min-h-0"
        >
          {/* Column 1: History */}
          <ResizablePanel
            defaultSize={pct(18)}
            minSize={pct(12)}
            maxSize={pct(30)}
          >
            <CodeEditorHistoryPanel
              agents={agents}
              pickerAgentId={pickerAgentId}
              onPickerAgentChange={setPickerAgentId}
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversation}
              onCreateDraft={handleCreateDraft}
            />
          </ResizablePanel>
          <ResizableHandle />

          {/* Column 2: Agent runner */}
          <ResizablePanel defaultSize={pct(30)} minSize={pct(18)}>
            <AgentRunnerColumn
              conversationId={activeConversationId}
              activeAgentId={activeAgentId}
            />
          </ResizablePanel>
          <ResizableHandle />

          {/* Column 3: Code / Diff on top, Terminal below */}
          <ResizablePanel
            defaultSize={pct(isMultiFile ? 36 : 52)}
            minSize={pct(20)}
          >
            <ResizablePanelGroup
              orientation="vertical"
              className="h-full w-full min-h-0"
            >
              <ResizablePanel defaultSize={pct(75)} minSize={pct(40)}>
                <CodeOrDiffColumn
                  files={currentFiles}
                  openTabs={openTabs}
                  activeTab={activeTab}
                  currentFile={currentFile}
                  onTabClick={selectTab}
                  onTabClose={closeTab}
                  onContentChange={wrappedHandleContentChange}
                  onEditorMount={handleEditorMount}
                  editorWrapperRef={editorWrapperRef}
                  editorHeight={editorHeight}
                  editorPath={editorPath}
                  monacoLanguage={monacoLanguage}
                  isEditing={isEditing}
                  onToggleEditing={() => setIsEditing(!isEditing)}
                  showWrapLines={showWrapLines}
                  onToggleWordWrap={() => setShowWrapLines(!showWrapLines)}
                  minimapEnabled={minimapEnabled}
                  onToggleMinimap={() => setMinimapEnabled(!minimapEnabled)}
                  formatTrigger={formatTrigger}
                  onFormat={handleFormat}
                  isCopied={isCopied}
                  onCopy={handleCopy}
                  state={state}
                  parsedEdits={parsedEdits}
                  modifiedCode={modifiedCode}
                  rawAIResponse={rawAIResponse}
                  errorMessage={errorMessage}
                  reviewIsCopied={reviewIsCopied}
                  diffStats={diffStats}
                  onApply={handleApplyChanges}
                  onDiscard={handleRejectEdits}
                  onCopyResponse={handleCopyResponse}
                  onBackToInput={() => setState("input")}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel
                defaultSize={pct(25)}
                minSize={pct(8)}
                maxSize={pct(60)}
              >
                <TerminalPlaceholder />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* Column 4: Files (multi-file only) */}
          {isMultiFile && (
            <>
              <ResizableHandle />
              <ResizablePanel
                defaultSize={pct(16)}
                minSize={pct(10)}
                maxSize={pct(28)}
              >
                <FilesPanel
                  files={currentFiles}
                  activeFilePath={activeTab}
                  onSelectFile={openFile}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}
