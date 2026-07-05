"use client";

/**
 * Working-document drawer adapter. Every surface that shows the working document
 * — the tool-result Canvas, the right-sidebar overlay, the floating window, and
 * THIS context drawer/slot sheet — renders the ONE unified `DocumentsWorkspace`
 * (tabs + doc rail over the shared `WorkingDocumentPanel`). The drawer used to
 * render a slimmer single-document peek; it now shows the same workspace so the
 * experience (and its features) are identical no matter how you open it. The
 * rail defaults collapsed to fit the drawer width.
 *
 * Because `DocumentsWorkspace` owns its own header / tab strip / view controls /
 * status, this body registers no separate TitleActions or Footer in the
 * context-item registry (they would double up with the workspace's chrome).
 */

import { useEffect } from "react";
import { FileText, NotebookPen } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  scratchScopeId,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectActiveScratchpadId,
  selectWorkingDocTitle,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import type { ContextDrawerItem, ContextItemBodyProps } from "../types";
import { DocumentsWorkspace } from "../../working-document/documents-workspace/DocumentsWorkspace";

export function buildWorkingDocumentDrawerItem(
  conversationId: string,
  title = "Working document",
  kind: WorkingDocumentKind = "working",
): ContextDrawerItem {
  const isScratch = kind === "scratch";
  return {
    id: `${isScratch ? "user_scratchpad" : "working_document"}:${conversationId}`,
    blockType: "working_document",
    typeLabel: isScratch ? "Scratchpad" : "Working document",
    title,
    icon: isScratch ? NotebookPen : FileText,
    themeKey: "input_document",
    origin: "block",
    conversationId,
    editable: true,
    refs: {},
    raw: null,
  };
}

export function WorkingDocumentBody({
  item,
  setTitle,
  initialKind = "working",
}: ContextItemBodyProps & { initialKind?: WorkingDocumentKind }) {
  const conversationId = item.conversationId;
  const isScratch = initialKind === "scratch";
  const activeScratchId = useAppSelector(selectActiveScratchpadId);
  const titleScope =
    isScratch && activeScratchId
      ? scratchScopeId(activeScratchId)
      : conversationId;
  const title = useAppSelector(
    selectWorkingDocTitle(titleScope, initialKind),
  );

  // Keep the drawer's title bar in sync with the (possibly auto-derived) name.
  useEffect(() => {
    setTitle?.(title?.trim() || (isScratch ? "Scratchpad" : "Working document"));
  }, [title, setTitle, isScratch]);

  return (
    <DocumentsWorkspace
      conversationId={conversationId}
      initialKind={initialKind}
      defaultRailOpen={false}
      className="h-full"
    />
  );
}

