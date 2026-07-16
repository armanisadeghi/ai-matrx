"use client";

// Shared data hook + micro-atoms for ContextTree.
// Data discipline:
//   • tree — Redux only (useScopeTree / ensureScopeTree), never refetched here
//   • projects / tasks — STRICTLY LAZY. Nothing is fetched on mount; the
//     first expand/interaction of a Projects/Tasks section calls
//     loadProjects()/loadTasks().
//   • per-type context items — lazy on scope expand, same cached layer

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  fetchAssignableProjects,
  fetchAssignableTasks,
  fetchTypeItems,
  type AssignableProject,
  type AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import type { ContextItemRow, OrgNode } from "@/features/scopes/types";

/* ── data hook ────────────────────────────────────────────────────────── */

export type LazyStatus = "idle" | "loading" | "ready" | "error";

export interface ContextTreeData {
  organizations: OrgNode[];
  treeStatus: ReturnType<typeof useScopeTree>["status"];
  treeError: string | null;
  /** Empty until loadProjects() has completed. */
  projects: AssignableProject[];
  projectsStatus: LazyStatus;
  /** Idempotent; call on the FIRST interaction with a Projects section. */
  loadProjects: () => void;
  /** Empty until loadTasks() has completed. */
  tasks: AssignableTask[];
  tasksStatus: LazyStatus;
  loadTasks: () => void;
  /** Per-scope-type context items, filled lazily via loadItems(). */
  itemsByType: Record<string, ContextItemRow[]>;
  itemsLoading: Set<string>;
  loadItems: (typeId: string) => void;
}

/** @deprecated Use ContextTreeData — kept for dense-lab demo re-exports. */
export type DenseData = ContextTreeData;

export function useContextTreeData(): ContextTreeData {
  const dispatch = useAppDispatch();
  const { organizations, status, error } = useScopeTree();
  const [projects, setProjects] = useState<AssignableProject[]>([]);
  const [projectsStatus, setProjectsStatus] = useState<LazyStatus>("idle");
  const [tasks, setTasks] = useState<AssignableTask[]>([]);
  const [tasksStatus, setTasksStatus] = useState<LazyStatus>("idle");
  const [itemsByType, setItemsByType] = useState<
    Record<string, ContextItemRow[]>
  >({});
  const [itemsLoading, setItemsLoading] = useState<Set<string>>(new Set());

  useEffect(() => {
    dispatch(ensureScopeTree({}));
  }, [dispatch]);

  // Auth-hydration recovery: on a first visit right after login the Supabase
  // client session can lag the first render, so the initial tree fetch can
  // reject with "Not authenticated". Retry a bounded number of times, loudly.
  const treeRetries = useRef(0);
  useEffect(() => {
    if (status !== "error" || treeRetries.current >= 3) return;
    const t = setTimeout(
      () => {
        treeRetries.current += 1;
        console.warn(
          `[context-tree] scope tree errored ("${error}") — retry ${treeRetries.current}/3`,
        );
        dispatch(ensureScopeTree({ refresh: true }));
      },
      1200 * treeRetries.current + 800,
    );
    return () => clearTimeout(t);
  }, [status, error, dispatch]);

  const loadProjects = useCallback(() => {
    setProjectsStatus((s) => {
      if (s === "loading" || s === "ready") return s;
      fetchAssignableProjects()
        .then((p) => {
          setProjects(p);
          setProjectsStatus("ready");
        })
        .catch((e) => {
          console.error("[context-tree] projects fetch failed", e);
          toast.error("Couldn't load projects");
          setProjectsStatus("error");
        });
      return "loading";
    });
  }, []);

  const loadTasks = useCallback(() => {
    setTasksStatus((s) => {
      if (s === "loading" || s === "ready") return s;
      fetchAssignableTasks()
        .then((t) => {
          setTasks(t);
          setTasksStatus("ready");
        })
        .catch((e) => {
          console.error("[context-tree] tasks fetch failed", e);
          toast.error("Couldn't load tasks");
          setTasksStatus("error");
        });
      return "loading";
    });
  }, []);

  const loadItems = useCallback(
    (typeId: string) => {
      if (itemsByType[typeId] || itemsLoading.has(typeId)) return;
      setItemsLoading((p) => new Set(p).add(typeId));
      fetchTypeItems(typeId)
        .then((items) => setItemsByType((p) => ({ ...p, [typeId]: items })))
        .catch(() => {
          toast.error("Couldn't load context items for this type");
          setItemsByType((p) => ({ ...p, [typeId]: [] }));
        })
        .finally(() =>
          setItemsLoading((p) => {
            const n = new Set(p);
            n.delete(typeId);
            return n;
          }),
        );
    },
    [itemsByType, itemsLoading],
  );

  return {
    organizations,
    treeStatus: status,
    treeError: error,
    projects,
    projectsStatus,
    loadProjects,
    tasks,
    tasksStatus,
    loadTasks,
    itemsByType,
    itemsLoading,
    loadItems,
  };
}

/** @deprecated Use useContextTreeData. */
export const useDenseData = useContextTreeData;

/* ── micro-atoms ──────────────────────────────────────────────────────── */

/** 14px fixed check target — glyph swaps, dimensions never change. */
export function CheckGlyph({
  on,
  className,
}: {
  on: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-transparent text-transparent",
        className,
      )}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  );
}

export function InlineSpinner() {
  return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
}

/** Compact inline "+ add" row → input → commit. Zero layout jank (fixed h-6). */
export function InlineAddRow({
  placeholder,
  onCommit,
  indentPx = 0,
}: {
  placeholder: string;
  onCommit: (value: string) => void;
  indentPx?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div className="flex h-6 items-center" style={{ paddingLeft: indentPx }}>
      {editing ? (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              onCommit(value.trim());
              setValue("");
              setEditing(false);
            }
            if (e.key === "Escape") {
              setValue("");
              setEditing(false);
            }
            e.stopPropagation();
          }}
          onBlur={() => {
            setValue("");
            setEditing(false);
          }}
          placeholder={placeholder}
          className="h-5 w-full rounded-sm border border-primary/40 bg-background px-1.5 text-xs outline-none placeholder:text-muted-foreground/50"
          style={{ fontSize: "16px" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-5 items-center gap-1 rounded-sm px-1 text-[11px] text-muted-foreground/60 hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {placeholder}
        </button>
      )}
    </div>
  );
}
