"use client";

/**
 * VariationsBattlePage — the "full builder" comparison mode.
 *
 * Start from a TEMPLATE agent, spin up N variations (each a synthetic clone),
 * and edit EVERYTHING the Agent Builder exposes per variation — inside one
 * floating editor window with a tab per variation. The same test input runs
 * against every variation via the manual endpoint; nothing persists to the
 * agents table.
 *
 * Layout mirrors the other locked-axis modes: ModePicker + toolbar +
 * template/test-input strip + dnd-reorderable run columns + shared runs
 * window. The mode-specific piece is the tabbed editor window.
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
import { Loader2, Plus } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SharedRunsWindow } from "@/features/agent-comparison/components/SharedRunsWindow";
import { ModePicker } from "@/features/agent-comparison/shared/ModePicker";
import {
  reorderVariationColumns,
  setVariationColumnCollapsed,
} from "../redux/slice";
import {
  selectSourceAgentId,
  selectVariationColumnIds,
  selectVariationColumns,
} from "../redux/selectors";
import {
  addColumnToVariationsBattle,
  addVariationColumns,
} from "../redux/thunks";
import { LockedInputSection } from "./LockedInputSection";
import { VariationsColumn } from "./VariationsColumn";
import { VariationsToolbar } from "./VariationsToolbar";
import { VariationsEditorWindow } from "./VariationsEditorWindow";
import type { VariationColumn as VariationColumnType } from "../types";

const RUNS_WINDOW_ID = "agent-comparison-variations-runs";
const EDITOR_WINDOW_ID = "agent-comparison-variations-editor";

export function VariationsBattlePage() {
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectVariationColumns);
  const columnIds = useAppSelector(selectVariationColumnIds);
  const sourceAgentId = useAppSelector(selectSourceAgentId);

  const [runsWindowOpen, setRunsWindowOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeEditorColumnId, setActiveEditorColumnId] = useState<
    string | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const openEditorFor = (columnId: string) => {
    setActiveEditorColumnId(columnId);
    setEditorOpen(true);
  };

  const toggleEditor = () => {
    if (!editorOpen && !activeEditorColumnId && columns.length > 0) {
      setActiveEditorColumnId(columns[0].columnId);
    }
    setEditorOpen((v) => !v);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = columnIds.indexOf(String(active.id));
    const toIndex = columnIds.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    dispatch(reorderVariationColumns({ fromIndex, toIndex }));
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <ModePicker />
      <VariationsToolbar
        runsWindowOpen={runsWindowOpen}
        onToggleRunsWindow={() => setRunsWindowOpen((v) => !v)}
        editorOpen={editorOpen}
        onToggleEditor={toggleEditor}
      />

      <LockedInputSection />

      <div className="flex-1 min-h-0 flex">
        {columns.length === 0 ? (
          <EmptyState sourceAgentReady={!!sourceAgentId} />
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext
              items={columnIds}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex-1 min-w-0">
                <ColumnGroup columns={columns} onEdit={openEditorFor} />
              </div>
            </SortableContext>
          </DndContext>
        )}
        <AddVariantTile
          disabled={!sourceAgentId}
          onClick={() => dispatch(addColumnToVariationsBattle(undefined))}
        />
      </div>

      {runsWindowOpen && (
        <SharedRunsWindow
          id={RUNS_WINDOW_ID}
          onClose={() => setRunsWindowOpen(false)}
        />
      )}

      {editorOpen && (
        <VariationsEditorWindow
          id={EDITOR_WINDOW_ID}
          columns={columns}
          activeColumnId={activeEditorColumnId}
          onActiveColumnChange={setActiveEditorColumnId}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

function ColumnGroup({
  columns,
  onEdit,
}: {
  columns: VariationColumnType[];
  onEdit: (columnId: string) => void;
}) {
  const groupKey = columns.map((c) => c.columnId).join("|");
  const equalSize = `${100 / columns.length}%`;

  return (
    <ResizablePanelGroup
      key={groupKey}
      id="agent-comparison-variations-columns"
      orientation="horizontal"
      className="h-full w-full"
    >
      {columns.map((col, idx) => (
        <ColumnSegment
          key={col.columnId}
          column={col}
          defaultSize={equalSize}
          showHandle={idx > 0}
          onEdit={() => onEdit(col.columnId)}
        />
      ))}
    </ResizablePanelGroup>
  );
}

function ColumnSegment({
  column,
  defaultSize,
  showHandle,
  onEdit,
}: {
  column: VariationColumnType;
  defaultSize: string;
  showHandle: boolean;
  onEdit: () => void;
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
      setVariationColumnCollapsed({
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
        <VariationsColumn
          column={column}
          onToggleCollapse={handleToggleCollapse}
          onEdit={onEdit}
        />
      </ResizablePanel>
    </>
  );
}

function EmptyState({ sourceAgentReady }: { sourceAgentReady: boolean }) {
  const dispatch = useAppDispatch();
  const [count, setCount] = useState(2);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await dispatch(addVariationColumns({ count })).unwrap();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div className="max-w-md space-y-4">
        <div className="text-base font-medium">
          {sourceAgentReady
            ? "How many variations?"
            : "Pick a template agent above"}
        </div>
        <p className="text-sm text-muted-foreground">
          {sourceAgentReady
            ? "Each variation starts as an editable copy of the template. Open the editor to change anything the Agent Builder exposes — model, system prompt, settings, tools — then run them side-by-side. Nothing is saved to your agents."
            : "Variations mode clones a template agent into N editable copies and runs the same test input against each — entirely in memory, via the manual endpoint."}
        </p>
        {sourceAgentReady && (
          <div className="flex items-center justify-center gap-2">
            <input
              type="number"
              min={1}
              max={12}
              value={count}
              onChange={(e) =>
                setCount(
                  Math.max(1, Math.min(12, Number(e.target.value) || 1)),
                )
              }
              className="w-16 h-9 text-center text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create variations
            </button>
          </div>
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
          ? "Pick a template agent first to enable variations"
          : "Add a variation"
      }
      className="group h-full w-16 shrink-0 flex flex-col items-center justify-center gap-2 border-l-2 border-dashed border-primary/50 bg-primary/5 hover:bg-primary/15 hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/5 disabled:hover:border-primary/50"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-md group-hover:scale-110 transition-transform">
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary rotate-180 [writing-mode:vertical-rl]">
        Add variation
      </span>
    </button>
  );
}
