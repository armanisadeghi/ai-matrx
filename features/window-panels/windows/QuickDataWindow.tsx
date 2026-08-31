"use client";

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { QuickDataSheet } from "@/features/quick-actions/components/QuickDataSheet";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { QUICK_DATA_SURFACE_NAME } from "@/features/surfaces/manifests/quick-data.manifest";
import {
  datasetTableEntityRef,
  useDatasetTableMenuSection,
} from "@/features/data-tables/dataset-table-actions";

interface QuickDataWindowProps {
  isOpen: boolean;
  onClose?: () => void;
  /**
   * Pre-selected table id. Wired up from the registry's `defaultData.selectedTable`
   * slot — `OverlaySurface` spreads the overlay data onto window props, so any
   * `dispatch(openOverlay({ overlayId: "quickDataWindow", data: { selectedTable } }))`
   * call lands here.
   */
  selectedTable?: string | null;
}

export default function QuickDataWindow({
  isOpen,
  onClose,
  selectedTable,
}: QuickDataWindowProps) {
  if (!isOpen) return null;

  // Best-effort row: `QuickDataSheet` owns its live table-picker selection
  // internally (no `onSelectionChange` out today), so this reflects the
  // window's OPEN-time table, not a later in-window re-pick. Good enough for
  // the ~12 callers that open straight at a known table; a live per-pick
  // entity needs `QuickDataSheet` to lift its `selectedTableId` — flagged,
  // not fixed here (out of this shard).
  const row = selectedTable ? { id: selectedTable, name: null } : null;
  const datasetSection = useDatasetTableMenuSection({ getRow: () => row });

  return (
    <WindowPanel
      title="Data Tables"
      width={800}
      height={600}
      urlSyncKey="quick_data"
      onClose={onClose}
      overlayId="quickDataWindow"
    >
      {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without this,
          a right-click here is answered by whatever page sits underneath. The
          `matrx-user/quick-data` surface's emitter lives inside `QuickDataSheet`
          (nested below), so wrapping it here keeps the emitter in scope. */}
      <NonEditableContextMenu
        sourceFeature="system"
        surfaceName={QUICK_DATA_SURFACE_NAME}
        contentSource={{ type: "raw" }}
        entity={datasetTableEntityRef(row) ?? undefined}
        extraSections={[datasetSection]}
      >
        <div className="flex h-full w-full relative overflow-hidden bg-background">
          <QuickDataSheet
            className="absolute inset-0"
            initialTableId={selectedTable ?? null}
          />
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
