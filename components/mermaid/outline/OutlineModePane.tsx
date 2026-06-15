"use client";

/**
 * OUTLINE mode — a clean structured representation of the diagram for
 * non-technical users. No mermaid or markdown syntax anywhere: steps,
 * connections, topics, messages, and slices read like a simple editor.
 */

import React, { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  IndentDecrease,
  IndentIncrease,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SimpleTooltip } from "@/components/matrx/Tooltip";
import { cn } from "@/lib/utils";

import type { MermaidEditorAction } from "../workbench/useMermaidEditor";
import type { MermaidOp } from "../model/ops";
import type {
  ErDoc,
  FlowDirection,
  FlowchartDoc,
  JourneyDoc,
  MermaidDoc,
  MindmapDoc,
  MindmapNode,
  PieDoc,
  QuadrantDoc,
  SequenceDoc,
  StateDoc,
  TimelineDoc,
} from "../model/types";

interface OutlineModePaneProps {
  doc: MermaidDoc | null;
  /** Why structural editing is unavailable, when it is. */
  unavailableReason?: string;
  dispatch: React.Dispatch<MermaidEditorAction>;
}

export function OutlineModePane({ doc, unavailableReason, dispatch }: OutlineModePaneProps) {
  const apply = (op: MermaidOp) => dispatch({ type: "APPLY_OP", op });

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          {unavailableReason ??
            "This diagram type doesn't support outline editing yet. Use Code mode, or ask AI to make changes."}
        </p>
      </div>
    );
  }

  switch (doc.kind) {
    case "flowchart":
      return <FlowchartOutline doc={doc} apply={apply} />;
    case "mindmap":
      return <MindmapOutline doc={doc} apply={apply} />;
    case "sequence":
      return <SequenceOutline doc={doc} apply={apply} />;
    case "pie":
      return <PieOutline doc={doc} apply={apply} />;
    case "timeline":
      return <TimelineOutline doc={doc} apply={apply} />;
    case "journey":
      return <JourneyOutline doc={doc} apply={apply} />;
    case "quadrant":
      return <QuadrantOutline doc={doc} apply={apply} />;
    case "state":
      return <StateOutline doc={doc} apply={apply} />;
    case "er":
      return <ErOutline doc={doc} apply={apply} />;
    default:
      return null;
  }
}

type Apply = (op: MermaidOp) => void;

// ─── Shared primitives ──────────────────────────────────────────────────────

function InlineTextEdit({
  value,
  onCommit,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else setDraft(value);
  };
  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          "min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-sm text-foreground hover:bg-muted",
          className,
        )}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || <span className="text-muted-foreground">{placeholder ?? "Untitled"}</span>}
      </button>
    );
  }
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      autoFocus
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn("h-7 flex-1 px-1.5 text-base sm:text-sm", className)}
    />
  );
}

function RowShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "group/row flex min-h-9 items-center gap-1 rounded-md px-1.5 hover:bg-muted/60",
        className,
      )}
    >
      {children}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
  destructive,
  hidden,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
  hidden?: boolean;
}) {
  return (
    <SimpleTooltip text={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "rounded p-1.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100",
          destructive ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:bg-muted",
          hidden && "invisible",
        )}
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}

function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pb-1 pt-3 first:pt-0">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>
      {action}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={onClick}>
      <Plus className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

// ─── Flowchart ──────────────────────────────────────────────────────────────

const DIRECTIONS: Array<{ value: FlowDirection; label: string }> = [
  { value: "TD", label: "Top to bottom" },
  { value: "LR", label: "Left to right" },
  { value: "BT", label: "Bottom to top" },
  { value: "RL", label: "Right to left" },
];

