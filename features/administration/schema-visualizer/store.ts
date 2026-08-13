// features/administration/schema-visualizer/store.ts
// Standalone zustand store — uses raw table names (no `EntityKeys`).

import { create } from "zustand";
import type { SelectedElement } from "./types-standalone";
import { commitUrlParams } from "@/lib/url-state/useUrlState";

interface SchemaVisualizerState {
  selectedElement: SelectedElement | null;
  setSelectedElement: (element: SelectedElement | null) => void;
  isDetailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  hydrateFromUrl: (element: SelectedElement | null) => void;
}

export const useSchemaVisualizerStore = create<SchemaVisualizerState>(
  (set, get) => ({
    selectedElement: null,
    setSelectedElement: (element) => {
      commitUrlParams(
        { selected: element ? JSON.stringify(element) : null },
        "push",
      );
      set({
        selectedElement: element,
        isDetailsOpen: element !== null,
      });
    },
    isDetailsOpen: false,
    setDetailsOpen: (open) => {
      if (!open) commitUrlParams({ selected: null }, "push");
      set({
        isDetailsOpen: open,
        selectedElement: open ? get().selectedElement : null,
      });
    },
    hydrateFromUrl: (element) =>
      set({ selectedElement: element, isDetailsOpen: element !== null }),
  }),
);
