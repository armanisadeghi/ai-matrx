"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  Flag,
  Folder,
  Tag,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssociateTask } from "@/features/tasks/hooks/useAssociateTask";
import {
  selectOrganizationId,
  selectProjectId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { selectProjects } from "@/features/tasks/redux/selectors";
import { selectAllScopesFlat } from "@/features/scopes/redux/selectors/tree";
import type { TaskItemType } from "@/components/mardown-display/blocks/tasks/TaskChecklist";
import { cn } from "@/utils/cn";

/**
 * Flatten the parsed TaskItemType[] (which is nested with "section" / "task"
 * / "subtask") into a flat list of draft task rows the user can tweak. We
 * preserve parent/child relations via `parentIndex` so the RPC can wire
 * `parent_task_id` after insert (handled server-side in a follow-up if needed).
 *
 * For the initial flow we only create the leaf "task" and "subtask" rows —
 * "section" items act as group headers only (not real tasks).
 */
export interface DraftTaskRow {
  key: string; // stable UI key
  include: boolean;
  title: string;
  priority: "low" | "medium" | "high" | "";
  due_date: string; // yyyy-mm-dd or ""
  description: string; // currently unused, reserved
  type: "section" | "task" | "subtask";
  indent: number;
  parentKey: string | null;
}

export function flattenChecklist(items: TaskItemType[]): DraftTaskRow[] {
  const rows: DraftTaskRow[] = [];
  const walk = (
    arr: TaskItemType[],
    depth: number,
    parentKey: string | null,
  ) => {
    for (const item of arr) {
      const key = item.id || `${item.title}-${rows.length}`;
      rows.push({
        key,
        include: item.type !== "section",
        title: item.title,
        priority: "",
        due_date: "",
        description: "",
        type: item.type,
        indent: depth,
        parentKey,
      });
      if (item.children && item.children.length > 0) {
        walk(item.children, depth + 1, key);
      }
    }
  };
  walk(items, 0, null);
  return rows;
}

interface TaskPreviewWindowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The parsed items from parseMarkdownChecklist */
  parsedItems: TaskItemType[];
  /** Source that will be stamped on every created task's association row */
  source?: {
    entity_type: string;
    entity_id: string;
    metadata?: Record<string, unknown>;
  };
  /** Called after all tasks are created, with the list of new ids */
  onCreated?: (taskIds: string[]) => void;
}

/**
 * Non-blocking preview + refinement window for bulk task creation.
 *
 * Opens a Dialog (desktop) / Drawer (mobile) showing every parsed item as an
 * editable row. User picks which to include, tweaks titles, sets project/
 * priority/due, then Confirm → one RPC creates them all + links to source.
 *
 * Quality gate between "AI generated noise" and "real persisted tasks".
 */
