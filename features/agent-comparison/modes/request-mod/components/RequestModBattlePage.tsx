"use client";

/**
 * RequestModBattlePage — Mode 5 page shell.
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
  reorderRequestModColumns,
  setRequestModColumnCollapsed,
} from "../redux/slice";
import {
  selectLockedAgentId,
  selectRequestModColumnIds,
  selectRequestModColumns,
} from "../redux/selectors";
import { addColumnToRequestModBattle } from "../redux/thunks";
import { LockedAgentSection } from "./LockedAgentSection";
import { RequestModColumn } from "./RequestModColumn";
import { RequestModToolbar } from "./RequestModToolbar";
import type { RequestModColumn as RequestModColumnType } from "../types";

const RUNS_WINDOW_ID = "agent-comparison-request-mod-runs";

export function RequestModBattlePage() {
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectRequestModColumns);
  const columnIds = useAppSelector(selectRequestModColumnIds);
  const agentId = useAppSelector(selectLockedAgentId);

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
    dispatch(reorderRequestModColumns({ fromIndex, toIndex }));
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <ModePicker />
      <RequestModToolbar
        runsWindowOpen={runsWindowOpen}
        onToggleRunsWindow={() => setRunsWindowOpen((v) => !v)}
      />

      <LockedAgentSection />

      <div className="flex-1 min-h-0 flex">
        {columns.length === 0 ? (
          <EmptyState
            agentReady={!!agentId}
            onAdd={() => dispatch(addColumnToRequestModBattle(undefined))}
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
        <AddRequestTile
          disabled={!agentId}
          onClick={() => dispatch(addColumnToRequestModBattle(undefined))}
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

function ColumnGroup({ columns }: { columns: RequestModColumnType[] }) {
  const groupKey = columns.map((c) => c.columnId).join("|");
  const equalSize = `${100 / columns.length}%`;

  return (
    <ResizablePanelGroup
      key={groupKey}
      id="agent-comparison-request-mod-columns"
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
  column: RequestModColumnType;
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
      setRequestModColumnCollapsed({
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
        <RequestModColumn
          column={column}
          onToggleCollapse={handleToggleCollapse}
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
          {agentReady ? "Add a request to start" : "Pick an agent above"}
        </div>
        <p className="text-sm text-muted-foreground">
          {agentReady
            ? "Every column runs the SAME agent. Type a different request (and/or different variables) into each column, then hit Submit All to see how the agent handles each."
            : "Request-mod mode locks the agent. Each column gets its own variables and user message — perfect for testing how the same agent handles different phrasings or different test cases."}
        </p>
        {agentReady && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add a request
          </button>
        )}
      </div>
    </div>
  );
}

function AddRequestTile({
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
          ? "Pick an agent first to enable request columns"
          : "Add a request column"
      }
      className="group h-full w-16 shrink-0 flex flex-col items-center justify-center gap-2 border-l-2 border-dashed border-primary/50 bg-primary/5 hover:bg-primary/15 hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/5 disabled:hover:border-primary/50"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-md group-hover:scale-110 transition-transform">
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary rotate-180 [writing-mode:vertical-rl]">
        Add request
      </span>
    </button>
  );
}
