"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileCode } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { codeFilesActions } from "@/features/code-files/redux/slice";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { selectActiveTab, updateTabContent } from "../redux/tabsSlice";
import { isPreviewTab } from "../types";
import { AVATAR_RESERVE, EDITOR_BG } from "../styles/tokens";
import {
  codeFileIdFromTabId,
  isLibraryTabId,
} from "../hooks/useOpenLibraryFile";
import { useSaveActiveTab } from "../hooks/useSaveActiveTab";
import { useReloadTab } from "../hooks/useReloadTab";
import { useSendSelectionAsContext } from "../agent-context/useSendSelectionAsContext";
import { useEditorContextMenuActions } from "../agent-context/useEditorContextMenuActions";
import { useMonacoMarkers } from "../agent-context/useMonacoMarkers";
import { useApplyAIPatchesToActiveTab } from "../agent-context/useApplyAIPatchesToActiveTab";
import { useApplyFsChangesToOpenTabs } from "../agent-context/useApplyFsChangesToOpenTabs";
import { useDiagnosticHoverActions } from "../agent-context/useDiagnosticHoverActions";
import { selectDiagnosticsByTabId } from "../redux/diagnosticsSlice";
import { CodeWorkspaceContextMenu } from "../agent-context/CodeWorkspaceContextMenu";
import { selectFocusedConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import type { RootState } from "@/lib/redux/store";
import { useEnvironmentForActiveTab } from "./monaco-environments";
import { EditorTabs } from "./EditorTabs";
import { EditorToolbar } from "./EditorToolbar";
import { MonacoEditor, type StandaloneCodeEditor } from "./MonacoEditor";
import { BinaryFileViewer } from "./BinaryFileViewer";
import { CloudFilePreviewer } from "./CloudFilePreviewer";
import { TabDiffView } from "./TabDiffView";
import { TripleDiffView } from "./TripleDiffView";
import { RenderPreviewView } from "../preview/RenderPreviewView";
import { selectPendingPatchCountForTab } from "../redux/codePatchesSlice";
import { undoLastEditThunk } from "../redux/codeEditUndoRevert";

interface EditorAreaProps {
  rightSlotAvailable?: boolean;
  /** When true, the editor is the rightmost column and its toolbar needs to
   *  reserve space for the app's floating avatar. */
  rightmost?: boolean;
  className?: string;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  rightSlotAvailable = false,
  rightmost = false,
  className,
}) => {
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector(selectActiveTab);
  // When the agent has staged SEARCH/REPLACE patches against the active
  // tab's buffer, the tab's body swaps from `<MonacoEditor>` to
  // `<TabDiffView>` (Cursor-style: the file's own tab IS the review).
  // No separate review tab, no global tray, no extra heading layers.
  const activeTabPendingCount = useAppSelector(
    selectPendingPatchCountForTab(activeTab?.id ?? null),
  );
  const activeTabHasPending = activeTabPendingCount > 0;
  const saveActiveTab = useSaveActiveTab();
  const reloadTab = useReloadTab();
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agentId");
  const conversationIdFromUrl = searchParams.get("conversationId");
  // Mirror ChatPanelSlot: prefer the live focused conversationId so the
  // editor sends context to the right chat even before the URL catches up
  // after `useAgentLauncher` creates a fresh instance.
  const focusedConversationId = useAppSelector(
    agentId ? selectFocusedConversation(`agent-runner:${agentId}`) : () => null,
  );
  const conversationId = focusedConversationId ?? conversationIdFromUrl;

  // Mirror Monaco markers (TS, ESLint, JSON schema, etc.) into Redux so
  // the agent-context bridge can ship `editor.diagnostics` for the
  // active tab. One subscription serves all editors mounted in this
  // surface — see `useMonacoMarkers` for the model→tabId mapping.
  useMonacoMarkers();

  // Watch this surface's focused conversation for stream completions and
  // stage any SEARCH/REPLACE blocks the agent emits as pending patches
  // against whichever open tab they cleanly match. The tray below the
  // toolbar surfaces them for accept/reject; acceptance flows through the
  // normal `updateTabContent` → save pipeline so cloud, library, sandbox,
  // and mock filesystems all behave identically.
  useApplyAIPatchesToActiveTab({ conversationId });

  // Bridge `RESOURCE_CHANGED` stream events into the live editor: refresh
  // clean tabs when the agent's tools touch a file, surface a conflict
  // toast on dirty tabs, close tabs on delete/rename. Bucket scoping is
  // automatic — sandbox-mode subscribes to the active sandbox bucket;
  // cloud/mock fall back to the global bucket. See
  // `features/code/agent-context/useApplyFsChangesToOpenTabs.ts` for the
  // full event-handling matrix.
  useApplyFsChangesToOpenTabs();

  const editorRef = useRef<StandaloneCodeEditor | null>(null);
  // State copy of the editor instance so effects (e.g. context-menu action
  // registration) can run *after* Monaco mounts. The ref alone doesn't
  // trigger a re-render, so an effect that depends only on `editorRef`
  // would never re-run when the editor finally arrives.
  const [editorReadyTick, setEditorReadyTick] = useState(0);

  const { sendSelection, canSend: canSendSelection } =
    useSendSelectionAsContext({
      conversationId,
      activeTab,
      editorRef,
      notify: ({ type, text }) =>
        type === "success" ? toast.success(text) : toast.error(text),
    });

  const handleEditorMount = useCallback((editor: StandaloneCodeEditor) => {
    editorRef.current = editor;
    setEditorReadyTick((t) => t + 1);
  }, []);

  // Right-click → "Send selection / file to chat" / "Ask AI in window".
  // Re-registers when the active tab, chat focus, or editor instance
  // changes so each menu item references the right buffer + conversation.
  useEditorContextMenuActions({
    editorRef,
    editorReadyTick,
    activeTab,
    conversationId,
    defaultAgentId: agentId,
    notify: ({ type, text }) => {
      if (type === "success") toast.success(text);
      else if (type === "error") toast.error(text);
      else toast.info(text);
    },
  });

  // Hover → "Send to AI chat" link on lines carrying a Monaco marker.
  // Click dispatches an `editor_error` resource pill into the active
  // conversation; the pill renders above the chat input and round-trips
  // to the persisted message as `<editor_error>` XML.
  const activeTabDiagnostics = useAppSelector((state) =>
    selectDiagnosticsByTabId(state, activeTab?.id ?? null),
  );
  useDiagnosticHoverActions({
    editorRef,
    editorReadyTick,
    activeTab,
    diagnostics: activeTabDiagnostics,
    conversationId,
    notify: ({ type, text }) => {
      if (type === "success") toast.success(text);
      else if (type === "error") toast.error(text);
      else toast.info(text);
    },
  });

  const monacoEnvironmentsEnabled = useAppSelector(
    (state: RootState) =>
      state.userPreferences.coding.monacoEnvironmentsEnabled ?? true,
  );
  const { activeEnvironment } = useEnvironmentForActiveTab({
    enabled: monacoEnvironmentsEnabled,
  });

  const handleChange = useCallback(
    (next: string) => {
      if (!activeTab) return;
      dispatch(updateTabContent({ id: activeTab.id, content: next }));
      // Mirror edits of library tabs into the code-files slice so its own
      // dirty-tracking + auto-save machinery stays in sync with Monaco.
      if (isLibraryTabId(activeTab.id)) {
        const codeFileId = codeFileIdFromTabId(activeTab.id);
        if (codeFileId) {
          dispatch(
            codeFilesActions.setLocalContent({ id: codeFileId, content: next }),
          );
        }
      }
    },
    [dispatch, activeTab],
  );

  const handleSave = useCallback(() => {
    void saveActiveTab().then((result) => {
      if (!result) return;
      if (result.ok) return;
      if (result.conflict) {
        const conflictTabId = result.tabId;
        toast.warning("Remote row updated since you opened this tab", {
          description:
            "Reload to pick up the remote changes (your local edits are copied to the clipboard) or Overwrite to push your version anyway.",
          duration: 15000,
          action: {
            label: "Reload",
            onClick: () => {
              void reloadTab(conflictTabId).then((reload) => {
                if (!reload.ok) {
                  toast.error("Reload failed", {
                    description: reload.error ?? "Unknown error",
                  });
                  return;
                }
                if (
                  reload.previousContent &&
                  typeof navigator !== "undefined" &&
                  navigator.clipboard
                ) {
                  void navigator.clipboard
                    .writeText(reload.previousContent)
                    .catch(() => {
                      // Clipboard access can be denied silently — the
                      // user can still see the remote content in the
                      // editor.
                    });
                }
                toast.success("Reloaded from remote");
              });
            },
          },
          cancel: {
            label: "Overwrite",
            onClick: () => {
              void saveActiveTab(conflictTabId, { force: true }).then(
                (forced) => {
                  if (!forced) return;
                  if (forced.ok) {
                    toast.success("Saved (overwrote remote)");
                  } else {
                    toast.error("Overwrite failed", {
                      description: forced.error ?? "Unknown error",
                    });
                  }
                },
              );
            },
          },
        });
        return;
      }
      toast.error("Save failed", {
        description: result.error ?? "Unknown error",
      });
    });
  }, [saveActiveTab, reloadTab]);

  // Fallback save shortcut for when focus is in the editor area but not
  // inside Monaco itself (e.g. on the tab strip). Mirrors Cmd/Ctrl+S.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && (e.key === "s" || e.key === "S")) {
        // Only intercept when there's actually something to save.
        if (!activeTab) return;
        // Preview tabs (binary / cloud-file) have no editable buffer —
        // let the browser keep its default Cmd+S so users can save the
        // page if they really want to, instead of silently swallowing
        // the keystroke.
        if (isPreviewTab(activeTab.kind)) return;
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, handleSave]);

  // Cmd/Ctrl+Z when the last mutation came from an AI accept: undo
  // the AI edit instead of letting Monaco unwind a per-keystroke
  // history entry. Once we've run an AI undo (or the user types
  // anything afterwards), `lastMutationSource` flips back to
  // `"user"` and Monaco's normal undo takes over again.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && (e.key === "z" || e.key === "Z")) {
        if (!activeTab) return;
        if (isPreviewTab(activeTab.kind)) return;
        if (activeTab.lastMutationSource !== "ai") return;
        // Don't fire when focus is inside an input or textarea outside
        // Monaco — that's almost never what the user wants.
        const target = e.target as Element | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            (target as HTMLElement).isContentEditable)
        ) {
          // Inside Monaco, the editor itself owns the keystroke — let
          // it pass. The Monaco DOM uses contenteditable, so we'd hit
          // this branch. We still want our binding to win because the
          // last-mutation guard ensures we only intervene right after
          // an AI accept; a single user keystroke clears the flag.
          if (
            !target.classList?.contains("monaco-mouse-cursor-text") &&
            !target.closest(".monaco-editor")
          ) {
            return;
          }
        }
        const ok = dispatch(undoLastEditThunk({ tabId: activeTab.id }));
        if (ok) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [activeTab, dispatch]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", EDITOR_BG, className)}>
      <div
        className={cn(
          "flex h-9 shrink-0 items-stretch border-b border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900",
          rightmost && AVATAR_RESERVE,
        )}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <EditorTabs />
        </div>
        <EditorToolbar
          rightSlotAvailable={rightSlotAvailable}
          onSaveActiveTab={handleSave}
          hasDirtyActiveTab={Boolean(activeTab?.dirty)}
          hasActiveTab={Boolean(activeTab)}
          lastSavedAt={activeTab?.lastSavedAt}
          onSendSelectionAsContext={sendSelection}
          canSendSelectionAsContext={canSendSelection}
          activeCloudFileId={activeTab?.cloudFileId ?? null}
        />
      </div>
      <div className="relative flex-1 min-h-0">
        {activeTab ? (
          activeTab.kind === "cloud-file-preview" ? (
            <CloudFilePreviewer key={activeTab.id} tab={activeTab} />
          ) : activeTab.kind === "binary-preview" ? (
            <BinaryFileViewer key={activeTab.id} tab={activeTab} />
          ) : activeTab.kind === "history-triple" ? (
            <TripleDiffView key={activeTab.id} tab={activeTab} />
          ) : activeTab.kind === "render-preview" ? (
            <RenderPreviewView key={activeTab.id} tab={activeTab} />
          ) : activeTabHasPending ? (
            <TabDiffView key={activeTab.id} tab={activeTab} />
          ) : (
            <CodeWorkspaceContextMenu
              editorRef={editorRef}
              editorReadyTick={editorReadyTick}
              className="h-full w-full"
            >
              <MonacoEditor
                key={activeTab.id}
                value={activeTab.content}
                language={activeTab.language}
                path={activeTab.path}
                onChange={handleChange}
                onSave={handleSave}
                onSendSelection={sendSelection}
                onEditorMount={handleEditorMount}
              />
            </CodeWorkspaceContextMenu>
          )
        ) : (
          <EmptyEditorState />
        )}
      </div>
    </div>
  );
};

const EmptyEditorState: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="flex flex-col items-center gap-3 text-neutral-400 dark:text-neutral-600">
      <FileCode size={40} strokeWidth={1.2} />
      <p className="text-sm">
        Select a file from the explorer to start editing.
      </p>
    </div>
  </div>
);
