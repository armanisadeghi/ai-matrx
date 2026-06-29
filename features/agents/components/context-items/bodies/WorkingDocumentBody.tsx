"use client";

/**
 * Working-document drawer adapter. ONE working-document component renders
 * everywhere (panel, window, smart-input tab, this drawer) — `WorkingDocumentPanel`
 * — varied only by its chrome props. The drawer reuses it with the header off
 * (the drawer owns the title bar + footer), so there is no second editor/diff/
 * history implementation and no divergent behaviour. The title bar's view
 * controls + the binding footer are the only drawer-specific chrome.
 *
 * IMPORTANT: this adapter reads the title via a SELECTOR (not a second
 * `useWorkingDocument` mount) — mounting the hook twice would fork the editor
 * draft state. The single hook mount lives inside `WorkingDocumentPanel`.
 */

import { useEffect } from "react";
import { FileText, Link2 } from "lucide-react";
import { WORKING_DOCUMENT_CONTEXT_KEY } from "@/features/agents/utils/workingDocumentContext";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectWorkingDocBinding,
  selectWorkingDocTitle,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import type { ContextDrawerItem, ContextItemBodyProps } from "../types";
import { WorkingDocumentPanel } from "../../working-document/WorkingDocumentPanel";
import { WorkingDocumentViewControls } from "../../working-document/WorkingDocumentViewControls";

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
  const title = useAppSelector(selectWorkingDocTitle(conversationId, "working"));

  // Keep the drawer's title bar in sync with the (possibly auto-derived) name.
  useEffect(() => {
    setTitle?.(title?.trim() || "Working document");
  }, [title, setTitle]);

  // The ONE working-document component, chrome off — the drawer supplies its own
  // title bar (WorkingDocumentTitleActions) + footer (WorkingDocumentFooter).
  return (
    <WorkingDocumentPanel
      conversationId={conversationId}
      kind="working"
      showHeader={false}
      showEnableToggle={false}
      showOpenInWindow={false}
    />
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
