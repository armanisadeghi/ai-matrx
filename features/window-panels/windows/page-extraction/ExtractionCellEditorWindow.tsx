"use client";

/**
 * ExtractionCellEditorWindow — edit one extraction result cell with the same
 * edit / split / preview modes as basic notes (BasicContentEditor).
 */

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

import { BasicContentEditor } from "@/components/content-refine/BasicContentEditor";
import { JsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import { MarkdownCopyButton } from "@/components/matrx/buttons/MarkdownCopyButton";
import { Button } from "@/components/ui/button";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { updateResultPayloadField } from "@/features/page-extraction/api/runs";
import {
  emitExtractionCellEditorEvent,
  type ExtractionCellEditorTargetInput,
} from "@/features/page-extraction/data-review/extractionCellEditorCallbacks";
import { parseStructuredCellValue } from "@/features/page-extraction/data-review/structuredCellValue";

const OVERLAY_ID = "extractionCellEditorWindow";

export interface ExtractionCellEditorWindowProps {
  instanceId: string;
  onClose: () => void;
  target: ExtractionCellEditorTargetInput;
  callbackGroupId?: string | null;
}

export default function ExtractionCellEditorWindow({
  instanceId,
  onClose,
  target,
  callbackGroupId,
}: ExtractionCellEditorWindowProps) {
  const [draft, setDraft] = useState(target.value);
  const [draftSource, setDraftSource] = useState(target.value);
  const [busy, setBusy] = useState(false);
  const readOnly = target.readOnly === true;
  const structuredValue = readOnly ? parseStructuredCellValue(target.value) : null;

  // Reset only when the source value changes; a parent rerender must not erase
  // an in-progress edit of the same cell.
  if (draftSource !== target.value) {
    setDraftSource(target.value);
    setDraft(target.value);
  }

  const handleClose = useCallback(() => {
    if (busy) return;
    emitExtractionCellEditorEvent(callbackGroupId, {
      type: "window-close",
      instanceId,
    });
    onClose();
  }, [busy, callbackGroupId, instanceId, onClose]);

  const handleSave = useCallback(async () => {
    if (busy || target.readOnly) return;
    if (draft === target.value) {
      handleClose();
      return;
    }
    setBusy(true);
    try {
      await updateResultPayloadField({
        resultId: target.rowId,
        currentPayload: target.currentPayload,
        key: target.writeKey,
        value: draft,
      });
      emitExtractionCellEditorEvent(callbackGroupId, {
        type: "saved",
        instanceId,
        target,
        value: draft,
      });
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }, [busy, draft, target, callbackGroupId, instanceId, onClose, handleClose]);

  const offset = (hashCode(instanceId) % 6) * 24;
  const title = `${readOnly ? "View" : "Edit"} ${target.columnLabel} · Page ${target.pageLabel}`;

  return (
    <WindowPanel
      id={`extraction-cell-editor-${instanceId}`}
      title={title}
      overlayId={OVERLAY_ID}
      onClose={handleClose}
      width={720}
      height={560}
      minWidth={480}
      minHeight={360}
      maxWidth={
        typeof window !== "undefined" ? window.innerWidth - 24 : undefined
      }
      maxHeight={
        typeof window !== "undefined" ? window.innerHeight - 24 : undefined
      }
      initialRect={{ x: 96 + offset, y: 72 + offset }}
      footerVariant="bar"
      footer={
        <div className="flex w-full items-center justify-end gap-2 px-1 pb-safe">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={busy}
          >
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {readOnly && !structuredValue ? (
            <MarkdownCopyButton
              markdownContent={draft}
              title={`Copy ${target.columnLabel}`}
              hideHTMLPreview
            />
          ) : !readOnly ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          ) : null}
        </div>
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-3"
    >
      {/*
       * Pane-level fallback — BasicContentEditor's default "split" mode
       * (MatrxSplit) and its "plain" mode with no surfaceName render with
       * no context menu of their own; only "preview" (RichDocument) has
       * one. Without this, right-clicking the cell being edited fell
       * through to the page underneath this floating window.
       */}
      <NonEditableContextMenu
        sourceFeature="page_extraction"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
        resolveContextOnOpen={() => ({ content: draft })}
      >
        {structuredValue ? (
          <JsonViewer data={structuredValue} className="min-h-0 flex-1" maxHeight="100%" />
        ) : (
          <BasicContentEditor
            content={draft}
            onChange={setDraft}
            onChangeFlush={setDraft}
            initialEditorMode="split"
            readOnly={readOnly}
            placeholder="Enter cell value…"
            className="min-h-0 flex-1"
            resetKey={`${target.rowId}:${target.columnKey}:${target.value.length}`}
          />
        )}
      </NonEditableContextMenu>
    </WindowPanel>
  );
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
