"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useMemo,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Zap,
  FlaskConical,
  Bug,
  Settings,
  Loader2,
  X,
  Tag,
  TestTube2,
  ListChecks,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useTools } from "@/hooks/useTools";
import { supabase } from "@/utils/supabase/client";
import { formatText } from "@/utils/text/text-case-converter";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import { cn } from "@/styles/themes/utils";

import type { DatabaseTool } from "@/utils/supabase/tools-service";

type Tool = Omit<
  DatabaseTool,
  "parameters" | "output_schema" | "annotations" | "gating"
> & {
  parameters: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  annotations?: unknown[] | null;
  gating?: Record<string, unknown> | null;
};

interface ToolCounts {
  sampleCount: number;
  uiComponentCount: number;
}

function sourceAppFromPath(functionPath: string): string {
  if (!functionPath) return "unknown";
  return functionPath.split(".")[0] || "unknown";
}

function hasOutputSchema(tool: Tool): boolean {
  if (!tool.output_schema) return false;
  return Object.keys(tool.output_schema).length > 0;
}

function hasAnnotations(tool: Tool): boolean {
  return Array.isArray(tool.annotations) && tool.annotations.length > 0;
}

function paramCount(tool: Tool): number {
  return Object.keys(tool.parameters ?? {}).length;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

type TestFilter =
  | "all"
  | "fully_ready"
  | "has_samples"
  | "no_samples"
  | "has_ui"
  | "no_ui"
  | "has_output_schema"
  | "no_output_schema"
  | "has_annotations"
  | "no_annotations";

// ─── Column model ─────────────────────────────────────────────────────────────

type ColumnType = "text" | "enum" | "boolean" | "number" | "date";

interface ColumnFilter {
  text?: string;
  enumValues?: string[]; // selected; empty = no filter
  bool?: "all" | "true" | "false";
  numMin?: number | null;
  numMax?: number | null;
  dateFrom?: string;
  dateTo?: string;
}

interface ColumnDef {
  key: string;
  header: string;
  type: ColumnType;
  width?: string;
  getValue: (
    t: Tool,
    ctx: ToolCounts,
  ) => string | number | boolean | null | undefined;
  render: (t: Tool, ctx: ToolCounts) => React.ReactNode;
}

const isFilterActive = (
  f: ColumnFilter | undefined,
  type: ColumnType,
): boolean => {
  if (!f) return false;
  switch (type) {
    case "text":
      return !!f.text && f.text.length > 0;
    case "enum":
      return Array.isArray(f.enumValues) && f.enumValues.length > 0;
    case "boolean":
      return f.bool !== undefined && f.bool !== "all";
    case "number":
      return (f.numMin ?? null) !== null || (f.numMax ?? null) !== null;
    case "date":
      return !!f.dateFrom || !!f.dateTo;
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

export function McpToolsManager() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { databaseTools, isLoading, error, refetch } = useTools({
    autoFetch: true,
  });
  const { toast } = useToast();

  const [tools, setTools] = useState<Tool[]>([]);
  const [toolCounts, setToolCounts] = useState<Record<string, ToolCounts>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSourceApp, setSelectedSourceApp] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedTestFilter, setSelectedTestFilter] =
    useState<TestFilter>("all");

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    toolId: string | null;
    toolName: string | null;
  }>({ isOpen: false, toolId: null, toolName: null });

  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});

  useEffect(() => {
    setTools(
      databaseTools.map<Tool>((tool) => ({
        ...tool,
        parameters: (tool.parameters ?? {}) as Record<string, unknown>,
        output_schema: (tool.output_schema ?? null) as Record<
          string,
          unknown
        > | null,
        annotations: (tool.annotations ?? null) as unknown[] | null,
        gating: (tool.gating ?? null) as Record<string, unknown> | null,
      })),
    );
  }, [databaseTools]);

  useEffect(() => {
    if (databaseTools.length === 0) return;
    const toolNames = databaseTools.map((t) => t.name);

    async function fetchCounts() {
      const [samplesRes, uiRes] = await Promise.all([
        supabase
          .from("tl_test_sample")
          .select("tool_name")
          .in("tool_name", toolNames),
        supabase.from("tl_ui").select("tool_name").in("tool_name", toolNames),
      ]);

      const counts: Record<string, ToolCounts> = {};
      for (const name of toolNames)
        counts[name] = { sampleCount: 0, uiComponentCount: 0 };
      for (const row of samplesRes.data ?? []) {
        if (counts[row.tool_name]) counts[row.tool_name].sampleCount++;
      }
      for (const row of uiRes.data ?? []) {
        if (counts[row.tool_name]) counts[row.tool_name].uiComponentCount++;
      }
      setToolCounts(counts);
    }

    fetchCounts().catch(console.error);
  }, [databaseTools]);

  const categories = useMemo(() => {
    const cats = new Set(tools.map((t) => t.category).filter(Boolean));
    return ["all", ...Array.from(cats as Set<string>).sort()];
  }, [tools]);

  const sourceApps = useMemo(() => {
    const apps = new Set(tools.map((t) => sourceAppFromPath(t.function_path)));
    return ["all", ...Array.from(apps).sort()];
  }, [tools]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    tools.forEach((t) => t.tags?.forEach((tag) => tagSet.add(tag)));
    return ["all", ...Array.from(tagSet).sort()];
  }, [tools]);

  const activeFilterCount =
    [
      selectedCategory !== "all",
      selectedSourceApp !== "all",
      selectedStatus !== "all",
      selectedTag !== "all",
      selectedTestFilter !== "all",
    ].filter(Boolean).length +
    Object.values(columnFilters).filter((f) => f && Object.keys(f).length > 0)
      .length;

  const clearFilters = () => {
    setSelectedCategory("all");
    setSelectedSourceApp("all");
    setSelectedStatus("all");
    setSelectedTag("all");
    setSelectedTestFilter("all");
    setSearchQuery("");
    setColumnFilters({});
  };

  // ─── Column definitions ──────────────────────────────────────────────────
  const columns: ColumnDef[] = useMemo(
    () => [
      {
        key: "id",
        header: "ID",
        type: "text",
        width: "w-[240px]",
        getValue: (t) => t.id,
        render: (t) => (
          <span
            className="font-mono text-[11px] text-muted-foreground truncate block max-w-[240px]"
            title={t.id}
          >
            {t.id}
          </span>
        ),
      },
      {
        key: "name",
        header: "Name",
        type: "text",
        width: "w-[220px]",
        getValue: (t) => t.name,
        render: (t) => (
          <span
            className="font-mono text-xs font-medium truncate block max-w-[220px]"
            title={t.name}
          >
            {t.name}
          </span>
        ),
      },
      {
        key: "description",
        header: "Description",
        type: "text",
        width: "w-[320px]",
        getValue: (t) => t.description ?? "",
        render: (t) => (
          <span
            className="text-xs truncate block max-w-[320px]"
            title={t.description ?? ""}
          >
            {t.description}
          </span>
        ),
      },
      {
        key: "category",
        header: "Category",
        type: "enum",
        width: "w-[140px]",
        getValue: (t) => t.category ?? "",
        render: (t) =>
          t.category ? (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              {formatText(t.category)}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-[10px]">—</span>
          ),
      },
      {
        key: "source_app",
        header: "Source App",
        type: "enum",
        width: "w-[140px]",
        getValue: (t) => t.source_app ?? sourceAppFromPath(t.function_path),
        render: (t) => {
          const app = t.source_app || sourceAppFromPath(t.function_path);
          return (
            <Badge
              variant="secondary"
              className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20"
            >
              {formatText(app)}
            </Badge>
          );
        },
      },
      {
        key: "function_path",
        header: "Function Path",
        type: "text",
        width: "w-[260px]",
        getValue: (t) => t.function_path,
        render: (t) => (
          <span
            className="font-mono text-[11px] text-muted-foreground truncate block max-w-[260px]"
            title={t.function_path}
          >
            {t.function_path}
          </span>
        ),
      },
      {
        key: "tool_group",
        header: "Group",
        type: "enum",
        width: "w-[120px]",
        getValue: (t) => t.tool_group,
        render: (t) => (
          <span
            className="text-xs truncate block max-w-[120px]"
            title={t.tool_group}
          >
            {t.tool_group}
          </span>
        ),
      },
      {
        key: "tier",
        header: "Tier",
        type: "enum",
        width: "w-[100px]",
        getValue: (t) => t.tier ?? "",
        render: (t) => (
          <span className="text-xs">
            {t.tier ?? <span className="text-muted-foreground">—</span>}
          </span>
        ),
      },
      {
        key: "version",
        header: "Version",
        type: "number",
        width: "w-[80px]",
        getValue: (t) => t.version,
        render: (t) => (
          <span className="font-mono text-[11px] tabular-nums">
            v{t.version}
          </span>
        ),
      },
      {
        key: "semver",
        header: "Semver",
        type: "text",
        width: "w-[100px]",
        getValue: (t) => t.semver ?? "",
        render: (t) => (
          <span className="font-mono text-[11px]">
            {t.semver ?? <span className="text-muted-foreground">—</span>}
          </span>
        ),
      },
      {
        key: "is_active",
        header: "Active",
        type: "boolean",
        width: "w-[90px]",
        getValue: (t) => !!t.is_active,
        render: (t) => (
          <Badge
            variant={t.is_active ? "default" : "secondary"}
            className="text-[10px] h-4 px-1.5"
          >
            {t.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        key: "admin_only",
        header: "Admin Only",
        type: "boolean",
        width: "w-[100px]",
        getValue: (t) => !!t.admin_only,
        render: (t) => <BoolPill value={t.admin_only} />,
      },
      {
        key: "privileged",
        header: "Privileged",
        type: "boolean",
        width: "w-[100px]",
        getValue: (t) => !!t.privileged,
        render: (t) => <BoolPill value={t.privileged} />,
      },
      {
        key: "dedupe_exempt",
        header: "Dedupe Exempt",
        type: "boolean",
        width: "w-[120px]",
        getValue: (t) => !!t.dedupe_exempt,
        render: (t) => <BoolPill value={t.dedupe_exempt} />,
      },
      {
        key: "max_client_wait_seconds",
        header: "Max Wait (s)",
        type: "number",
        width: "w-[110px]",
        getValue: (t) => t.max_client_wait_seconds ?? null,
        render: (t) => (
          <span className="font-mono text-[11px] tabular-nums">
            {t.max_client_wait_seconds ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        ),
      },
      {
        key: "icon",
        header: "Icon",
        type: "text",
        width: "w-[120px]",
        getValue: (t) => t.icon ?? "",
        render: (t) => (
          <span
            className="font-mono text-[10px] text-muted-foreground truncate block max-w-[120px]"
            title={t.icon ?? ""}
          >
            {t.icon ?? "—"}
          </span>
        ),
      },
      {
        key: "tags",
        header: "Tags",
        type: "text",
        width: "w-[200px]",
        getValue: (t) => (t.tags ?? []).join(", "),
        render: (t) => {
          const tags = t.tags ?? [];
          const joined = tags.join(", ");
          return (
            <span
              className="text-[10px] truncate block max-w-[200px]"
              title={joined}
            >
              {tags.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                tags.slice(0, 3).join(", ") +
                (tags.length > 3 ? ` +${tags.length - 3}` : "")
              )}
            </span>
          );
        },
      },
      {
        key: "param_count",
        header: "Params",
        type: "number",
        width: "w-[80px]",
        getValue: (t) => paramCount(t),
        render: (t) => (
          <span className="font-mono text-[11px] tabular-nums">
            {paramCount(t)}
          </span>
        ),
      },
      {
        key: "has_output_schema",
        header: "Output Schema",
        type: "boolean",
        width: "w-[120px]",
        getValue: (t) => hasOutputSchema(t),
        render: (t) => (
          <BoolPill
            value={hasOutputSchema(t)}
            okLabel="yes"
            warnLabel="missing"
          />
        ),
      },
      {
        key: "has_annotations",
        header: "Annotations",
        type: "boolean",
        width: "w-[120px]",
        getValue: (t) => hasAnnotations(t),
        render: (t) => (
          <BoolPill
            value={hasAnnotations(t)}
            okLabel="yes"
            warnLabel="missing"
          />
        ),
      },
      {
        key: "samples",
        header: "Samples",
        type: "number",
        width: "w-[90px]",
        getValue: (t, c) => c.sampleCount,
        render: (t, c) => (
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              c.sampleCount === 0 && "text-warning",
            )}
          >
            {c.sampleCount}
          </span>
        ),
      },
      {
        key: "ui_components",
        header: "UI Components",
        type: "number",
        width: "w-[120px]",
        getValue: (t, c) => c.uiComponentCount,
        render: (t, c) => (
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              c.uiComponentCount === 0 && "text-warning",
            )}
          >
            {c.uiComponentCount}
          </span>
        ),
      },
      {
        key: "gating",
        header: "Gating",
        type: "text",
        width: "w-[160px]",
        getValue: (t) => JSON.stringify(t.gating ?? {}),
        render: (t) => {
          const str = JSON.stringify(t.gating ?? {});
          return (
            <span
              className="font-mono text-[10px] text-muted-foreground truncate block max-w-[160px]"
              title={str}
            >
              {str === "{}" ? <span>—</span> : str}
            </span>
          );
        },
      },
      {
        key: "created_at",
        header: "Created",
        type: "date",
        width: "w-[160px]",
        getValue: (t) => t.created_at ?? "",
        render: (t) => (
          <span
            className="font-mono text-[11px] text-muted-foreground"
            title={t.created_at ?? ""}
          >
            {formatDate(t.created_at) || "—"}
          </span>
        ),
      },
      {
        key: "updated_at",
        header: "Updated",
        type: "date",
        width: "w-[160px]",
        getValue: (t) => t.updated_at ?? "",
        render: (t) => (
          <span
            className="font-mono text-[11px] text-muted-foreground"
            title={t.updated_at ?? ""}
          >
            {formatDate(t.updated_at) || "—"}
          </span>
        ),
      },
      {
        key: "deactivated_at",
        header: "Deactivated",
        type: "date",
        width: "w-[160px]",
        getValue: (t) => t.deactivated_at ?? "",
        render: (t) => (
          <span
            className="font-mono text-[11px] text-muted-foreground"
            title={t.deactivated_at ?? ""}
          >
            {formatDate(t.deactivated_at) || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  // ─── Compute unique values per enum column ───────────────────────────────
  const enumValuesByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (col.type !== "enum") continue;
      const set = new Set<string>();
      for (const t of tools) {
        const c = toolCounts[t.name] ?? { sampleCount: 0, uiComponentCount: 0 };
        const v = col.getValue(t, c);
        if (v !== null && v !== undefined && v !== "") set.add(String(v));
      }
      map[col.key] = Array.from(set).sort();
    }
    return map;
  }, [columns, tools, toolCounts]);

  // ─── Filter + sort pipeline ──────────────────────────────────────────────
  const filteredTools = useMemo(() => {
    const nonSearchMatches = tools.filter((tool) => {
      const counts = toolCounts[tool.name] ?? {
        sampleCount: 0,
        uiComponentCount: 0,
      };
      const matchesCategory =
        selectedCategory === "all" || tool.category === selectedCategory;
      const matchesSourceApp =
        selectedSourceApp === "all" ||
        sourceAppFromPath(tool.function_path) === selectedSourceApp;
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active" && tool.is_active) ||
        (selectedStatus === "inactive" && !tool.is_active);
      const matchesTag =
        selectedTag === "all" || tool.tags?.includes(selectedTag);

      const hasSamples = counts.sampleCount > 0;
      const hasUi = counts.uiComponentCount > 0;
      const hasOutput = hasOutputSchema(tool);
      const hasAnn = hasAnnotations(tool);
      const fullyReady = hasSamples && hasUi && hasOutput && hasAnn;

      const matchesTest =
        selectedTestFilter === "all" ||
        (selectedTestFilter === "fully_ready" && fullyReady) ||
        (selectedTestFilter === "has_samples" && hasSamples) ||
        (selectedTestFilter === "no_samples" && !hasSamples) ||
        (selectedTestFilter === "has_ui" && hasUi) ||
        (selectedTestFilter === "no_ui" && !hasUi) ||
        (selectedTestFilter === "has_output_schema" && hasOutput) ||
        (selectedTestFilter === "no_output_schema" && !hasOutput) ||
        (selectedTestFilter === "has_annotations" && hasAnn) ||
        (selectedTestFilter === "no_annotations" && !hasAnn);

      if (
        !(
          matchesCategory &&
          matchesSourceApp &&
          matchesStatus &&
          matchesTag &&
          matchesTest
        )
      )
        return false;

      // Column-level filters
      for (const col of columns) {
        const f = columnFilters[col.key];
        if (!f || !isFilterActive(f, col.type)) continue;
        const raw = col.getValue(tool, counts);
        switch (col.type) {
          case "text": {
            const s = String(raw ?? "").toLowerCase();
            if (!s.includes((f.text ?? "").toLowerCase())) return false;
            break;
          }
          case "enum": {
            const s = String(raw ?? "");
            if (!(f.enumValues ?? []).includes(s)) return false;
            break;
          }
          case "boolean": {
            const b = !!raw;
            if (f.bool === "true" && !b) return false;
            if (f.bool === "false" && b) return false;
            break;
          }
          case "number": {
            const n =
              typeof raw === "number" ? raw : raw == null ? null : Number(raw);
            if (n === null || Number.isNaN(n)) return false;
            if (f.numMin != null && n < f.numMin) return false;
            if (f.numMax != null && n > f.numMax) return false;
            break;
          }
          case "date": {
            const s = String(raw ?? "");
            if (!s) return false;
            const d = new Date(s).getTime();
            if (Number.isNaN(d)) return false;
            if (f.dateFrom) {
              const from = new Date(f.dateFrom).getTime();
              if (!Number.isNaN(from) && d < from) return false;
            }
            if (f.dateTo) {
              const to = new Date(f.dateTo).getTime();
              if (!Number.isNaN(to) && d > to) return false;
            }
            break;
          }
        }
      }

      return true;
    });

    const searched = !searchQuery
      ? nonSearchMatches
      : filterAndSortBySearch(nonSearchMatches, searchQuery, [
          { get: (t) => t.name, weight: "title" },
          { get: (t) => t.description, weight: "body" },
          { get: (t) => t.tags, weight: "tag" },
          { get: (t) => t.category, weight: "tag" },
          { get: (t) => t.function_path, weight: "meta" },
        ]);

    // Apply column sort. If searchQuery is set, search-scoring already sorted;
    // skip column sort to keep the relevance order — unless the user has changed
    // sort from the default ("name" asc).
    if (searchQuery && sortKey === "name" && sortDir === "asc") return searched;

    const col = columns.find((c) => c.key === sortKey);
    if (!col) return searched;
    const dirMul = sortDir === "asc" ? 1 : -1;
    const sorted = [...searched].sort((a, b) => {
      const ca = toolCounts[a.name] ?? { sampleCount: 0, uiComponentCount: 0 };
      const cb = toolCounts[b.name] ?? { sampleCount: 0, uiComponentCount: 0 };
      const va = col.getValue(a, ca);
      const vb = col.getValue(b, cb);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number")
        return (va - vb) * dirMul;
      if (typeof va === "boolean" && typeof vb === "boolean")
        return (Number(va) - Number(vb)) * dirMul;
      if (col.type === "date") {
        const da = new Date(String(va)).getTime();
        const db = new Date(String(vb)).getTime();
        return (
          ((Number.isNaN(da) ? 0 : da) - (Number.isNaN(db) ? 0 : db)) * dirMul
        );
      }
      return String(va).localeCompare(String(vb)) * dirMul;
    });
    return sorted;
  }, [
    tools,
    toolCounts,
    searchQuery,
    selectedCategory,
    selectedSourceApp,
    selectedStatus,
    selectedTag,
    selectedTestFilter,
    columns,
    columnFilters,
    sortKey,
    sortDir,
  ]);

  const navigateTo = useCallback(
    (path: string) => {
      startTransition(() => router.push(path));
    },
    [router],
  );

  const handleToggleActive = async (toolId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/tools/${toolId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!response.ok) throw new Error("Failed to update");
      setTools((prev) =>
        prev.map((t) => (t.id === toolId ? { ...t, is_active: isActive } : t)),
      );
    } catch {
      toast({ title: "Error updating tool", variant: "destructive" });
      setTools((prev) =>
        prev.map((t) => (t.id === toolId ? { ...t, is_active: !isActive } : t)),
      );
    }
  };

  const handleDeleteTool = (toolId: string, toolName: string) => {
    setDeleteConfirmation({ isOpen: true, toolId, toolName });
  };

  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkScope, setBulkScope] = useState<"visible" | "selected">("visible");
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(
    new Set(),
  );

  const targetIds =
    bulkScope === "selected" && selectedToolIds.size > 0
      ? filteredTools.filter((t) => selectedToolIds.has(t.id)).map((t) => t.id)
      : filteredTools.map((t) => t.id);

  const handleBulkSetActive = async (active: boolean) => {
    if (targetIds.length === 0) return;
    const inactiveCount = filteredTools.filter(
      (t) => targetIds.includes(t.id) && !t.is_active,
    ).length;
    const activeCount = targetIds.length - inactiveCount;
    const willChange = active ? inactiveCount : activeCount;
    const noun = `${targetIds.length} tool${targetIds.length === 1 ? "" : "s"}`;
    const ok = await confirm({
      title: `${active ? "Activate" : "Deactivate"} ${noun}?`,
      description:
        willChange === targetIds.length
          ? `${noun} will change state.`
          : `${willChange} of ${targetIds.length} will change; the rest are already ${active ? "active" : "inactive"}.`,
      confirmLabel: active ? "Activate" : "Deactivate",
      variant: active ? "default" : "destructive",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const { error: updErr } = await supabase
        .from("tl_def")
        .update({ is_active: active })
        .in("id", targetIds);
      if (updErr) throw updErr;
      toast({ title: `${noun} ${active ? "activated" : "deactivated"}` });
      await refetch();
      setSelectedToolIds(new Set());
    } catch (err) {
      toast({
        title: "Bulk update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (targetIds.length === 0) return;
    const noun = `${targetIds.length} tool${targetIds.length === 1 ? "" : "s"}`;
    const targetNames = filteredTools
      .filter((t) => targetIds.includes(t.id))
      .map((t) => t.name);
    const { count: refCount } = await supabase
      .from("cx_tl_call")
      .select("id", { count: "exact", head: true })
      .in("tool_name", targetNames);
    const ok = await confirm({
      title: `Delete ${noun}?`,
      description: `${refCount ?? 0} historical cx_tl_call rows reference these tool names. Deleting cascades through tl_executor, tl_def_surface, tl_bundle_member, tl_def_version, and tl_ui — but cx_tl_call.tool_name has no FK and will be orphaned. Prefer Deactivate unless you really mean it.`,
      confirmLabel: "Delete forever",
      variant: "destructive",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const { error: delErr } = await supabase
        .from("tl_def")
        .delete()
        .in("id", targetIds);
      if (delErr) throw delErr;
      toast({ title: `${noun} deleted` });
      await refetch();
      setSelectedToolIds(new Set());
    } catch (err) {
      toast({
        title: "Bulk delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleToolSelection = (id: string) => {
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredTools.map((t) => t.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedToolIds.has(id));
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.toolId) return;
    try {
      const response = await fetch(
        `/api/admin/tools/${deleteConfirmation.toolId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to delete");
      }
      toast({ title: "Deleted" });
      await refetch();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleteConfirmation({ isOpen: false, toolId: null, toolName: null });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading tools…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-8 px-4">
        <X className="h-5 w-5" />
        Error loading tools: {error}
      </div>
    );
  }

  const allVisibleSelected =
    filteredTools.length > 0 &&
    filteredTools.every((t) => selectedToolIds.has(t.id));

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const setColumnFilter = (key: string, value: ColumnFilter | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!value || Object.keys(value).length === 0) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  return (
    <div className="space-y-3 px-4 py-3 pb-safe min-w-max">
      {/* Toolbar — row 1: search + actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, description, path, tags…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            style={{ fontSize: "16px" }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Clear ({activeFilterCount})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={isLoading}
            className="h-8 gap-1.5"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkBusy || filteredTools.length === 0}
                className="h-8 gap-1.5"
                title={
                  bulkScope === "selected" && selectedToolIds.size > 0
                    ? `Acts on ${targetIds.length} selected tool${targetIds.length === 1 ? "" : "s"}`
                    : `Acts on all ${filteredTools.length} visible tool${filteredTools.length === 1 ? "" : "s"}`
                }
              >
                {bulkBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ListChecks className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Bulk</span>
                <Badge
                  variant="secondary"
                  className="h-4 px-1 text-[10px] tabular-nums"
                >
                  {targetIds.length}
                </Badge>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[260px]">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
                Scope
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setBulkScope("visible")}
                className={`text-xs gap-2 ${bulkScope === "visible" ? "font-medium" : ""}`}
              >
                <span className="flex-1">All visible</span>
                <Badge variant="outline" className="text-[10px]">
                  {filteredTools.length}
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setBulkScope("selected")}
                disabled={selectedToolIds.size === 0}
                className={`text-xs gap-2 ${bulkScope === "selected" ? "font-medium" : ""}`}
              >
                <span className="flex-1">Selected only</span>
                <Badge variant="outline" className="text-[10px]">
                  {selectedToolIds.size}
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
                Selection
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={toggleSelectAllVisible}
                className="text-xs"
              >
                {allVisibleSelected
                  ? "Deselect all visible"
                  : "Select all visible"}
              </DropdownMenuItem>
              {selectedToolIds.size > 0 && (
                <DropdownMenuItem
                  onClick={() => setSelectedToolIds(new Set())}
                  className="text-xs"
                >
                  Clear selection ({selectedToolIds.size})
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
                Actions on {targetIds.length} tool
                {targetIds.length === 1 ? "" : "s"}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => void handleBulkSetActive(true)}
                disabled={bulkBusy || targetIds.length === 0}
                className="text-xs"
              >
                Activate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleBulkSetActive(false)}
                disabled={bulkBusy || targetIds.length === 0}
                className="text-xs"
              >
                Deactivate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleBulkDelete()}
                disabled={bulkBusy || targetIds.length === 0}
                className="text-xs text-destructive focus:text-destructive"
              >
                Delete permanently…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            onClick={() => navigateTo("/administration/mcp-tools/new")}
            disabled={isPending}
            className="h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Tool
          </Button>
        </div>
      </div>

      {/* Toolbar — row 2: top-level quick filters (preserved) */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={selectedSourceApp} onValueChange={setSelectedSourceApp}>
          <SelectTrigger
            className={`h-8 w-40 text-xs ${selectedSourceApp !== "all" ? "border-primary text-primary" : ""}`}
          >
            <Filter className="h-3 w-3 mr-1 flex-shrink-0" />
            <SelectValue placeholder="Source App" />
          </SelectTrigger>
          <SelectContent>
            {sourceApps.map((app) => (
              <SelectItem key={app} value={app} className="text-xs">
                {app === "all" ? "All Source Apps" : formatText(app)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger
            className={`h-8 w-40 text-xs ${selectedCategory !== "all" ? "border-primary text-primary" : ""}`}
          >
            <Filter className="h-3 w-3 mr-1 flex-shrink-0" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-xs">
                {cat === "all" ? "All Categories" : formatText(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedStatus}
          onValueChange={(v) =>
            setSelectedStatus(v as "all" | "active" | "inactive")
          }
        >
          <SelectTrigger
            className={`h-8 w-36 text-xs ${selectedStatus !== "all" ? "border-primary text-primary" : ""}`}
          >
            <Filter className="h-3 w-3 mr-1 flex-shrink-0" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Statuses
            </SelectItem>
            <SelectItem value="active" className="text-xs">
              Active only
            </SelectItem>
            <SelectItem value="inactive" className="text-xs">
              Inactive only
            </SelectItem>
          </SelectContent>
        </Select>

        {allTags.length > 1 && (
          <Select value={selectedTag} onValueChange={setSelectedTag}>
            <SelectTrigger
              className={`h-8 w-36 text-xs ${selectedTag !== "all" ? "border-primary text-primary" : ""}`}
            >
              <Tag className="h-3 w-3 mr-1 flex-shrink-0" />
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag} className="text-xs">
                  {tag === "all" ? "All Tags" : tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={selectedTestFilter}
          onValueChange={(v) => setSelectedTestFilter(v as TestFilter)}
        >
          <SelectTrigger
            className={`h-8 w-48 text-xs ${selectedTestFilter !== "all" ? "border-primary text-primary" : ""}`}
          >
            <TestTube2 className="h-3 w-3 mr-1 flex-shrink-0" />
            <SelectValue placeholder="Test Readiness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Tools
            </SelectItem>
            <SelectItem value="fully_ready" className="text-xs">
              Fully Ready (all 4)
            </SelectItem>
            <SelectItem value="has_samples" className="text-xs">
              Has Samples
            </SelectItem>
            <SelectItem value="no_samples" className="text-xs">
              Missing Samples
            </SelectItem>
            <SelectItem value="has_ui" className="text-xs">
              Has UI Component
            </SelectItem>
            <SelectItem value="no_ui" className="text-xs">
              Missing UI Component
            </SelectItem>
            <SelectItem value="has_output_schema" className="text-xs">
              Has Output Schema
            </SelectItem>
            <SelectItem value="no_output_schema" className="text-xs">
              Missing Output Schema
            </SelectItem>
            <SelectItem value="has_annotations" className="text-xs">
              Has Annotations
            </SelectItem>
            <SelectItem value="no_annotations" className="text-xs">
              Missing Annotations
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">
            {filteredTools.length}
          </span>{" "}
          of {tools.length} tools
        </span>
        <span>
          <span className="font-semibold text-success">
            {filteredTools.filter((t) => t.is_active).length}
          </span>{" "}
          active
        </span>
        <span className="border-l border-border pl-4">
          <span className="font-semibold text-info">
            {
              filteredTools.filter((t) => {
                const c = toolCounts[t.name] ?? {
                  sampleCount: 0,
                  uiComponentCount: 0,
                };
                return (
                  c.sampleCount > 0 &&
                  c.uiComponentCount > 0 &&
                  hasOutputSchema(t) &&
                  hasAnnotations(t)
                );
              }).length
            }
          </span>{" "}
          fully ready
        </span>
        <span>
          <span className="font-semibold text-success">
            {
              filteredTools.filter(
                (t) => (toolCounts[t.name]?.sampleCount ?? 0) > 0,
              ).length
            }
          </span>{" "}
          w/ samples
        </span>
        <span>
          <span className="font-semibold text-success">
            {
              filteredTools.filter(
                (t) => (toolCounts[t.name]?.uiComponentCount ?? 0) > 0,
              ).length
            }
          </span>{" "}
          w/ UI
        </span>
        <span>
          <span className="font-semibold text-warning">
            {filteredTools.filter((t) => !hasOutputSchema(t)).length}
          </span>{" "}
          no output schema
        </span>
        <span>
          <span className="font-semibold text-warning">
            {filteredTools.filter((t) => !hasAnnotations(t)).length}
          </span>{" "}
          no annotations
        </span>
      </div>

      {/* Table */}
      <div className="border border-border rounded-md bg-card overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_var(--border)]">
            <tr className="border-b border-border">
              <th className="w-[36px] px-2 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="accent-primary cursor-pointer"
                  aria-label="Select all visible"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-2 py-2 text-left align-middle text-[11px] font-medium text-muted-foreground whitespace-nowrap",
                    col.width,
                  )}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                      title={`Sort by ${col.header}`}
                    >
                      <span>{col.header}</span>
                      <SortIcon active={sortKey === col.key} dir={sortDir} />
                    </button>
                    <ColumnFilterControl
                      column={col}
                      value={columnFilters[col.key]}
                      onChange={(v) => setColumnFilter(col.key, v)}
                      enumOptions={enumValuesByColumn[col.key] ?? []}
                    />
                  </div>
                </th>
              ))}
              <th className="w-[220px] px-2 py-2 text-left text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTools.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="text-center py-16 text-muted-foreground text-sm"
                >
                  <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  {searchQuery || activeFilterCount > 0
                    ? "No tools match your filters"
                    : "No tools in the system"}
                </td>
              </tr>
            ) : (
              filteredTools.map((tool) => {
                const counts = toolCounts[tool.name] ?? {
                  sampleCount: 0,
                  uiComponentCount: 0,
                };
                const isSelected = selectedToolIds.has(tool.id);
                return (
                  <tr
                    key={tool.id}
                    className={cn(
                      "border-b border-border hover:bg-accent/30 transition-colors",
                      !tool.is_active && "opacity-60",
                      isSelected && "bg-accent/20",
                    )}
                  >
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleToolSelection(tool.id)}
                        className="accent-primary cursor-pointer"
                        aria-label={`Select ${tool.name}`}
                      />
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-2 py-1.5 align-middle cursor-pointer",
                          col.width,
                        )}
                        onClick={() =>
                          navigateTo(`/administration/mcp-tools/${tool.id}`)
                        }
                      >
                        {col.render(tool, counts)}
                      </td>
                    ))}
                    <td
                      className="px-2 py-1.5 align-middle whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-0.5">
                        <Switch
                          checked={tool.is_active ?? false}
                          onCheckedChange={(v) =>
                            handleToggleActive(tool.id, v)
                          }
                          className="scale-75"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigateTo(`/administration/mcp-tools/${tool.id}`)
                          }
                          title="View Samples"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <FlaskConical className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigateTo(
                              `/administration/mcp-tools/${tool.id}/ui`,
                            )
                          }
                          title="UI Component"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigateTo(
                              `/administration/mcp-tools/${tool.id}/incidents`,
                            )
                          }
                          title="Incidents"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-warning"
                        >
                          <Bug className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigateTo(
                              `/administration/mcp-tools/${tool.id}/edit`,
                            )
                          }
                          title="Edit Tool"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTool(tool.id, tool.name)}
                          title="Delete Tool"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={deleteConfirmation.isOpen}
        onOpenChange={(o) =>
          !o &&
          setDeleteConfirmation({ isOpen: false, toolId: null, toolName: null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Delete{" "}
              <strong>&ldquo;{deleteConfirmation.toolName}&rdquo;</strong>? This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function BoolPill({
  value,
  okLabel = "yes",
  warnLabel = "no",
}: {
  value: boolean | null | undefined;
  okLabel?: string;
  warnLabel?: string;
}) {
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0 rounded border inline-block",
        value
          ? "bg-success/10 text-success border-success/30"
          : "bg-muted text-muted-foreground border-border",
      )}
    >
      {value ? okLabel : warnLabel}
    </span>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3" />
  ) : (
    <ChevronDown className="h-3 w-3" />
  );
}

function ColumnFilterControl({
  column,
  value,
  onChange,
  enumOptions,
}: {
  column: ColumnDef;
  value: ColumnFilter | undefined;
  onChange: (v: ColumnFilter | undefined) => void;
  enumOptions: string[];
}) {
  const active = isFilterActive(value, column.type);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted",
            active && "text-primary",
          )}
          title={`Filter ${column.header}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Filter className={cn("h-3 w-3", !active && "opacity-50")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 space-y-2">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Filter {column.header}
        </div>
        {column.type === "text" && (
          <Input
            autoFocus
            placeholder="Contains…"
            value={value?.text ?? ""}
            onChange={(e) =>
              onChange({ ...(value ?? {}), text: e.target.value })
            }
            className="h-8 text-xs"
            style={{ fontSize: "16px" }}
          />
        )}
        {column.type === "enum" && (
          <div className="max-h-56 overflow-y-auto space-y-1">
            {enumOptions.length === 0 ? (
              <div className="text-xs text-muted-foreground">No values</div>
            ) : (
              enumOptions.map((opt) => {
                const selected = value?.enumValues?.includes(opt) ?? false;
                return (
                  <label
                    key={opt}
                    className="flex items-center gap-2 text-xs cursor-pointer py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const cur = new Set(value?.enumValues ?? []);
                        if (cur.has(opt)) cur.delete(opt);
                        else cur.add(opt);
                        onChange({
                          ...(value ?? {}),
                          enumValues: Array.from(cur),
                        });
                      }}
                      className="accent-primary"
                    />
                    <span className="truncate" title={opt}>
                      {formatText(opt)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
        {column.type === "boolean" && (
          <Select
            value={value?.bool ?? "all"}
            onValueChange={(v) =>
              onChange({
                ...(value ?? {}),
                bool: v as "all" | "true" | "false",
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All
              </SelectItem>
              <SelectItem value="true" className="text-xs">
                Yes / true
              </SelectItem>
              <SelectItem value="false" className="text-xs">
                No / false
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        {column.type === "number" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={value?.numMin ?? ""}
              onChange={(e) =>
                onChange({
                  ...(value ?? {}),
                  numMin: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="h-8 text-xs"
              style={{ fontSize: "16px" }}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="number"
              placeholder="Max"
              value={value?.numMax ?? ""}
              onChange={(e) =>
                onChange({
                  ...(value ?? {}),
                  numMax: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="h-8 text-xs"
              style={{ fontSize: "16px" }}
            />
          </div>
        )}
        {column.type === "date" && (
          <div className="space-y-2">
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              From
              <Input
                type="date"
                value={value?.dateFrom ?? ""}
                onChange={(e) =>
                  onChange({ ...(value ?? {}), dateFrom: e.target.value })
                }
                className="h-8 text-xs mt-0.5"
                style={{ fontSize: "16px" }}
              />
            </label>
            <label className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              To
              <Input
                type="date"
                value={value?.dateTo ?? ""}
                onChange={(e) =>
                  onChange({ ...(value ?? {}), dateTo: e.target.value })
                }
                className="h-8 text-xs mt-0.5"
                style={{ fontSize: "16px" }}
              />
            </label>
          </div>
        )}
        <div className="flex justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange(undefined)}
            disabled={!active}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