function FlowchartOutline({ doc, apply }: { doc: FlowchartDoc; apply: Apply }) {
  const nodeLabel = (id: string) => doc.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="flex items-center gap-2 pb-2">
        <span className="text-xs text-muted-foreground">Layout</span>
        <Select
          value={doc.direction === "TB" ? "TD" : doc.direction}
          onValueChange={(value) => apply({ type: "setDirection", direction: value as FlowDirection })}
        >
          <SelectTrigger className="h-7 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTIONS.map((d) => (
              <SelectItem key={d.value} value={d.value} className="text-xs">
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SectionHeading
        action={<AddButton label="Add step" onClick={() => apply({ type: "addNode", label: "New step" })} />}
      >
        Steps
      </SectionHeading>
      <div className="space-y-0.5">
        {doc.nodes.map((node) => {
          const outgoing = doc.edges.filter((e) => e.from === node.id);
          return (
            <RowShell key={node.id}>
              <InlineTextEdit
                value={node.label}
                ariaLabel={`Rename ${node.label}`}
                onCommit={(label) => apply({ type: "renameNode", id: node.id, label })}
              />
              {outgoing.length > 0 && (
                <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground sm:inline">
                  → {outgoing.map((e) => nodeLabel(e.to)).join(", ")}
                </span>
              )}
              <IconAction
                label="Add connected step"
                onClick={() => apply({ type: "addNode", label: "New step", connectFrom: node.id })}
              >
                <Plus className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label="Delete step" destructive onClick={() => apply({ type: "deleteNode", id: node.id })}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconAction>
            </RowShell>
          );
        })}
      </div>

      <SectionHeading
        action={
          doc.nodes.length >= 2 ? (
            <AddButton
              label="Add connection"
              onClick={() => apply({ type: "connectNodes", from: doc.nodes[0].id, to: doc.nodes[1].id })}
            />
          ) : undefined
        }
      >
        Connections
      </SectionHeading>
      <div className="space-y-0.5">
        {doc.edges.map((edge) => (
          <RowShell key={edge.id}>
            <span className="max-w-[30%] truncate text-sm">{nodeLabel(edge.from)}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <InlineTextEdit
              value={edge.label ?? ""}
              placeholder="label"
              ariaLabel="Connection label"
              className="max-w-28 text-xs"
              onCommit={(label) => apply({ type: "setEdgeLabel", id: edge.id, label })}
            />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-[30%] flex-1 truncate text-sm">{nodeLabel(edge.to)}</span>
            <IconAction label="Reverse" onClick={() => apply({ type: "reverseEdge", id: edge.id })}>
              <ArrowDown className="h-3.5 w-3.5 rotate-90" />
            </IconAction>
            <IconAction label="Delete connection" destructive onClick={() => apply({ type: "deleteEdge", id: edge.id })}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconAction>
          </RowShell>
        ))}
        {doc.edges.length === 0 && (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">No connections yet.</p>
        )}
      </div>

      {doc.subgraphs.length > 0 && (
        <>
          <SectionHeading>Groups</SectionHeading>
          <div className="space-y-0.5">
            {doc.subgraphs.map((sg) => (
              <RowShell key={sg.id}>
                <InlineTextEdit
                  value={sg.title}
                  ariaLabel={`Rename group ${sg.title}`}
                  onCommit={(title) => apply({ type: "renameSubgraph", id: sg.id, title })}
                />
                <span className="text-xs text-muted-foreground">
                  {sg.nodeIds.length} step{sg.nodeIds.length === 1 ? "" : "s"}
                </span>
              </RowShell>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Mindmap ────────────────────────────────────────────────────────────────

function MindmapOutline({ doc, apply }: { doc: MindmapDoc; apply: Apply }) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <MindmapNodeRow node={doc.root} depth={0} apply={apply} isRoot />
    </div>
  );
}

function MindmapNodeRow({
  node,
  depth,
  apply,
  isRoot,
}: {
  node: MindmapNode;
  depth: number;
  apply: Apply;
  isRoot?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <RowShell className={cn(depth > 0 && "ml-[calc(var(--mm-depth)*1.25rem)]")}>
        <span style={{ width: depth * 20 }} className="shrink-0" />
        <SimpleTooltip text={collapsed ? "Expand" : "Collapse"}>
          <button
            type="button"
            aria-label={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "rounded p-0.5 text-muted-foreground hover:bg-muted",
              node.children.length === 0 && "invisible",
            )}
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")} />
          </button>
        </SimpleTooltip>
        <InlineTextEdit
          value={node.label}
          ariaLabel={`Rename ${node.label}`}
          className={cn(isRoot && "font-medium")}
          onCommit={(label) => apply({ type: "renameNode", id: node.id, label })}
        />
        <IconAction label="Add subtopic" onClick={() => apply({ type: "addChild", parentId: node.id, label: "New topic" })}>
          <Plus className="h-3.5 w-3.5" />
        </IconAction>
        <IconAction label="Nest under previous" hidden={isRoot} onClick={() => apply({ type: "indent", id: node.id })}>
          <IndentIncrease className="h-3.5 w-3.5" />
        </IconAction>
        <IconAction label="Move up a level" hidden={isRoot} onClick={() => apply({ type: "outdent", id: node.id })}>
          <IndentDecrease className="h-3.5 w-3.5" />
        </IconAction>
        <IconAction label="Delete topic" destructive hidden={isRoot} onClick={() => apply({ type: "deleteNode", id: node.id })}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconAction>
      </RowShell>
      {!collapsed &&
        node.children.map((child) => (
          <MindmapNodeRow key={child.id} node={child} depth={depth + 1} apply={apply} />
        ))}
    </div>
  );
}

// ─── Sequence ───────────────────────────────────────────────────────────────

function SequenceOutline({ doc, apply }: { doc: SequenceDoc; apply: Apply }) {
  const participantName = (id: string) =>
    doc.participants.find((p) => p.id === id)?.alias ?? id;

  return (
    <div className="h-full overflow-y-auto p-3">
      <SectionHeading
        action={<AddButton label="Add participant" onClick={() => apply({ type: "addParticipant", label: "New participant" })} />}
      >
        Participants
      </SectionHeading>
      <div className="flex flex-wrap gap-1.5 pb-1">
        {doc.participants.map((p) => (
          <span
            key={p.id}
            className="group/chip inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs"
          >
            <InlineTextEdit
              value={p.alias ?? p.id}
              ariaLabel={`Rename ${p.alias ?? p.id}`}
              className="!flex-none !px-0.5 !py-0 text-xs"
              onCommit={(label) => apply({ type: "renameParticipant", id: p.id, label })}
            />
            <SimpleTooltip text={`Delete ${p.alias ?? p.id}`}>
              <button
                type="button"
                aria-label={`Delete ${p.alias ?? p.id}`}
                onClick={() => apply({ type: "deleteParticipant", id: p.id })}
                className="rounded-full p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/chip:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </SimpleTooltip>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 py-2">
        <Switch
          checked={doc.autonumber}
          onCheckedChange={(enabled) => apply({ type: "setAutonumber", enabled })}
          id="mermaid-autonumber"
        />
        <label htmlFor="mermaid-autonumber" className="text-xs text-muted-foreground">
          Number the messages
        </label>
      </div>

      <SectionHeading
        action={
          doc.participants.length >= 2 ? (
            <AddButton
              label="Add message"
              onClick={() =>
                apply({
                  type: "addMessage",
                  from: doc.participants[0].id,
                  to: doc.participants[1].id,
                  text: "New message",
                })
              }
            />
          ) : undefined
        }
      >
        Messages
      </SectionHeading>
      <div className="space-y-0.5">
        {doc.items.map((item) =>
          item.kind === "message" ? (
            <RowShell key={item.id}>
              <Select value={item.from} onValueChange={(from) => apply({ type: "editMessage", id: item.id, from })}>
                <SelectTrigger className="h-7 w-24 shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {doc.participants.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {participantName(p.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Select value={item.to} onValueChange={(to) => apply({ type: "editMessage", id: item.id, to })}>
                <SelectTrigger className="h-7 w-24 shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {doc.participants.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {participantName(p.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InlineTextEdit
                value={item.text}
                ariaLabel="Message text"
                onCommit={(text) => apply({ type: "editMessage", id: item.id, text })}
              />
              <IconAction label="Move up" onClick={() => apply({ type: "moveMessage", id: item.id, direction: "up" })}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label="Move down" onClick={() => apply({ type: "moveMessage", id: item.id, direction: "down" })}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label="Delete message" destructive onClick={() => apply({ type: "deleteMessage", id: item.id })}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconAction>
            </RowShell>
          ) : (
            <RowShell key={item.id} className="bg-muted/30">
              <span className="truncate px-1.5 font-mono text-xs text-muted-foreground">{item.raw.trim()}</span>
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                advanced — edit in Code
              </span>
            </RowShell>
          ),
        )}
      </div>
    </div>
  );
}

// ─── Pie ────────────────────────────────────────────────────────────────────

function PieOutline({ doc, apply }: { doc: PieDoc; apply: Apply }) {
  const total = doc.slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className="h-full overflow-y-auto p-3">
      <SectionHeading>Title</SectionHeading>
      <RowShell>
        <InlineTextEdit
          value={doc.title ?? ""}
          placeholder="Chart title"
          ariaLabel="Chart title"
          onCommit={(title) => apply({ type: "setTitle", title })}
        />
      </RowShell>

      <div className="flex items-center gap-2 py-2">
        <Switch
          checked={doc.showData}
          onCheckedChange={(enabled) => apply({ type: "setShowData", enabled })}
          id="mermaid-showdata"
        />
        <label htmlFor="mermaid-showdata" className="text-xs text-muted-foreground">
          Show values on the chart
        </label>
      </div>

      <SectionHeading
        action={<AddButton label="Add slice" onClick={() => apply({ type: "addSlice", label: "New slice", value: 10 })} />}
      >
        Slices
      </SectionHeading>
      <div className="space-y-0.5">
        {doc.slices.map((slice) => (
          <RowShell key={slice.id}>
            <InlineTextEdit
              value={slice.label}
              ariaLabel={`Rename ${slice.label}`}
              onCommit={(label) => apply({ type: "editSlice", id: slice.id, label })}
            />
            <Input
              type="number"
              defaultValue={slice.value}
              key={`${slice.id}-${slice.value}`}
              aria-label={`Value for ${slice.label}`}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value >= 0 && value !== slice.value) {
                  apply({ type: "editSlice", id: slice.id, value });
                }
              }}
              className="h-7 w-20 shrink-0 text-right text-base sm:text-sm"
            />
            {total > 0 && (
              <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                {Math.round((slice.value / total) * 100)}%
              </span>
            )}
            <IconAction label="Delete slice" destructive onClick={() => apply({ type: "deleteSlice", id: slice.id })}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconAction>
          </RowShell>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline ───────────────────────────────────────────────────────────────

function TimelineOutline({ doc, apply }: { doc: TimelineDoc; apply: Apply }) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <SectionHeading>Title</SectionHeading>
      <RowShell>
        <InlineTextEdit
          value={doc.title ?? ""}
          placeholder="Timeline title"
          ariaLabel="Timeline title"
          onCommit={(title) => apply({ type: "setTitle", title })}
        />
      </RowShell>

      <SectionHeading
        action={<AddButton label="Add section" onClick={() => apply({ type: "addSection", title: "New section" })} />}
      >
        Sections
      </SectionHeading>
      {doc.sections.map((section) => (
        <div key={section.id} className="pb-2">
          {section.title !== undefined && (
            <RowShell className="bg-muted/40">
              <InlineTextEdit
                value={section.title}
                ariaLabel={`Rename section ${section.title}`}
                className="font-medium"
                onCommit={(title) => apply({ type: "renameSection", id: section.id, title })}
              />
              <IconAction
                label="Add entry"
                onClick={() => apply({ type: "addRow", sectionId: section.id, period: "New period", event: "What happened" })}
              >
                <Plus className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label="Delete section" destructive onClick={() => apply({ type: "deleteSection", id: section.id })}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconAction>
            </RowShell>
          )}
          {section.rows.map((row) => (
            <div key={row.id} className="ml-2 border-l border-border pl-2">
              <RowShell>
                <InlineTextEdit
                  value={row.period}
                  ariaLabel={`Period ${row.period}`}
                  className="max-w-32 font-medium"
                  onCommit={(period) => apply({ type: "editRow", id: row.id, period })}
                />
                <IconAction label="Add event" onClick={() => apply({ type: "addEvent", rowId: row.id, text: "New event" })}>
                  <Plus className="h-3.5 w-3.5" />
                </IconAction>
                <IconAction label="Delete entry" destructive onClick={() => apply({ type: "deleteRow", id: row.id })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconAction>
              </RowShell>
              {row.events.map((event, index) => (
                <RowShell key={`${row.id}-${index}`} className="ml-4">
                  <InlineTextEdit
                    value={event}
                    ariaLabel={`Event ${event}`}
                    onCommit={(text) => apply({ type: "editEvent", rowId: row.id, eventIndex: index, text })}
                  />
                  <IconAction
                    label="Delete event"
                    destructive
                    onClick={() => apply({ type: "deleteEvent", rowId: row.id, eventIndex: index })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconAction>
                </RowShell>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── User Journey ─────────────────────────────────────────────────────────────

function JourneyOutline({ doc, apply }: { doc: JourneyDoc; apply: Apply }) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <SectionHeading>Title</SectionHeading>
      <RowShell>
        <InlineTextEdit
          value={doc.title ?? ""}
          placeholder="Journey title"
          ariaLabel="Journey title"
          onCommit={(title) => apply({ type: "setTitle", title })}
        />
      </RowShell>

      <SectionHeading
        action={<AddButton label="Add section" onClick={() => apply({ type: "addSection", title: "New section" })} />}
      >
        Sections
      </SectionHeading>
      {doc.sections.map((section) => (
        <div key={section.id} className="pb-2">
          {section.title !== undefined && (
            <RowShell className="bg-muted/40">
              <InlineTextEdit
                value={section.title}
                ariaLabel={`Rename section ${section.title}`}
                className="font-medium"
                onCommit={(title) => apply({ type: "renameSection", id: section.id, title })}
              />
              <IconAction
                label="Add task"
                onClick={() => apply({ type: "addTask", sectionId: section.id, name: "New task", score: 3, actors: [] })}
              >
                <Plus className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label="Delete section" destructive onClick={() => apply({ type: "deleteSection", id: section.id })}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconAction>
            </RowShell>
          )}
          <div className="ml-2 space-y-0.5 border-l border-border pl-2">
            {section.tasks.map((task) => (
              <RowShell key={task.id}>
                <InlineTextEdit
                  value={task.name}
                  ariaLabel={`Rename ${task.name}`}
                  onCommit={(name) => apply({ type: "editTask", id: task.id, name })}
                />
                <Input
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={task.score}
                  key={`${task.id}-${task.score}`}
                  aria-label={`Score for ${task.name}`}
                  onBlur={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    const score = Math.max(1, Math.min(5, Math.round(raw)));
                    if (score !== task.score) apply({ type: "editTask", id: task.id, score });
                  }}
                  className="h-7 w-14 shrink-0 text-right text-base sm:text-sm"
                />
                <InlineTextEdit
                  value={task.actors.join(", ")}
                  placeholder="actors"
                  ariaLabel={`Actors for ${task.name}`}
                  className="max-w-32 text-xs"
                  onCommit={(value) =>
                    apply({
                      type: "editTask",
                      id: task.id,
                      actors: value.split(",").map((a) => a.trim()).filter(Boolean),
                    })
                  }
                />
                <IconAction label="Delete task" destructive onClick={() => apply({ type: "deleteTask", id: task.id })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconAction>
              </RowShell>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Quadrant ─────────────────────────────────────────────────────────────────

const QUADRANT_NAMES = ["Top-right", "Top-left", "Bottom-left", "Bottom-right"];

function QuadrantOutline({ doc, apply }: { doc: QuadrantDoc; apply: Apply }) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <SectionHeading>Title</SectionHeading>
      <RowShell>
        <InlineTextEdit
          value={doc.title ?? ""}
          placeholder="Chart title"
          ariaLabel="Chart title"
          onCommit={(title) => apply({ type: "setTitle", title })}
        />
      </RowShell>

      <SectionHeading>Axes</SectionHeading>
      <RowShell>
        <span className="w-12 shrink-0 text-xs text-muted-foreground">X</span>
        <InlineTextEdit
          value={doc.xAxis ?? ""}
          placeholder="Low --> High"
          ariaLabel="X axis"
          onCommit={(text) => apply({ type: "setXAxis", text })}
        />
      </RowShell>
      <RowShell>
        <span className="w-12 shrink-0 text-xs text-muted-foreground">Y</span>
        <InlineTextEdit
          value={doc.yAxis ?? ""}
          placeholder="Low --> High"
          ariaLabel="Y axis"
          onCommit={(text) => apply({ type: "setYAxis", text })}
        />
      </RowShell>

      <SectionHeading>Quadrant labels</SectionHeading>
      {QUADRANT_NAMES.map((name, index) => (
        <RowShell key={index}>
          <span className="w-24 shrink-0 text-xs text-muted-foreground">{name}</span>
          <InlineTextEdit
            value={doc.quadrantLabels[index] ?? ""}
            placeholder="Label"
            ariaLabel={`${name} quadrant label`}
            onCommit={(text) => apply({ type: "setQuadrantLabel", index, text })}
          />
        </RowShell>
      ))}

      <SectionHeading
        action={<AddButton label="Add point" onClick={() => apply({ type: "addPoint", label: "New point", x: 0.5, y: 0.5 })} />}
      >
        Points
      </SectionHeading>
      <div className="space-y-0.5">
        {doc.points.map((point) => (
          <RowShell key={point.id}>
            <InlineTextEdit
              value={point.label}
              ariaLabel={`Rename ${point.label}`}
              onCommit={(label) => apply({ type: "editPoint", id: point.id, label })}
            />
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              defaultValue={point.x}
              key={`${point.id}-x-${point.x}`}
              aria-label={`X for ${point.label}`}
              onBlur={(e) => {
                const x = Number(e.target.value);
                if (Number.isFinite(x) && x !== point.x) apply({ type: "editPoint", id: point.id, x });
              }}
              className="h-7 w-16 shrink-0 text-right text-base sm:text-sm"
            />
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              defaultValue={point.y}
              key={`${point.id}-y-${point.y}`}
              aria-label={`Y for ${point.label}`}
              onBlur={(e) => {
                const y = Number(e.target.value);
                if (Number.isFinite(y) && y !== point.y) apply({ type: "editPoint", id: point.id, y });
              }}
              className="h-7 w-16 shrink-0 text-right text-base sm:text-sm"
            />
            <IconAction label="Delete point" destructive onClick={() => apply({ type: "deletePoint", id: point.id })}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconAction>
          </RowShell>
        ))}
      </div>
    </div>
  );
}

// ─── State ────────────────────────────────────────────────────────────────────

function StateOutline({ doc, apply }: { doc: StateDoc; apply: Apply }) {
  const stateName = (id: string) => (id === "[*]" ? "start / end" : id);

  return (
    <div className="h-full overflow-y-auto p-3">
      <SectionHeading
        action={<AddButton label="Add state" onClick={() => apply({ type: "addState", name: `State${doc.states.length + 1}` })} />}
      >
        States
      </SectionHeading>
      <div className="space-y-0.5">
        {doc.states.map((state) => (
          <RowShell key={state.id}>
            <span className="max-w-[30%] shrink-0 truncate font-medium text-sm">{state.id}</span>
            <InlineTextEdit
              value={state.description ?? ""}
              placeholder="description"
              ariaLabel={`Description for ${state.id}`}
              className="text-xs"
              onCommit={(description) => apply({ type: "setStateDescription", id: state.id, description })}
            />
            <IconAction label="Delete state" destructive onClick={() => apply({ type: "deleteState", id: state.id })}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconAction>
          </RowShell>
        ))}
        {doc.states.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">No named states yet.</p>}
      </div>

      <SectionHeading
        action={
          doc.states.length >= 1 ? (
            <AddButton
              label="Add transition"
              onClick={() => apply({ type: "addTransition", from: "[*]", to: doc.states[0].id })}
            />
          ) : undefined
        }
      >
        Transitions
      </SectionHeading>
      <div className="space-y-0.5">
        {doc.transitions.map((t) => (
          <RowShell key={t.id}>
            <span className="w-20 shrink-0 truncate text-sm">{stateName(t.from)}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="w-20 shrink-0 truncate text-sm">{stateName(t.to)}</span>
            <InlineTextEdit
              value={t.label ?? ""}
              placeholder="label"
              ariaLabel="Transition label"
              className="text-xs"
              onCommit={(label) => apply({ type: "setTransitionLabel", id: t.id, label })}
            />
            <IconAction label="Reverse" onClick={() => apply({ type: "reverseTransition", id: t.id })}>
              <ArrowDown className="h-3.5 w-3.5 rotate-90" />
            </IconAction>
            <IconAction label="Delete transition" destructive onClick={() => apply({ type: "deleteTransition", id: t.id })}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconAction>
          </RowShell>
        ))}
        {doc.transitions.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">No transitions yet.</p>}
      </div>
    </div>
  );
}

// ─── Entity Relationship ──────────────────────────────────────────────────────

const ER_LEFT_CARD: Array<{ value: string; label: string }> = [
  { value: "||", label: "exactly one" },
  { value: "|o", label: "zero or one" },
  { value: "}|", label: "one or more" },
  { value: "}o", label: "zero or more" },
];
const ER_RIGHT_CARD: Array<{ value: string; label: string }> = [
  { value: "||", label: "exactly one" },
  { value: "o|", label: "zero or one" },
  { value: "|{", label: "one or more" },
  { value: "o{", label: "zero or more" },
];

function erEntityName(id: string): string {
  return id.startsWith('"') && id.endsWith('"') ? id.slice(1, -1) : id;
}

function ErOutline({ doc, apply }: { doc: ErDoc; apply: Apply }) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <SectionHeading>Entities</SectionHeading>
      <div className="flex flex-wrap gap-1.5 pb-1">
        {doc.entities.map((e) => (
          <span
            key={e.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs"
          >
            {erEntityName(e.id)}
            {e.blockRaw && <span className="text-[10px] text-muted-foreground">attrs</span>}
          </span>
        ))}
        {doc.entities.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">No entities yet.</p>}
      </div>
      <p className="pb-1 text-[11px] text-muted-foreground">Entity attributes are edited in Code mode.</p>

      <SectionHeading
        action={
          doc.entities.length >= 2 ? (
            <AddButton
              label="Add relationship"
              onClick={() => apply({ type: "addRelationship", left: doc.entities[0].id, right: doc.entities[1].id })}
            />
          ) : undefined
        }
      >
        Relationships
      </SectionHeading>
      <div className="space-y-0.5">
        {doc.relationships.map((r) => (
          <RowShell key={r.id}>
            <span className="w-20 shrink-0 truncate text-sm">{erEntityName(r.left)}</span>
            <Select value={r.leftCard} onValueChange={(leftCard) => apply({ type: "setRelationshipCardinality", id: r.id, leftCard })}>
              <SelectTrigger className="h-7 w-28 shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ER_LEFT_CARD.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={r.rightCard} onValueChange={(rightCard) => apply({ type: "setRelationshipCardinality", id: r.id, rightCard })}>
              <SelectTrigger className="h-7 w-28 shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ER_RIGHT_CARD.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="w-20 shrink-0 truncate text-sm">{erEntityName(r.right)}</span>
            <InlineTextEdit
              value={r.label}
              placeholder="label"
              ariaLabel="Relationship label"
              className="text-xs"
              onCommit={(label) => apply({ type: "setRelationshipLabel", id: r.id, label })}
            />
            <IconAction label="Reverse" onClick={() => apply({ type: "reverseRelationship", id: r.id })}>
              <ArrowDown className="h-3.5 w-3.5 rotate-90" />
            </IconAction>
            <IconAction label="Delete relationship" destructive onClick={() => apply({ type: "deleteRelationship", id: r.id })}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconAction>
          </RowShell>
        ))}
        {doc.relationships.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">No relationships yet.</p>}
      </div>
    </div>
  );
}
