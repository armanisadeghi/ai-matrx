"use client";

import React, { useMemo, useState } from "react";
import {
  Compass,
  Zap,
  Activity,
  MessageSquare,
  FileText,
  Layers,
  Code,
  FolderOpen,
  GitBranch,
  File,
  AppWindow,
  ScrollText,
  Database,
  BookOpen,
  HelpCircle,
  Globe,
  Mic,
  CheckSquare,
  Workflow,
  Box,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  type LucideIcon
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { useProjectReferences } from "../hooks";
import type { ProjectReference } from "../types";

// ============================================================================
// Table metadata — maps DB table names to display info
// ============================================================================

interface TableMeta {
  label: string;
  icon: LucideIcon;
  category: string;
  categoryColor: string;
}

const CATEGORY_ORDER = [
  "Work",
  "AI",
  "Chat",
  "Content",
  "Code",
  "Data",
  "Research",
  "Learning",
  "Project",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Work: "text-indigo-600 dark:text-indigo-400",
  AI: "text-violet-600 dark:text-violet-400",
  Chat: "text-sky-600 dark:text-sky-400",
  Content: "text-emerald-600 dark:text-emerald-400",
  Code: "text-orange-600 dark:text-orange-400",
  Data: "text-amber-600 dark:text-amber-400",
  Research: "text-teal-600 dark:text-teal-400",
  Learning: "text-rose-600 dark:text-rose-400",
  Project: "text-slate-600 dark:text-slate-400",
};

const CATEGORY_BG_COLORS: Record<string, string> = {
  Work: "bg-indigo-50 dark:bg-indigo-950/30",
  AI: "bg-violet-50 dark:bg-violet-950/30",
  Chat: "bg-sky-50 dark:bg-sky-950/30",
  Content: "bg-emerald-50 dark:bg-emerald-950/30",
  Code: "bg-orange-50 dark:bg-orange-950/30",
  Data: "bg-amber-50 dark:bg-amber-950/30",
  Research: "bg-teal-50 dark:bg-teal-950/30",
  Learning: "bg-rose-50 dark:bg-rose-950/30",
  Project: "bg-slate-50 dark:bg-slate-900/30",
};

const TABLE_META: Record<string, TableMeta> = {
  task: {
    label: "Tasks",
    icon: CheckSquare,
    category: "Work",
    categoryColor: CATEGORY_COLORS.Work,
  },
  workflow: {
    label: "Workflows",
    icon: Workflow,
    category: "Work",
    categoryColor: CATEGORY_COLORS.Work,
  },
  sandbox_instances: {
    label: "Sandboxes",
    icon: Box,
    category: "Work",
    categoryColor: CATEGORY_COLORS.Work,
  },
  app_instances: {
    label: "App Instances",
    icon: AppWindow,
    category: "Work",
    categoryColor: CATEGORY_COLORS.Work,
  },
  wc_claim: {
    label: "Claims",
    icon: File,
    category: "Work",
    categoryColor: CATEGORY_COLORS.Work,
  },
  agx_agent: {
    label: "Agents",
    icon: Compass,
    category: "AI",
    categoryColor: CATEGORY_COLORS.AI,
  },
  agx_agent_templates: {
    label: "Agent Templates",
    icon: Compass,
    category: "AI",
    categoryColor: CATEGORY_COLORS.AI,
  },
  agx_shortcut: {
    label: "Agent Shortcuts",
    icon: Zap,
    category: "AI",
    categoryColor: CATEGORY_COLORS.AI,
  },
  ai_runs: {
    label: "AI Runs",
    icon: Activity,
    category: "AI",
    categoryColor: CATEGORY_COLORS.AI,
  },
  ai_tasks: {
    label: "AI Tasks",
    icon: Activity,
    category: "AI",
    categoryColor: CATEGORY_COLORS.AI,
  },
  prompts: {
    label: "Prompts",
    icon: ScrollText,
    category: "AI",
    categoryColor: CATEGORY_COLORS.AI,
  },
  prompt_actions: {
    label: "Prompt Actions",
    icon: Zap,
    category: "AI",
    categoryColor: CATEGORY_COLORS.AI,
  },
  prompt_apps: {
    label: "Prompt Apps",
    icon: AppWindow,
    category: "AI",
    categoryColor: CATEGORY_COLORS.AI,
  },
  cx_conversation: {
    label: "Conversations",
    icon: MessageSquare,
    category: "Chat",
    categoryColor: CATEGORY_COLORS.Chat,
  },
  notes: {
    label: "Notes",
    icon: FileText,
    category: "Content",
    categoryColor: CATEGORY_COLORS.Content,
  },
  canvas_items: {
    label: "Canvas Items",
    icon: Layers,
    category: "Content",
    categoryColor: CATEGORY_COLORS.Content,
  },
  content_template: {
    label: "Content Templates",
    icon: ScrollText,
    category: "Content",
    categoryColor: CATEGORY_COLORS.Content,
  },
  cld_files: {
    label: "Files",
    icon: File,
    category: "Content",
    categoryColor: CATEGORY_COLORS.Content,
  },
  code_files: {
    label: "Code Files",
    icon: Code,
    category: "Code",
    categoryColor: CATEGORY_COLORS.Code,
  },
  code_file_folders: {
    label: "Code Folders",
    icon: FolderOpen,
    category: "Code",
    categoryColor: CATEGORY_COLORS.Code,
  },
  code_repositories: {
    label: "Repositories",
    icon: GitBranch,
    category: "Code",
    categoryColor: CATEGORY_COLORS.Code,
  },
  broker_values: {
    label: "Broker Values",
    icon: Database,
    category: "Data",
    categoryColor: CATEGORY_COLORS.Data,
  },
  udt_datasets: {
    label: "Datasets",
    icon: Database,
    category: "Data",
    categoryColor: CATEGORY_COLORS.Data,
  },
  rs_topic: {
    label: "Research Topics",
    icon: Globe,
    category: "Research",
    categoryColor: CATEGORY_COLORS.Research,
  },
  page_extraction_jobs: {
    label: "Extraction Jobs",
    icon: Globe,
    category: "Research",
    categoryColor: CATEGORY_COLORS.Research,
  },
  transcripts: {
    label: "Transcripts",
    icon: Mic,
    category: "Research",
    categoryColor: CATEGORY_COLORS.Research,
  },
  flashcard_data: {
    label: "Flashcard Data",
    icon: BookOpen,
    category: "Learning",
    categoryColor: CATEGORY_COLORS.Learning,
  },
  flashcard_sets: {
    label: "Flashcard Sets",
    icon: BookOpen,
    category: "Learning",
    categoryColor: CATEGORY_COLORS.Learning,
  },
  quiz_sessions: {
    label: "Quiz Sessions",
    icon: HelpCircle,
    category: "Learning",
    categoryColor: CATEGORY_COLORS.Learning,
  },
  // Project membership + invitations moved to the canonical iam.memberships /
  // iam.invitations stores (2026 DB cutover). The legacy project-member /
  // project-invitation tables no longer hold project data, so they are no
  // longer surfaced here; any residual FK row falls through to the generated
  // label in getTableMeta.
  ctx_user_active_context: {
    label: "Active Context",
    icon: Activity,
    category: "Project",
    categoryColor: CATEGORY_COLORS.Project,
  },
};

function getTableMeta(tableName: string): TableMeta {
  return (
    TABLE_META[tableName] ?? {
      label: tableName
        .replace(/^(ctx_|agx_|cx_|rs_|udt_|wc_)/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: Database,
      category: "Other",
      categoryColor: "text-muted-foreground",
    }
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ReferenceRow({ reference: r }: { reference: ProjectReference }) {
  const meta = getTableMeta(r.tableName);
  const Icon = meta.icon;
  const isEmpty = r.rowCount === 0;

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors ${
        isEmpty ? "opacity-40" : "hover:bg-muted/40"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${meta.categoryColor}`} />
      <span className="text-sm flex-1 min-w-0 truncate">{meta.label}</span>
      <span
        className={cn(
          "text-xs font-mono tabular-nums min-w-[2rem] text-right",
          isEmpty ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        {r.rowCount.toLocaleString()}
      </span>
    </div>
  );
}

interface CategoryGroup {
  category: string;
  refs: ProjectReference[];
  totalCount: number;
}

function CategorySection({
  group,
  showEmpty,
}: {
  group: CategoryGroup;
  showEmpty: boolean;
}) {
  const visibleRefs = showEmpty
    ? group.refs
    : group.refs.filter((r) => r.rowCount > 0);

  if (visibleRefs.length === 0) return null;

  const bg = CATEGORY_BG_COLORS[group.category] ?? "bg-muted/20";
  const color = CATEGORY_COLORS[group.category] ?? "text-muted-foreground";

  return (
    <div className="space-y-0.5">
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-sm ${bg}`}>
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${color}`}
        >
          {group.category}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {group.totalCount > 0 && group.totalCount.toLocaleString()}
        </span>
      </div>
      {visibleRefs.map((r) => (
        <ReferenceRow key={`${r.schemaName}.${r.tableName}`} reference={r} />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-5 w-20 rounded" />
          {[1, 2, 3].map((j) => (
            <div key={j} className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-3.5 w-3.5 rounded-sm flex-shrink-0" />
              <Skeleton className="h-4 flex-1 rounded" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface ProjectReferencesPanelProps {
  projectId: string;
  /**
   * When the panel is rendered inside a section that already supplies a Card +
   * heading, set this to drop the panel's own outer Card and title chrome.
   */
  embedded?: boolean;
}

export function ProjectReferencesPanel({
  projectId,
  embedded = false,
}: ProjectReferencesPanelProps) {
  const { references, loading, error, refresh } =
    useProjectReferences(projectId);
  const [showEmpty, setShowEmpty] = useState(false);

  const { groups, totalItems, populatedCount, emptyCount } = useMemo(() => {
    const categoryMap = new Map<string, ProjectReference[]>();

    for (const r of references) {
      const meta = getTableMeta(r.tableName);
      const cat = meta.category;
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(r);
    }

    const orderedGroups: CategoryGroup[] = [];
    const seen = new Set<string>();

    for (const cat of CATEGORY_ORDER) {
      if (categoryMap.has(cat)) {
        const refs = categoryMap
          .get(cat)!
          .sort((a, b) => b.rowCount - a.rowCount);
        orderedGroups.push({
          category: cat,
          refs,
          totalCount: refs.reduce((s, r) => s + r.rowCount, 0),
        });
        seen.add(cat);
      }
    }

    // Any categories not in CATEGORY_ORDER
    for (const [cat, refs] of categoryMap.entries()) {
      if (!seen.has(cat)) {
        orderedGroups.push({
          category: cat,
          refs: refs.sort((a, b) => b.rowCount - a.rowCount),
          totalCount: refs.reduce((s, r) => s + r.rowCount, 0),
        });
      }
    }

    const totalItems = references.reduce((s, r) => s + r.rowCount, 0);
    const populatedCount = references.filter((r) => r.rowCount > 0).length;
    const emptyCount = references.filter((r) => r.rowCount === 0).length;

    return { groups: orderedGroups, totalItems, populatedCount, emptyCount };
  }, [references]);

  const body = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          {!embedded && (
            <h3 className="text-sm font-semibold">Details &amp; references</h3>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            Every table in the database that references this project.
          </p>
          {!loading && references.length > 0 && (
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              {populatedCount > 0
                ? `${totalItems.toLocaleString()} item${totalItems !== 1 ? "s" : ""} across ${populatedCount} entity type${populatedCount !== 1 ? "s" : ""}`
                : "No items associated with this project yet"}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={refresh}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="text-sm text-destructive px-2 py-3 text-center">
          {error}
        </div>
      ) : references.length === 0 ? (
        <div className="text-sm text-muted-foreground px-2 py-3 text-center">
          No reference data available.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <CategorySection
              key={group.category}
              group={group}
              showEmpty={showEmpty}
            />
          ))}

          {emptyCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground h-7 gap-1.5"
              onClick={() => setShowEmpty((v) => !v)}
            >
              {showEmpty ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Hide {emptyCount} empty type{emptyCount !== 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show {emptyCount} empty type{emptyCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-3">{body}</div>;
  }

  return <Card className="p-4 space-y-3">{body}</Card>;
}
