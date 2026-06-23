"use client";

/**
 * Working-document drawer body. The working document is a live, collaborative
 * context item re-sent every turn — editing it here reaches the agent
 * automatically (no re-attach).
 *
 * Parity with Notes in the context drawer:
 *   • Full editor modes via `NoteEditorCore` (Edit / Split / Rich / MD Split / Preview)
 *   • Version history panel (note-bound → `note_versions`; otherwise per-turn snapshots)
 *   • Agent-change diff via canonical `DiffViewer` + `useWorkingDocChanges`
 *
 * Only the Body mounts `useWorkingDocument`. Title actions + version history read
 * the shared per-conversation view store so the hook is never double-mounted.
 */

import { useCallback, useEffect } from "react";
import { FileText, Link2 } from "lucide-react";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useWorkingDocument } from "@/features/agents/hooks/useWorkingDocument";
import { useWorkingDocChanges } from "@/features/transcript-studio/hooks/useWorkingDocChanges";
import { WORKING_DOCUMENT_CONTEXT_KEY } from "@/features/agents/utils/workingDocumentContext";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocBinding } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import type { ContextDrawerItem, ContextItemBodyProps } from "../types";
import { WorkingDocumentEditor } from "../../working-document/WorkingDocumentEditor";
import { WorkingDocumentViewControls } from "../../working-document/WorkingDocumentViewControls";
import { WorkingDocumentVersionHistory } from "../../working-document/WorkingDocumentVersionHistory";
import {
  patchWorkingDocViewState,
  setWorkingDocHistoryOpen,
  setWorkingDocMainView,
  useWorkingDocViewState,
} from "../../working-document/workingDocumentViewStore";

export function buildWorkingDocumentDrawerItem(
  conversationId: string,
  title = "Working document",
): ContextDrawerItem {
  return {
    id: `working_document:${conversationId}`,
    blockType: "working_document",
    typeLabel: "Working document",
    title,
    icon: FileText,
    themeKey: "input_document",
    origin: "block",
    conversationId,
    editable: true,
    refs: {},
    raw: null,
  };
}

export function WorkingDocumentBody({ item, setTitle }: ContextItemBodyProps) {
  const conversationId = item.conversationId;
  const { title, draft, content, onChange, flush, saving } =
    useWorkingDocument(conversationId);
  const { before, after, hasUnseenChange, markSeen } = useWorkingDocChanges(
    content,
    draft,
  );
  const { mainView, historyOpen } = useWorkingDocViewState(conversationId);

  useEffect(() => {
    setTitle?.(title?.trim() || "Working document");
  }, [title, setTitle]);

  useEffect(() => {
    patchWorkingDocViewState(conversationId, { hasUnseenChange, saving });
  }, [conversationId, hasUnseenChange, saving]);

  useEffect(() => {
    if (mainView === "agent-diff") markSeen();
  }, [mainView, markSeen]);

  const handleApplySnapshot = useCallback(
    (snapshotContent: string) => {
      onChange(snapshotContent);
      flush();
      setWorkingDocHistoryOpen(conversationId, false);
      setWorkingDocMainView(conversationId, "editor");
    },
    [conversationId, flush, onChange],
  );

  return (
    <>
      <div className="h-full min-h-0">
        {mainView === "agent-diff" ? (
          <DiffViewer
            original={before}
            modified={after}
            engine="light"
            language="markdown"
            originalLabel="Before"
            modifiedLabel="After (agent's edit)"
            defaultView="highlight"
            showToolbar
            className="h-full min-h-0"
          />
        ) : (
          <WorkingDocumentEditor
            conversationId={conversationId}
            kind="working"
            draft={draft}
            onChange={onChange}
            onFlush={flush}
            surfaceContext={{
              conversationId,
              sourceFeature: "working-document",
            }}
          />
        )}
      </div>
      <WorkingDocumentVersionHistory
        conversationId={conversationId}
        currentContent={draft}
        open={historyOpen}
        onOpenChange={(open) => setWorkingDocHistoryOpen(conversationId, open)}
        onApplySnapshot={handleApplySnapshot}
      />
    </>
  );
}

export function WorkingDocumentTitleActions({ item }: ContextItemBodyProps) {
  return <WorkingDocumentViewControls conversationId={item.conversationId} />;
}

export function WorkingDocumentFooter({ item }: ContextItemBodyProps) {
  const binding = useAppSelector(
    selectWorkingDocBinding(item.conversationId, "working"),
  );
  const isBound = binding.kind === "note" && !!binding.id;

  return (
    <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
      {isBound ? (
        <>
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">
            Synced to note{binding.label ? ` · ${binding.label}` : ""}
          </span>
        </>
      ) : (
        <span className="truncate">
          Auto-saved · {WORKING_DOCUMENT_CONTEXT_KEY}
        </span>
      )}
    </span>
  );
}
