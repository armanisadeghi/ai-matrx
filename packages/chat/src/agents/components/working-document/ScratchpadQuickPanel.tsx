"use client";

/**
 * The global scratchpad, one click from every page — opened as a canvas tab
 * (`features/quick-actions/canvas/scratchpadKind.tsx`). Two halves:
 *
 *  - `ScratchpadQuickPanel` — the body: the shared `WorkingDocumentPanel`
 *    editor bound to the ACTIVE scratchpad's `sp:<id>` scope (one is always
 *    active and follows the person into every conversation that opts in).
 *    Rows materialize on the first byte of content; versions live in
 *    `history.row_versions` via the panel's History view.
 *  - `ScratchpadSwitcherMenu` (its own module, `./ScratchpadSwitcherMenu`) —
 *    the pool switcher (pick / new / delete) for the host's chrome (the tab
 *    header), so the body draws no second bar.
 */

import { toast } from "../../../host/notify";
import { useEffect } from "react";
import { cn } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector, useAppStore } from "../../../store/hooks";
import { scratchScopeId } from "../../redux/execution-system/instance-working-document/instance-working-document.slice";
import { selectActiveScratchpadId } from "../../redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  createScratchpadThunk,
  hydrateActiveScratchpadThunk,
} from "../../redux/execution-system/instance-working-document/scratchpad.thunks";
import { WorkingDocumentPanel } from "./WorkingDocumentPanel";
import { LoadingLine } from "./ScratchpadSwitcherMenu";

/**
 * Hydrates the active scratchpad, and makes one when the pool is empty.
 * `.unwrap()`: a FAILED read must not fall through to "none yet → create
 * one" (RC-B12 r13) — that minted a new scratchpad beside existing ones.
 */
function useEnsureActiveScratchpad() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  useEffect(() => {
    let cancelled = false;
    void dispatch(hydrateActiveScratchpadThunk())
      .unwrap()
      .then(() => {
        if (cancelled) return;
        if (!selectActiveScratchpadId(store.getState())) {
          void dispatch(createScratchpadThunk());
        }
      })
      .catch((err: unknown) => {
        console.error("[scratchpad] resolve failed", err);
        toast.error("Couldn't load your scratchpad — nothing was created in its place. Try reopening it.");
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, store]);
}

export function ScratchpadQuickPanel({ className }: { className?: string }) {
  useEnsureActiveScratchpad();
  const activeId = useAppSelector(selectActiveScratchpadId);
  const activeScope = activeId ? scratchScopeId(activeId) : null;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {activeScope ? (
        <WorkingDocumentPanel
          conversationId={activeScope}
          kind="scratch"
          showHeader
          showHeaderTitle={false}
          showOpenInWindow={false}
          className="h-full"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <LoadingLine message="Opening your scratchpad…" />
        </div>
      )}
    </div>
  );
}

