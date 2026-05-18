"use client";

/**
 * BattlePage
 *
 * The full /agents/battle page. Toolbar at the top, then a horizontal
 * strip of N resizable columns + a trailing "Add column" tile.
 *
 * - Resize: react-resizable-panels v4 (each column = Panel)
 * - Collapse: each Panel is `collapsible`; toggle via panelRef.collapse/expand
 * - Reorder: dnd-kit horizontal sortable (drag handle on each header)
 * - Remove: in the header (confirm dialog)
 *
 * Design intentionally space-efficient — desktop-only, single-row toolbar,
 * thin handles, no decorative padding on the column strip.
 */

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { addBattleColumn } from "../redux/thunks";
import {
  selectBattleColumnIds,
  selectBattleColumns,
} from "../redux/selectors";
import {
  reorderColumns,
  setColumnCollapsed,
} from "../redux/battleSlice";
import { BattleToolbar } from "./BattleToolbar";
import { BattleColumn } from "./BattleColumn";
import { BattleAddColumnTile } from "./BattleAddColumnTile";
import { SharedContextWindow } from "./SharedContextWindow";
import { SharedRunsWindow } from "./SharedRunsWindow";
import type { BattleColumn as BattleColumnType } from "../types";

const SHARED_CONTEXT_WINDOW_ID = "agent-battle-shared-context";
const SHARED_RUNS_WINDOW_ID = "agent-battle-shared-runs";

export function BattlePage() {
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectBattleColumns);
  const columnIds = useAppSelector(selectBattleColumnIds);

  const [contextWindowOpen, setContextWindowOpen] = useState(false);
  const [runsWindowOpen, setRunsWindowOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = columnIds.indexOf(String(active.id));
    const toIndex = columnIds.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    dispatch(reorderColumns({ fromIndex, toIndex }));
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <BattleToolbar
        contextWindowOpen={contextWindowOpen}
        onToggleContextWindow={() => setContextWindowOpen((v) => !v)}
        runsWindowOpen={runsWindowOpen}
        onToggleRunsWindow={() => setRunsWindowOpen((v) => !v)}
      />

      <div className="flex-1 min-h-0 flex">
        {columns.length === 0 ? (
          <EmptyState />
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext
              items={columnIds}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex-1 min-w-0">
                <ColumnGroup columns={columns} />
              </div>
            </SortableContext>
          </DndContext>
        )}
        <BattleAddColumnTile />
      </div>

      {contextWindowOpen && (
        <SharedContextWindow
          id={SHARED_CONTEXT_WINDOW_ID}
          onClose={() => setContextWindowOpen(false)}
        />
      )}

      {runsWindowOpen && (
        <SharedRunsWindow
          id={SHARED_RUNS_WINDOW_ID}
          onClose={() => setRunsWindowOpen(false)}
        />
      )}
    </div>
  );
}

// =============================================================================
// Column group — dynamic N-panel horizontal resizable group
// =============================================================================

function ColumnGroup({ columns }: { columns: BattleColumnType[] }) {
  // `key` based on column ids order so adding/removing forces a fresh layout
  // distribution rather than honoring stale persisted sizes for a different N.
  const groupKey = columns.map((c) => c.columnId).join("|");
  const equalSize = `${100 / columns.length}%`;

  return (
    <ResizablePanelGroup
      key={groupKey}
      id="agent-battle-columns"
      orientation="horizontal"
      className="h-full w-full"
    >
      {columns.map((col, idx) => (
        <ColumnSegment
          key={col.columnId}
          column={col}
          defaultSize={equalSize}
          showHandle={idx > 0}
        />
      ))}
    </ResizablePanelGroup>
  );
}

function ColumnSegment({
  column,
  defaultSize,
  showHandle,
}: {
  column: BattleColumnType;
  defaultSize: string;
  showHandle: boolean;
}) {
  const dispatch = useAppDispatch();
  const panelRef = useRef<PanelImperativeHandle>(null);

  // Reflect the persisted collapsed flag into the imperative API when it
  // changes from elsewhere (load set, etc.). Library still owns the size.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (column.collapsed && !panel.isCollapsed()) panel.collapse();
    if (!column.collapsed && panel.isCollapsed()) panel.expand();
  }, [column.collapsed]);

  const handleToggleCollapse = () => {
    dispatch(
      setColumnCollapsed({
        columnId: column.columnId,
        collapsed: !column.collapsed,
      }),
    );
  };

  return (
    <>
      {showHandle && <ResizableHandle withHandle />}
      <ResizablePanel
        id={column.columnId}
        panelRef={panelRef}
        defaultSize={defaultSize}
        minSize="8%"
        collapsible
        collapsedSize="0%"
        style={{ overflow: "hidden" }}
      >
        <BattleColumn
          column={column}
          onToggleCollapse={handleToggleCollapse}
        />
      </ResizablePanel>
    </>
  );
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState() {
  const dispatch = useAppDispatch();
  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div className="max-w-md space-y-4">
        <div className="text-base font-medium">No columns yet</div>
        <p className="text-sm text-muted-foreground">
          Add a column for each agent (or version) you want to compare. Each
          column has its own variables, input, and response. Submit them
          individually, or all at once.
        </p>
        <Button
          size="sm"
          onClick={() => dispatch(addBattleColumn())}
        >
          <Plus className="w-4 h-4" />
          Add the first column
        </Button>
      </div>
    </div>
  );
}
