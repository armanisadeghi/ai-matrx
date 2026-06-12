// features/scopes/components/entity-context/EntityTargetPicker.tsx
//
// Surface B (FK half) — picks a single Organization / Project / Task and
// reports the choice back to the caller via `onSelect`. NEVER writes
// ctx_scope_assignments and NEVER writes appContextSlice — it's a pure
// presentational picker over the scope-tree's existing entities. The
// caller is responsible for persisting the FK to its own slice (e.g.
// `setNoteField({ field: "project_id" })`).
//
// Reads exclusively from the scope-tree slice via the public selectors.
// Lazy-fetches the task bucket for the active level on mount. Lazy-fetches
// orphan projects when the user clicks "Load other projects".
//
// Visuals: click-to-expand inline list (NOT hover flyout) so it works on
// mobile, inside bottom sheets, and inside tab dropdowns. The picker is
// self-contained — no dependency on legacy `ContextPickerPrimitives`.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building,
  Check,
  ChevronDown,
  FolderKanban,
  ListCheck,
  Search,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { idMatchesQuery } from "@/utils/search-scoring";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  makeSelectOrphanProjects,
  makeSelectProjectsForOrg,
  makeSelectTaskBucket,
  makeSelectTasksForLevel,
  selectOrganizationsList,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
import { ensureOrphanProjects } from "@/features/scopes/redux/thunks/ensureOrphanProjects";
import { ensureScopeTasks } from "@/features/scopes/redux/thunks/ensureScopeTasks";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import type {
  OrgNode,
  ProjectNode,
  TaskBucketLevel,
  TaskNode,
} from "@/features/scopes/types";
import { cn } from "@/utils/cn";

// ─── Public types ───────────────────────────────────────────────────────

export type EntityTargetKind = "organization" | "project" | "task";

interface OptionRow {
  id: string;
  name: string;
  status?: string;
  /** Hint for callers that want the display name alongside the id. */
  meta?: Record<string, unknown>;
}

interface BaseProps {
  kind: EntityTargetKind;
  /** Currently selected id (or null for "none"). */
  value: string | null;
  /** Receives `(id, displayName, sideEffects?)`. */
  onSelect: (
    id: string | null,
    displayName: string | null,
    sideEffects?: { projectId?: string | null; projectName?: string | null },
  ) => void;
  className?: string;
  /** Optional label override; defaults to the kind's natural label. */
  label?: string;
  /** Custom empty-state text. */
  emptyText?: string;
  /** Override the org context. Defaults to the active org. */
  organizationId?: string | null;
}

interface ProjectProps extends BaseProps {
  kind: "project";
  /** Filter project options to those whose `scope_ids` intersect this set. */
  filterScopeIds?: string[];
}

interface TaskProps extends BaseProps {
  kind: "task";
  /**
   * Pin task bucket to this project. If null/undefined, the picker
   * resolves the bucket from (in order): caller-supplied scope, then
   * active org.
   */
  projectId?: string | null;
  /** When picking a task whose project differs, optionally cascade. */
  cascadeProjectOnSelect?: boolean;
}

interface OrgProps extends BaseProps {
  kind: "organization";
}

export type EntityTargetPickerProps = OrgProps | ProjectProps | TaskProps;

// ─── Component ──────────────────────────────────────────────────────────

