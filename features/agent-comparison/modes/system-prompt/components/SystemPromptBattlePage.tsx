"use client";

/**
 * SystemPromptBattlePage — Mode 3 page shell.
 *
 * Layout mirrors Mode 2 (Settings) — same toolbar / locked-input /
 * resizable strip + dnd-reorderable columns / shared runs window.
 * The mode-specific bits are:
 *   - LockedInputSection writes source agent + variables + user message
 *   - SystemPromptColumn body is a vertical split: editor on top,
 *     bound conversation on the bottom
 *   - Each column's editor targets the column's synthetic agent record
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
} from "@dnd-kit/sortable";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { Plus } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SharedRunsWindow } from "@/features/agent-comparison/components/SharedRunsWindow";
import { ModePicker } from "@/features/agent-comparison/shared/ModePicker";
import {
  reorderSystemPromptColumns,
  setSystemPromptColumnCollapsed,
} from "../redux/slice";
import {
  selectSourceAgentId,
  selectSystemPromptColumnIds,
  selectSystemPromptColumns,
} from "../redux/selectors";
import { addColumnToSystemPromptBattle } from "../redux/thunks";
import { LockedInputSection } from "./LockedInputSection";
import { SystemPromptColumn } from "./SystemPromptColumn";
import { SystemPromptToolbar } from "./SystemPromptToolbar";
import type { SystemPromptColumn as SystemPromptColumnType } from "../types";

const RUNS_WINDOW_ID = "agent-comparison-system-prompt-runs";

export function SystemPromptBattlePage() {
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectSystemPromptColumns);
  const columnIds = useAppSelector(selectSystemPromptColumnIds);
  const sourceAgentId = useAppSelector(selectSourceAgentId);

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
    dispatch(reorderSystemPromptColumns({ fromIndex, toIndex }));
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <ModePicker />
      <SystemPromptToolbar
        runsWindowOpen={runsWindowOpen}
        onToggleRunsWindow={() => setRunsWindowOpen((v) => !v)}
      />

      <LockedInputSection />

      <div className="flex-1 min-h-0 flex">
        {columns.length === 0 ? (
          <EmptyState
            sourceAgentReady={!!sourceAgentId}
            onAdd={() =>
              dispatch(addColumnToSystemPromptBattle(undefined))
            }
          />
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
        <AddVariantTile
          disabled={!sourceAgentId}
          onClick={() => dispatch(addColumnToSystemPromptBattle(undefined))}
        />
      </div>

      {runsWindowOpen && (
        <SharedRunsWindow
          id={RUNS_WINDOW_ID}
          onClose={() => setRunsWindowOpen(false)}
        />
      )}
    </div>
  );
}

function ColumnGroup({ columns }: { columns: SystemPromptColumnType[] }) {
  const groupKey = columns.map((c) => c.columnId).join("|");
  const equalSize = `${100 / columns.length}%`;

  return (
    <ResizablePanelGroup
      key={groupKey}
      id="agent-comparison-system-prompt-columns"
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
  column: SystemPromptColumnType;
  defaultSize: string;
  showHandle: boolean;
}) {
  const dispatch = useAppDispatch();
  const panelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (column.collapsed && !panel.isCollapsed()) panel.collapse();
    if (!column.collapsed && panel.isCollapsed()) panel.expand();
  }, [column.collapsed]);

  const handleToggleCollapse = () => {
    dispatch(
      setSystemPromptColumnCollapsed({
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
        collapsedSize="44px"
        style={{
          overflow: "hidden",
          transition: "flex-grow 220ms ease, flex-basis 220ms ease",
        }}
      >
        <SystemPromptColumn
          column={column}
          onToggleCollapse={handleToggleCollapse}
        />
      </ResizablePanel>
    </>
  );
}

function EmptyState({
  sourceAgentReady,
  onAdd,
}: {
  sourceAgentReady: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div className="max-w-md space-y-3">
        <div className="text-base font-medium">
          {sourceAgentReady
            ? "Add a variant to start"
            : "Pick a source agent above"}
        </div>
        <p className="text-sm text-muted-foreground">
          {sourceAgentReady
            ? "Each variant clones the source agent into its own editable copy. Edit each column's system prompt independently, then hit Submit All to run them side-by-side."
            : "System Prompt mode locks the source agent, variables, and user message. Each variant edits only the system prompt — everything else stays identical."}
        </p>
        {sourceAgentReady && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add a variant
          </button>
        )}
      </div>
    </div>
  );
}

function AddVariantTile({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={
        disabled
          ? "Pick a source agent first to enable variants"
          : "Add a system-prompt variant"
      }
      className="group h-full w-16 shrink-0 flex flex-col items-center justify-center gap-2 border-l-2 border-dashed border-primary/50 bg-primary/5 hover:bg-primary/15 hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/5 disabled:hover:border-primary/50"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-md group-hover:scale-110 transition-transform">
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary rotate-180 [writing-mode:vertical-rl]">
        Add variant
      </span>
    </button>
  );
}