export default function TaskPreviewWindow({
  open,
  onOpenChange,
  parsedItems,
  source,
  onCreated,
}: TaskPreviewWindowProps) {
  const isMobile = useIsMobile();
  const projects = useAppSelector(selectProjects);
  const appProjectId = useAppSelector(selectProjectId);
  const appOrgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const allScopes = useAppSelector(selectAllScopesFlat);
  const { createBulk, isBusy } = useAssociateTask();

  const [rows, setRows] = useState<DraftTaskRow[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [defaultPriority, setDefaultPriority] = useState<
    "" | "low" | "medium" | "high"
  >("");

  useEffect(() => {
    if (open) {
      setRows(flattenChecklist(parsedItems));
      setProjectId(appProjectId ?? "");
      setDefaultPriority("");
    }
  }, [open, parsedItems, appProjectId]);

  const scopeChips = useMemo(() => {
    const ids = Object.values(scopeSelections ?? {}).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    return ids
      .map((id) => allScopes.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({ id: s!.id, name: s!.name }));
  }, [scopeSelections, allScopes]);

  const toggleRow = (key: string) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, include: !r.include } : r)),
    );
  };

  const patchRow = <K extends keyof DraftTaskRow>(
    key: string,
    field: K,
    value: DraftTaskRow[K],
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  };

  const toggleAll = (checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.type === "section" ? r : { ...r, include: checked })),
    );
  };

  const selectedCount = rows.filter(
    (r) => r.include && r.type !== "section",
  ).length;

  const handleConfirm = async () => {
    const selected = rows.filter((r) => r.include && r.type !== "section");
    if (selected.length === 0) return;
    const items = selected.map((r) => ({
      title: r.title.trim() || "Untitled task",
      description: r.description || undefined,
      priority: (r.priority || defaultPriority || null) as
        | "low"
        | "medium"
        | "high"
        | null,
      due_date: r.due_date || null,
    }));
    const tasks = await createBulk({
      items,
      project_id: projectId || undefined,
      organization_id: appOrgId ?? undefined,
      scope_ids: Object.values(scopeSelections ?? {}).filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
      source: source
        ? { entity_type: source.entity_type, entity_id: source.entity_id }
        : undefined,
      metadata: source?.metadata,
    });
    onCreated?.(tasks.map((t) => t.id));
    onOpenChange(false);
  };

  const body = (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Top controls */}
      <div className="shrink-0 px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <Folder className="w-3 h-3" />
            Project:
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-7 bg-card border border-border rounded px-2 text-xs outline-none hover:border-foreground/30"
            >
              <option value="">Auto</option>
              {projects
                .filter((p) => p.id !== "__unassigned__")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <Flag className="w-3 h-3" />
            Default priority:
            <select
              value={defaultPriority}
              onChange={(e) =>
                setDefaultPriority(
                  e.target.value as "" | "low" | "medium" | "high",
                )
              }
              className="h-7 bg-card border border-border rounded px-2 text-xs outline-none hover:border-foreground/30"
            >
              <option value="">None</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          {scopeChips.length > 0 && (
            <span className="flex items-center gap-1 ml-auto text-muted-foreground">
              <Tag className="w-3 h-3" />
              Will tag:
              {scopeChips.map((s) => (
                <span
                  key={s.id}
                  className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium"
                >
                  {s.name}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 space-y-1">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleAll(true)}
              className="h-6 text-[11px]"
            >
              Select all
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {selectedCount} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleAll(false)}
              className="h-6 text-[11px]"
            >
              Clear
            </Button>
          </div>
          {rows.map((row) => {
            if (row.type === "section") {
              return (
                <div
                  key={row.key}
                  className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ paddingLeft: row.indent * 16 }}
                >
                  {row.title}
                </div>
              );
            }
            return (
              <div
                key={row.key}
                className={cn(
                  "flex items-start gap-2 py-1.5 rounded transition-colors",
                  !row.include && "opacity-50",
                )}
                style={{ paddingLeft: row.indent * 16 }}
              >
                <Checkbox
                  checked={row.include}
                  onCheckedChange={() => toggleRow(row.key)}
                  className="mt-1.5"
                />
                <Input
                  value={row.title}
                  onChange={(e) => patchRow(row.key, "title", e.target.value)}
                  disabled={!row.include}
                  className="flex-1 h-7 text-xs"
                  style={{ fontSize: "16px" }}
                />
                <select
                  value={row.priority}
                  onChange={(e) =>
                    patchRow(
                      row.key,
                      "priority",
                      e.target.value as DraftTaskRow["priority"],
                    )
                  }
                  disabled={!row.include}
                  className="h-7 bg-card border border-border rounded px-1 text-[11px] outline-none"
                >
                  <option value="">—</option>
                  <option value="high">High</option>
                  <option value="medium">Med</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="date"
                  value={row.due_date}
                  onChange={(e) =>
                    patchRow(row.key, "due_date", e.target.value)
                  }
                  disabled={!row.include}
                  className="h-7 bg-card border border-border rounded px-1 text-[11px] outline-none"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[90vh] flex flex-col">
          <DrawerHeader>
            <DrawerTitle>Preview tasks</DrawerTitle>
            <DrawerDescription>
              Review, edit and pick which items become real tasks.
            </DrawerDescription>
          </DrawerHeader>
          {body}
          <DrawerFooter className="shrink-0 border-t border-border/50">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={selectedCount === 0 || isBusy}
              >
                {isBusy ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                )}
                Create {selectedCount} task{selectedCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 p-4 border-b border-border/50">
          <DialogTitle>Preview tasks</DialogTitle>
          <DialogDescription>
            Review, edit and pick which items become real tasks.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="shrink-0 p-3 border-t border-border/50">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedCount === 0 || isBusy}
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 mr-1.5" />
            )}
            Create {selectedCount} task{selectedCount !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