export function EntityTargetPicker(props: EntityTargetPickerProps) {
  const dispatch = useAppDispatch();
  useScopeTree();
  const treeStatus = useAppSelector(selectTreeStatus);
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgId = props.organizationId ?? activeOrgId;

  // ─── Pull rows per kind ────────────────────────────────────────────────
  const organizations = useAppSelector(selectOrganizationsList);
  const selectProjectsForOrg = useMemo(() => makeSelectProjectsForOrg(), []);
  const selectOrphanProjects = useMemo(() => makeSelectOrphanProjects(), []);
  const selectTaskBucket = useMemo(() => makeSelectTaskBucket(), []);
  const selectTasks = useMemo(() => makeSelectTasksForLevel(), []);

  const projects = useAppSelector((s) => selectProjectsForOrg(s, orgId));
  const orphanProjectsBucket = useAppSelector((s) =>
    selectOrphanProjects(s, orgId),
  );

  // ─── Task bucket level resolution ──────────────────────────────────────
  const taskProjectId =
    props.kind === "task" ? (props.projectId ?? null) : null;
  const taskLevel: { level: TaskBucketLevel; id: string } | null =
    useMemo(() => {
      if (props.kind !== "task") return null;
      if (taskProjectId) return { level: "project", id: taskProjectId };
      if (orgId) return { level: "org", id: orgId };
      return null;
    }, [props.kind, taskProjectId, orgId]);

  const taskBucket = useAppSelector((s) =>
    taskLevel ? selectTaskBucket(s, taskLevel) : null,
  );
  const tasksForLevel = useAppSelector((s) =>
    taskLevel ? selectTasks(s, taskLevel) : undefined,
  );

  useEffect(() => {
    if (props.kind !== "task" || !taskLevel) return;
    void dispatch(ensureScopeTasks(taskLevel.level, taskLevel.id));
  }, [dispatch, props.kind, taskLevel?.level, taskLevel?.id]);

  // ─── Compute the options for the active kind ───────────────────────────
  const { options, orphanOptions, displayName } = useMemo(() => {
    if (props.kind === "organization") {
      const seenOrgs = new Set<string>();
      const opts: OptionRow[] = [];
      for (const o of organizations as OrgNode[]) {
        if (seenOrgs.has(o.id)) continue;
        seenOrgs.add(o.id);
        opts.push({ id: o.id, name: o.name });
      }
      const name =
        organizations.find((o) => o.id === props.value)?.name ?? null;
      return {
        options: opts,
        orphanOptions: [] as OptionRow[],
        displayName: name,
      };
    }
    if (props.kind === "project") {
      const scopeFilter =
        props.filterScopeIds && props.filterScopeIds.length > 0
          ? new Set(props.filterScopeIds)
          : null;
      const mainOpts: OptionRow[] = [];
      const orphanOpts: OptionRow[] = [];
      // Track every id we've emitted so the same project can never appear
      // twice — orphanProjectsBucket can overlap with the org's projects
      // list, which would otherwise produce duplicate React keys.
      const seen = new Set<string>();
      for (const p of projects as ProjectNode[]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        const hasMatch =
          !scopeFilter || p.scope_ids.some((sid) => scopeFilter.has(sid));
        const row: OptionRow = { id: p.id, name: p.name };
        if (hasMatch) mainOpts.push(row);
        else orphanOpts.push(row);
      }
      if (orphanProjectsBucket.status === "ready") {
        for (const p of orphanProjectsBucket.items) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          orphanOpts.push({ id: p.id, name: p.name });
        }
      }
      const name =
        projects.find((p) => p.id === props.value)?.name ??
        orphanProjectsBucket.items.find((p) => p.id === props.value)?.name ??
        null;
      return {
        options: mainOpts,
        orphanOptions: orphanOpts,
        displayName: name,
      };
    }
    // task
    const levelTasks = tasksForLevel ?? [];
    const seenTasks = new Set<string>();
    const opts: OptionRow[] = [];
    for (const t of levelTasks as TaskNode[]) {
      if (t.status === "completed") continue;
      if (seenTasks.has(t.id)) continue;
      seenTasks.add(t.id);
      opts.push({ id: t.id, name: t.title, status: t.status });
    }
    const name = levelTasks.find((t) => t.id === props.value)?.title ?? null;
    return {
      options: opts,
      orphanOptions: [] as OptionRow[],
      displayName: name,
    };
  }, [
    props.kind,
    props.value,
    // organization-mode deps:
    organizations,
    // project-mode deps:
    props.kind === "project" ? props.filterScopeIds : null,
    projects,
    orphanProjectsBucket,
    // task-mode deps:
    tasksForLevel,
  ]);

  // ─── Trigger row & expanded list ───────────────────────────────────────
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const q = search.toLowerCase();
  const filteredMain = q
    ? options.filter((o) => o.name.toLowerCase().includes(q) || idMatchesQuery(o, q))
    : options;
  const filteredOrphans = q
    ? orphanOptions.filter((o) => o.name.toLowerCase().includes(q) || idMatchesQuery(o, q))
    : orphanOptions;

  const handlePick = (id: string | null, name: string | null) => {
    if (props.kind === "task") {
      const task = tasksForLevel?.find((t) => t.id === id);
      const sideEffects =
        task?.project_id &&
        props.cascadeProjectOnSelect !== false &&
        task.project_id !== taskProjectId
          ? {
              projectId: task.project_id,
              projectName:
                projects.find((p) => p.id === task.project_id)?.name ?? null,
            }
          : undefined;
      props.onSelect(id, name, sideEffects);
    } else {
      props.onSelect(id, name);
    }
    setExpanded(false);
    setSearch("");
  };

  const handleLoadOrphans = () => {
    if (props.kind !== "project" || !orgId) return;
    void dispatch(ensureOrphanProjects(orgId));
  };

  // ─── Kind metadata ────────────────────────────────────────────────────
  const meta = useMemo(() => {
    if (props.kind === "organization") {
      return {
        Icon: Building,
        accentClass: "text-violet-500",
        defaultLabel: "Organization",
        defaultEmpty: "No organizations found",
      };
    }
    if (props.kind === "project") {
      return {
        Icon: FolderKanban,
        accentClass: "text-amber-500",
        defaultLabel: "Project",
        defaultEmpty: orgId
          ? "No projects in this organization"
          : "Select an organization first",
      };
    }
    return {
      Icon: ListCheck,
      accentClass: "text-sky-500",
      defaultLabel: "Task",
      defaultEmpty:
        props.kind === "task" && !taskLevel
          ? "Pick an org or project first"
          : taskBucket?.status === "loading"
            ? "Loading tasks…"
            : taskBucket?.status === "empty"
              ? "No open tasks at this level"
              : "No tasks",
    };
  }, [props.kind, orgId, taskLevel, taskBucket?.status]);

  const label = props.label ?? meta.defaultLabel;
  const emptyText = props.emptyText ?? meta.defaultEmpty;
  const Icon = meta.Icon;

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className={props.className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors text-left group cursor-pointer"
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 flex-shrink-0 transition-colors",
            displayName
              ? meta.accentClass
              : "text-muted-foreground group-hover:text-foreground",
          )}
        />
        <span
          className={cn(
            "text-xs flex-1 truncate",
            displayName ? `${meta.accentClass} font-medium` : "",
          )}
        >
          {displayName ?? label}
        </span>
        {displayName && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePick(null, null);
            }}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground flex-shrink-0 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="ml-5 mr-1 mb-1 rounded-md border border-border/50 bg-card/80 overflow-hidden">
          {options.length + orphanOptions.length > 5 && (
            <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border/40">
              <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50 min-w-0"
                style={{ fontSize: "16px" }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          )}

          <div className="max-h-48 overflow-y-auto">
            {filteredMain.length === 0 &&
              filteredOrphans.length === 0 &&
              treeStatus !== "loading" && (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">
                  {emptyText}
                </div>
              )}

            {filteredMain.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handlePick(opt.id, opt.name)}
                className={cn(
                  "flex items-center gap-2 w-full text-[11px] px-2 py-1.5 text-left hover:bg-accent/60 transition-colors",
                  props.value === opt.id && "text-primary",
                )}
              >
                {props.value === opt.id ? (
                  <Check className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <span className="w-3 flex-shrink-0" />
                )}
                <span className="flex-1 truncate">{opt.name}</span>
                {opt.status && (
                  <span className="text-[9px] text-muted-foreground/50">
                    {opt.status}
                  </span>
                )}
              </button>
            ))}

            {/* Orphan section — projects only */}
            {props.kind === "project" && (
              <>
                {filteredOrphans.length > 0 && (
                  <>
                    <div className="mx-2 my-0.5 border-t border-border/50" />
                    <div className="px-2 py-0.5 text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                      Other
                    </div>
                    {filteredOrphans.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handlePick(opt.id, opt.name)}
                        className={cn(
                          "flex items-center gap-2 w-full text-[11px] px-2 py-1.5 text-left hover:bg-accent/60 transition-colors",
                          props.value === opt.id && "text-primary",
                        )}
                      >
                        {props.value === opt.id ? (
                          <Check className="h-3 w-3 flex-shrink-0" />
                        ) : (
                          <span className="w-3 flex-shrink-0" />
                        )}
                        <span className="flex-1 truncate">{opt.name}</span>
                      </button>
                    ))}
                  </>
                )}
                {orphanProjectsBucket.status === "unfetched" && orgId && (
                  <button
                    type="button"
                    onClick={handleLoadOrphans}
                    className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors hover:bg-accent/30"
                  >
                    <FolderKanban className="h-2.5 w-2.5" />
                    Load other projects
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EntityTargetPicker;
