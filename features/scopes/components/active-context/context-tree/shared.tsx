"use client";

// Shared data hook + micro-atoms for ContextTree.
// Data discipline:
//   • tree — Redux only (useScopeTree / ensureScopeTree), never refetched here
//   • projects / tasks — STRICTLY LAZY. Nothing is fetched on mount; the
//     first expand/interaction of a Projects/Tasks section calls
//     loadProjects()/loadTasks().
//   • per-type context items — lazy on scope expand, same cached layer

import type { ContextField, Scope } from "@ai-matrx/records/scopes";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import {
  ensureScopeSkeleton,
  ensureTypeScopes,
  scopeSearchKey,
  searchScopes,
} from "@/features/scopes/redux/thunks/ensureScopeSkeleton";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  selectPagedOrganizationsList,
  selectSkeletonError,
  selectSkeletonStatus,
  selectTypeCounts,
  selectTypeScopesByType,
} from "@/features/scopes/redux/selectors/tree";
import {
  fetchAssignableProjects,
  fetchAssignableTasks,
  fetchTypeItems,
  type AssignableProject,
  type AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import type {
  OrgNode,
} from "@/features/scopes/types";

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
  itemsByType: Record<string, ContextField[]>;
  itemsLoading: Set<string>;
  loadItems: (typeId: string) => void;
  /**
   * THE PAGED TREE (lane SCOPES-TREE-PAGED). Absent on a host that hands the tree in whole (the dense
   * demo): then every type's `scopes` is complete and nothing is asked.
   */
  paged?: {
    /** The whole tree is in: every type's `scopes` is complete and its count exact. */
    whole: boolean;
    /** type id → scopes she sees in it (from the store's count); absent = not counted yet. */
    counts: Record<string, number>;
    /** type id → its pages: loading, more to load, or a failure. */
    pages: Record<string, { status: "loading" | "partial" | "complete" | "error"; error: string | null }>;
    loadTypeScopes: (typeId: string, more?: boolean) => void;
    /** Load the whole tree at once (expand-all). */
    loadAll: () => void;
    /** Ask the server for every scope whose name holds `q`; the answer arrives in `searchHits(q)`. */
    search: (q: string) => void;
    searchHits: (q: string) => { status: "loading" | "ready" | "error"; scopes: Scope[] } | null;
  };
}

/** @deprecated Use ContextTreeData — kept for dense-lab demo re-exports. */
export type DenseData = ContextTreeData;

export function useContextTreeData(): ContextTreeData {
  const dispatch = useAppDispatch();
  const tree = useScopeTree();
  // The whole tree once in; the skeleton (types first, a type's scopes as it opens) until then.
  const organizations = useAppSelector(selectPagedOrganizationsList);
  // First paint reads the skeleton (types, no scopes); "ready" means the types are in.
  const skeletonStatus = useAppSelector(selectSkeletonStatus);
  const skeletonError = useAppSelector(selectSkeletonError);
  const whole = tree.status === "ready";
  // Switch OFF (or before the skeleton is asked) the whole tree's own status is the answer.
  const status: ReturnType<typeof useScopeTree>["status"] = whole
    ? "ready"
    : skeletonStatus === "idle"
      ? tree.status
      : skeletonStatus;
  const error = whole ? null : (tree.error ?? skeletonError);
  const counts = useAppSelector(selectTypeCounts);
  const pages = useAppSelector(selectTypeScopesByType);
  const scopeSearch = useAppSelector((s) => s.scopesTree.scopeSearch);
  const [projects, setProjects] = useState<AssignableProject[]>([]);
  const [projectsStatus, setProjectsStatus] = useState<LazyStatus>("idle");
  const [tasks, setTasks] = useState<AssignableTask[]>([]);
  const [tasksStatus, setTasksStatus] = useState<LazyStatus>("idle");
  const [itemsByType, setItemsByType] = useState<
    Record<string, ContextField[]>
  >({});
  const [itemsLoading, setItemsLoading] = useState<Set<string>>(new Set());

  useEffect(() => {
    void dispatch(ensureScopeSkeleton());
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
        void dispatch(ensureScopeSkeleton({ refresh: true }));
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

  const loadTypeScopes = useCallback(
    (typeId: string, more?: boolean) => {
      void dispatch(ensureTypeScopes(typeId, { more }));
    },
    [dispatch],
  );
  const loadAll = useCallback(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);
  const search = useCallback(
    (q: string) => {
      void dispatch(searchScopes(q));
    },
    [dispatch],
  );
  const searchHits = useCallback(
    (q: string) => scopeSearch[scopeSearchKey(q)] ?? null,
    [scopeSearch],
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
    paged: { whole, counts, pages, loadTypeScopes, loadAll, search, searchHits },
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
