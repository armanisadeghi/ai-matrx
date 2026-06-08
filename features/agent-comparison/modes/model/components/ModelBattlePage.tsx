"use client";

/**
 * ModelBattlePage — Mode 6 page shell (Model).
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
import { reorderModelColumns, setModelColumnCollapsed } from "../redux/slice";
import {
  selectLockedAgentId,
  selectModelColumnIds,
  selectModelColumns,
} from "../redux/selectors";
import { addColumnToModelBattle } from "../redux/thunks";
import { LockedInputSection } from "./LockedInputSection";
import { ModelColumn } from "./ModelColumn";
import { ModelToolbar } from "./ModelToolbar";
import type { ModelColumn as ModelColumnType } from "../types";

const RUNS_WINDOW_ID = "agent-comparison-model-runs";

export function ModelBattlePage() {
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectModelColumns);
  const columnIds = useAppSelector(selectModelColumnIds);
  const lockedAgentId = useAppSelector(selectLockedAgentId);

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
    dispatch(reorderModelColumns({ fromIndex, toIndex }));
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <ModePicker />
      <ModelToolbar
        runsWindowOpen={runsWindowOpen}
        onToggleRunsWindow={() => setRunsWindowOpen((v) => !v)}
      />

      <LockedInputSection />

      <div className="flex-1 min-h-0 flex">
        {columns.length === 0 ? (
          <EmptyState
            agentReady={!!lockedAgentId}
            onAdd={() => dispatch(addColumnToModelBattle(undefined))}
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
        <AddModelTile
          disabled={!lockedAgentId}
          onClick={() => dispatch(addColumnToModelBattle(undefined))}
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

function ColumnGroup({ columns }: { columns: ModelColumnType[] }) {
  const groupKey = columns.map((c) => c.columnId).join("|");
  const equalSize = `${100 / columns.length}%`;

  return (
    <ResizablePanelGroup
      key={groupKey}
      id="agent-comparison-model-columns"
      orientation="horizontal"
      className="h-full w-full"
    >
      {columns.map((col, idx) => (
        <ColumnSegment
          key={col.columnId}
          column={col}
          defaultSize={equalSize}
          showHandle={idx > 0}
          isBaseline={idx === 0}
        />
      ))}
    </ResizablePanelGroup>
  );
}

function ColumnSegment({
  column,
  defaultSize,
  showHandle,
  isBaseline,
}: {
  column: ModelColumnType;
  defaultSize: string;
  showHandle: boolean;
  isBaseline: boolean;
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
      setModelColumnCollapsed({
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
        <ModelColumn
          column={column}
          onToggleCollapse={handleToggleCollapse}
          isBaseline={isBaseline}
        />
      </ResizablePanel>
    </>
  );
}

function EmptyState({
  agentReady,
  onAdd,
}: {
  agentReady: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div className="max-w-md space-y-3">
        <div className="text-base font-medium">
          {agentReady ? "Add a model to start" : "Pick an agent above"}
        </div>
        <p className="text-sm text-muted-foreground">
          {agentReady
            ? "Each variant runs the SAME locked input against a different model. Pick 2-4 models and compare. Settings are normalized server-side per model — no need to retune."
            : "Model mode locks everything except the model itself. Each variant just picks a different model — the server normalizes settings to that model's equivalents automatically."}
        </p>
        {agentReady && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add a model
          </button>
        )}
      </div>
    </div>
  );
}

function AddModelTile({
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
          ? "Pick a locked agent first to enable model variants"
          : "Add a model variant"
      }
      className="group h-full w-16 shrink-0 flex flex-col items-center justify-center gap-2 border-l-2 border-dashed border-primary/50 bg-primary/5 hover:bg-primary/15 hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/5 disabled:hover:border-primary/50"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-md group-hover:scale-110 transition-transform">
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary rotate-180 [writing-mode:vertical-rl]">
        Add model
      </span>
    </button>
  );
}
