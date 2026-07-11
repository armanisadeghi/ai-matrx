"use client";

// /demos/scopes/context-lab/dense/shared.tsx
//
// Shared data hook + micro-atoms for every dense-lab variation.
// Data discipline (context-assignment skill):
//   • tree — Redux only (useScopeTree / ensureScopeTree), never refetched here
//   • projects / tasks / per-type items — through the official cached layer
//     (context-assignment/data.ts): TTL + in-flight dedup, shared app-wide
//   • demo SAVES + inline CREATES are faked (console/toast + optimistic local
//     rows) — a real structural write is illegal from a demo route. The real
//     paths are named in each log line so this maps 1:1 onto production.

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

export interface DenseData {
  organizations: OrgNode[];
  treeStatus: ReturnType<typeof useScopeTree>["status"];
  treeError: string | null;
  projects: AssignableProject[];
  tasks: AssignableTask[];
  engagementError: string | null;
  engagementLoading: boolean;
  /** Per-scope-type context items, filled lazily via loadItems(). */
  itemsByType: Record<string, ContextItemRow[]>;
  /** Type ids with an items request currently in flight. */
  itemsLoading: Set<string>;
  loadItems: (typeId: string) => void;
}

export function useDenseData(): DenseData {
  const dispatch = useAppDispatch();
  const { organizations, status, error } = useScopeTree();
  const [projects, setProjects] = useState<AssignableProject[]>([]);
  const [tasks, setTasks] = useState<AssignableTask[]>([]);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(true);
  const [itemsByType, setItemsByType] = useState<
    Record<string, ContextItemRow[]>
  >({});
  const [itemsLoading, setItemsLoading] = useState<Set<string>>(new Set());
  const requested = useRef(false);

  useEffect(() => {
    dispatch(ensureScopeTree({}));
  }, [dispatch]);

  // Auth-hydration recovery: on a first visit right after login the Supabase
  // client session can lag the first render, so the initial fetches reject
  // with "Not authenticated". Retry a bounded number of times, loudly.
  const treeRetries = useRef(0);
  useEffect(() => {
    if (status !== "error" || treeRetries.current >= 3) return;
    const t = setTimeout(() => {
      treeRetries.current += 1;
      console.warn(
        `[dense-lab] scope tree errored ("${error}") — retry ${treeRetries.current}/3`,
      );
      dispatch(ensureScopeTree({ refresh: true }));
    }, 1200 * treeRetries.current + 800);
    return () => clearTimeout(t);
  }, [status, error, dispatch]);

  const engagementRetries = useRef(0);
  const loadEngagement = useCallback(() => {
    setEngagementLoading(true);
    setEngagementError(null);
    Promise.all([fetchAssignableProjects(), fetchAssignableTasks()])
      .then(([p, t]) => {
        setProjects(p);
        setTasks(t);
      })
      .catch((e) =>
        setEngagementError(
          e instanceof Error ? e.message : "Could not load projects/tasks",
        ),
      )
      .finally(() => setEngagementLoading(false));
  }, []);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    loadEngagement();
  }, [loadEngagement]);

  useEffect(() => {
    if (!engagementError || engagementRetries.current >= 3) return;
    const t = setTimeout(() => {
      engagementRetries.current += 1;
      console.warn(
        `[dense-lab] projects/tasks errored ("${engagementError}") — retry ${engagementRetries.current}/3`,
      );
      loadEngagement();
    }, 1200 * engagementRetries.current + 800);
    return () => clearTimeout(t);
  }, [engagementError, loadEngagement]);

  const loadItems = useCallback(
    (typeId: string) => {
      if (itemsByType[typeId] || itemsLoading.has(typeId)) return;
      setItemsLoading((p) => new Set(p).add(typeId));
      fetchTypeItems(typeId)
        .then((items) =>
          setItemsByType((p) => ({ ...p, [typeId]: items })),
        )
        .catch(() => {
          // Loud, never silent: the row shows "couldn't load" via empty +
          // toast so a real failure is visible.
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
    tasks,
    engagementError,
    engagementLoading,
    itemsByType,
    itemsLoading,
    loadItems,
  };
}

/* ── faked writes (demo convention: console + toast, real path named) ──── */

export function fakeCreate(
  level: "scope type" | "scope" | "context item" | "project" | "task",
  name: string,
  detail: Record<string, string | null>,
): void {
  const realPath: Record<typeof level, string> = {
    "scope type": "createScopeType thunk → rpc create_scope_type",
    scope: "createScope thunk → rpc create_scope",
    "context item": "createContextItem thunk → rpc create_context_item",
    project: "features/projects/service createProject",
    task: "taskService quickCreateTask",
  };
  console.log(`[dense-lab] CREATE ${level} (demo — real path: ${realPath[level]}) →`, {
    name,
    ...detail,
  });
  toast.success(`Would create ${level} "${name}" (logged — no DB write)`);
}

export function fakeApply(
  useCase: string,
  payload: unknown,
): void {
  console.log(`[dense-lab] APPLY ${useCase} (demo — no DB write) →`, payload);
  toast.success(`${useCase} — selection logged (no DB write)`);
}

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

/** Tiny uppercase kind tag with a fixed width so rows align. */
export function KindTag({ kind }: { kind: string }) {
  return (
    <span className="w-[42px] shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
      {kind}
    </span>
  );
}

export function InlineSpinner() {
  return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
}

/** Compact inline "＋ add" row → input → commit. Zero layout jank (fixed h-6). */
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
          className="flex h-5 items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground/60 hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {placeholder}
        </button>
      )}
    </div>
  );
}
