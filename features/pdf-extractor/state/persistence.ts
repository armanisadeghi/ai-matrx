import type { Middleware } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  hydratePerDocFromStorage,
  setActiveDocId,
  setSidebarView,
  setVisiblePanes,
  togglePane,
} from "./pdfStudioSlice";
import {
  DEFAULT_PER_DOC,
  STORAGE_KEY_PREFIX,
  type PaneKey,
  type PerDocUi,
  type SidebarView,
} from "./types";

const VALID_PANES: PaneKey[] = [
  "pdf",
  "raw",
  "clean",
  "chunks",
  "extractions",
];
const VALID_VIEWS: SidebarView[] = ["files", "pages"];

function readEntry(docId: string): PerDocUi | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + docId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PerDocUi>;
    const panes = Array.isArray(parsed.visiblePanes)
      ? parsed.visiblePanes.filter((p): p is PaneKey =>
          VALID_PANES.includes(p as PaneKey),
        )
      : null;
    const view =
      typeof parsed.sidebarView === "string" &&
      VALID_VIEWS.includes(parsed.sidebarView as SidebarView)
        ? (parsed.sidebarView as SidebarView)
        : null;
    if (!panes && !view) return null;
    return {
      visiblePanes: panes && panes.length > 0
        ? panes
        : DEFAULT_PER_DOC.visiblePanes,
      sidebarView: view ?? DEFAULT_PER_DOC.sidebarView,
    };
  } catch {
    return null;
  }
}

function writeEntry(docId: string, entry: PerDocUi) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PREFIX + docId,
      JSON.stringify(entry),
    );
  } catch {
    // Ignore quota / disabled-storage errors.
  }
}

const PERSIST_ACTIONS = new Set<string>([
  togglePane.type,
  setVisiblePanes.type,
  setSidebarView.type,
]);

export const pdfStudioPersistenceMiddleware: Middleware<
  Record<string, never>,
  RootState
> = (api) => (next) => (action: unknown) => {
  if (
    typeof action === "object" &&
    action !== null &&
    "type" in action &&
    (action as { type: unknown }).type === setActiveDocId.type
  ) {
    const docId = (action as unknown as { payload: string | null }).payload;
    const result = next(action);
    if (docId) {
      const fromDisk = readEntry(docId);
      if (fromDisk) {
        api.dispatch(
          hydratePerDocFromStorage({ docId, entry: fromDisk }),
        );
      }
    }
    return result;
  }

  const result = next(action);

  if (
    typeof action === "object" &&
    action !== null &&
    "type" in action &&
    PERSIST_ACTIONS.has((action as { type: string }).type)
  ) {
    const state = api.getState();
    const docId = state.pdfStudio.activeDocId;
    if (docId) {
      const entry = state.pdfStudio.perDoc[docId];
      if (entry) writeEntry(docId, entry);
    }
  }

  return result;
};
