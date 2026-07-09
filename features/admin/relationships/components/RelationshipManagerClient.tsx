"use client";

// features/admin/relationships/components/RelationshipManagerClient.tsx
//
// Relationship Manager — the admin control plane for the reachability /
// containment system (docs/db_changes/REACHABILITY-ROLLOUT.md §4).
//
// Everything here rides the public.admin_relationship_* SECURITY DEFINER RPCs;
// the platform.* tables have no client grants. Rule changes trigger an
// automatic full closure rebuild in the DB (statement-level trigger), so after
// any mutation we just router.refresh() the server-fetched data.
//
// Design: a structured, columnar registry (entity-type chips, not prose) with
// full CRUD (create / edit / delete rules), a single unified drift-report panel
// (admin_relationship_problems), and a reachability inspector. Plain-language
// meaning is available on demand (row tooltip + a live sentence in the editor),
// never dumped into a table cell.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  CircleSlash,
  Layers,
  ListFilter,
  Lock,
  LockOpen,
  MoveLeft,
  MoveRight,
  Pencil,
  Plus,
  TriangleAlert,
  Trash2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/utils/supabase/client";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { EntityTypeCombobox } from "@/components/entity-types/EntityTypeCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type {
  ContainerSide,
  PermissionLevel,
  ReachabilityContainer,
  ReachabilityContent,
  RelationshipProblem,
  RelationshipRule,
  RelationshipSystemStatus,
} from "../types";

// ---------------------------------------------------------------------------

function label(token: string): string {
  return tryGetEntityInfo(token)?.label ?? token;
}

function plural(text: string): string {
  return text.endsWith("s") ? text : `${text}s`;
}

/** Plain-language sentence for a rule — shown on demand, never as a table cell. */
function ruleSentence(rule: {
  source_type: string;
  target_type: string;
  label: string | null;
  container_side: string;
  conveys_max: PermissionLevel;
  is_active: boolean;
}): string {
  const src = label(rule.source_type);
  const tgt = label(rule.target_type);
  const lbl = rule.label ? ` (label "${rule.label}")` : "";
  const inactive = rule.is_active ? "" : " [inactive]";
  if (rule.container_side === "target") {
    return `${tgt} contains ${src}${lbl} — sharing a ${tgt} grants up to ${rule.conveys_max} on its ${plural(src)}.${inactive}`;
  }
  if (rule.container_side === "source") {
    return `${src} contains ${tgt}${lbl} — sharing a ${src} grants up to ${rule.conveys_max} on its ${plural(tgt)}.${inactive}`;
  }
  return `${src} ↔ ${tgt}${lbl} — known relationship, conveys no access.${inactive}`;
}

type RuleFilter = "all" | "conveying" | "known" | "inactive";

interface EditorState {
  mode: "create" | "edit";
  sourceType: string;
  targetType: string;
  label: string;
  containerSide: ContainerSide;
  conveysMax: PermissionLevel;
  isActive: boolean;
  notes: string;
  /** the rule as it exists in the DB (edit mode), for change detection */
  original: RelationshipRule | null;
}

const EMPTY_EDITOR: EditorState = {
  mode: "create",
  sourceType: "",
  targetType: "",
  label: "",
  containerSide: "none",
  conveysMax: "editor",
  isActive: true,
  notes: "",
  original: null,
};

interface Props {
  status: RelationshipSystemStatus | null;
  rules: RelationshipRule[];
  problems: RelationshipProblem[];
}

export default function RelationshipManagerClient({
  status,
  rules,
  problems,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isPending, startTransition] = useTransition();

  const [filter, setFilter] = useState<RuleFilter>("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  /** The rule targeted for deletion — independent of the editor so a row-level
   *  delete doesn't also pop the editor sheet. */
  const [deleteTarget, setDeleteTarget] = useState<RelationshipRule | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [confirmEnforce, setConfirmEnforce] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  // -- derived ---------------------------------------------------------------

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((r) => {
      if (filter === "conveying" && (r.container_side === "none" || !r.is_active))
        return false;
      if (filter === "known" && (r.container_side !== "none" || !r.is_active))
        return false;
      if (filter === "inactive" && r.is_active) return false;
      if (!q) return true;
      const hay =
        `${r.source_type} ${r.target_type} ${r.label ?? ""} ` +
        `${label(r.source_type)} ${label(r.target_type)}`;
      return hay.toLowerCase().includes(q);
    });
  }, [rules, filter, query]);

  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warningCount = problems.filter((p) => p.severity === "warning").length;
  const problemCount = problems.length;
  const unregisteredCount = problems.filter(
    (p) => p.kind === "unregistered_pair",
  ).length;

  const editorConveys = editor !== null && editor.containerSide !== "none";
  /** True when saving will change how (or whether) access cascades — a fresh
   *  conveyance, or a side/ceiling change on an already-conveying rule. */
  const editorChangesConveyance =
    editor !== null &&
    editorConveys &&
    (editor.original === null ||
      editor.original.container_side === "none" ||
      editor.original.container_side !== editor.containerSide ||
      editor.original.conveys_max !== editor.conveysMax);
  /** Specifically a none/inactive → conveying flip (new access being granted). */
  const editorNewlyConveys =
    editorChangesConveyance &&
    (editor?.original === null ||
      editor?.original.container_side === "none" ||
      !editor?.original.is_active);

  const editorValid =
    editor !== null &&
    editor.sourceType.length > 0 &&
    editor.targetType.length > 0;

  // -- mutations ---------------------------------------------------------------

  function openCreate() {
    setEditor({ ...EMPTY_EDITOR });
  }

  function openEdit(rule: RelationshipRule) {
    setEditor({
      mode: "edit",
      sourceType: rule.source_type,
      targetType: rule.target_type,
      label: rule.label ?? "",
      containerSide: rule.container_side as ContainerSide,
      conveysMax: rule.conveys_max,
      isActive: rule.is_active,
      notes: rule.notes ?? "",
      original: rule,
    });
  }

  async function saveRule() {
    if (!editor || !editorValid) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_upsert_relationship_rule", {
        p_source_type: editor.sourceType,
        p_target_type: editor.targetType,
        p_label: editor.label || undefined,
        p_container_side: editor.containerSide,
        p_conveys_max: editor.conveysMax,
        p_is_active: editor.isActive,
        p_notes: editor.notes || undefined,
      });
      if (error) throw error;
      toast.success(
        editor.mode === "create"
          ? "Rule created — closure cache rebuilt"
          : "Rule saved — closure cache rebuilt",
      );
      setEditor(null);
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't save the rule: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
      setConfirmSave(false);
    }
  }

  async function deleteRule() {
    const target = deleteTarget;
    if (!target) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_delete_relationship_rule", {
        p_source_type: target.source_type,
        p_target_type: target.target_type,
        p_label: target.label ?? undefined,
      });
      if (error) throw error;
      toast.success("Rule deleted — closure cache rebuilt");
      setDeleteTarget(null);
      // Close the editor too if it was open on the same rule.
      setEditor((cur) =>
        cur &&
        cur.sourceType === target.source_type &&
        cur.targetType === target.target_type &&
        (cur.label || null) === target.label
          ? null
          : cur,
      );
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't delete the rule: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function registerKnown(
    source: string,
    target: string,
    ruleLabel: string | null,
  ) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_upsert_relationship_rule", {
        p_source_type: source,
        p_target_type: target,
        p_label: ruleLabel ?? undefined,
        p_container_side: "none",
        p_conveys_max: "editor",
        p_is_active: true,
        p_notes: "Registered as known from the Relationship Manager",
      });
      if (error) throw error;
      toast.success(`Registered ${label(source)} → ${label(target)} as known`);
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't register: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function rebuildCache() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_rebuild_reachability");
      if (error) throw error;
      toast.success(`Cache rebuilt — ${data ?? 0} closure rows`);
      refresh();
    } catch (e) {
      toast.error(
        `Rebuild failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
      setConfirmRebuild(false);
    }
  }

  async function setEnforcement(enabled: boolean) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_set_association_enforcement", {
        p_enabled: enabled,
      });
      if (error) throw error;
      toast.success(
        enabled
          ? "Enforcement ON — unregistered edge shapes are now rejected at write time"
          : "Enforcement OFF — any edge shape can be written",
      );
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't toggle enforcement: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
      setConfirmEnforce(null);
    }
  }

  // -- render ------------------------------------------------------------------

  const enforcementOn = status?.enforcement_enabled ?? false;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusTile label="Rules" value={status?.total_rules ?? 0} />
        <StatusTile
          label="Conveying"
          value={status?.rules_conveying ?? 0}
          accent
        />
        <StatusTile label="Closure rows" value={status?.closure_rows ?? 0} />
        <StatusTile label="Max depth" value={status?.max_depth ?? 0} />
        <StatusTile
          label="Problems"
          value={problemCount}
          tone={errorCount > 0 ? "danger" : warningCount > 0 ? "warn" : "ok"}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={openCreate} disabled={busy || isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New rule
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || isPending}
            onClick={() => setConfirmRebuild(true)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Rebuild cache
          </Button>
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
            {enforcementOn ? (
              <Lock className="h-3.5 w-3.5 text-primary" />
            ) : (
              <LockOpen className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-xs font-medium">Enforcement</span>
            <Switch
              checked={enforcementOn}
              disabled={busy || (!enforcementOn && unregisteredCount > 0)}
              onCheckedChange={(v) => setConfirmEnforce(v)}
              title={
                !enforcementOn && unregisteredCount > 0
                  ? "Cannot enable while unregistered pairs exist"
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {/* Unified drift / problems report */}
      <ProblemsPanel
        problems={problems}
        errorCount={errorCount}
        warningCount={warningCount}
        busy={busy}
        onRegister={registerKnown}
        onEdit={(source, target, lbl) => {
          const rule = rules.find(
            (r) =>
              r.source_type === source &&
              r.target_type === target &&
              (r.label ?? "") === (lbl ?? ""),
          );
          if (rule) openEdit(rule);
        }}
      />

      {/* Direction doctrine — the one convention every rule must follow */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <MoveRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          <span className="font-medium text-foreground">
            Direction convention: little points to big.
          </span>{" "}
          The <span className="font-medium text-foreground">source</span> is
          the content/child; the{" "}
          <span className="font-medium text-foreground">target</span> is its
          container (a task points to its project). The{" "}
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1 font-medium text-primary">
            <Boxes className="h-3 w-3" />
            container
          </span>{" "}
          is tinted in every row. Container side{" "}
          <span className="font-mono">target</span> is the norm;{" "}
          <span className="font-mono">source</span> means the edge is stored
          big→little — a deliberate, documented exception. A write in the wrong
          direction of a registered pair is REJECTED at the DB; direction
          changes happen here, in the registry, not in code.
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter className="h-4 w-4 text-muted-foreground" />
        {(
          [
            ["all", "All"],
            ["conveying", "Conveys access"],
            ["known", "Known only"],
            ["inactive", "Inactive"],
          ] as const
        ).map(([key, text]) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {text}
          </Button>
        ))}
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by type…"
            className="h-8 pl-7"
          />
        </div>
      </div>

      {/* Registry table — structured columns, not prose */}
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-52">Source (content)</TableHead>
              <TableHead className="w-16 text-center">Dir</TableHead>
              <TableHead className="w-52">Target (container)</TableHead>
              <TableHead className="w-24">Conveys</TableHead>
              <TableHead className="w-16 text-right">Edges</TableHead>
              <TableHead className="w-20 text-right">Closure</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((rule) => {
              const conveying =
                rule.container_side !== "none" && rule.is_active;
              const srcIsContainer = rule.container_side === "source";
              const tgtIsContainer = rule.container_side === "target";
              return (
                <TableRow
                  key={`${rule.source_type}:${rule.target_type}:${rule.label ?? ""}`}
                  className="cursor-pointer"
                  title={ruleSentence(rule)}
                  onClick={() => openEdit(rule)}
                >
                  <TableCell>
                    <div className="flex flex-col items-start gap-0.5">
                      <EntityTypeChip
                        token={rule.source_type}
                        variant={srcIsContainer ? "container" : "default"}
                      />
                      {rule.label ? (
                        <span className="pl-1 font-mono text-[10px] text-muted-foreground">
                          label: {rule.label}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <DirectionGlyph side={rule.container_side} />
                  </TableCell>
                  <TableCell>
                    <EntityTypeChip
                      token={rule.target_type}
                      variant={tgtIsContainer ? "container" : "default"}
                    />
                  </TableCell>
                  <TableCell>
                    {conveying ? <ConveyPill level={rule.conveys_max} /> : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {rule.edge_count}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {conveying ? rule.closure_rows : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {!rule.is_active ? (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Inactive
                        </Badge>
                      ) : conveying ? (
                        <Badge>
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          Conveys
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <CircleSlash className="mr-1 h-3 w-3" />
                          Known
                        </Badge>
                      )}
                      {srcIsContainer ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-500"
                        >
                          <TriangleAlert className="h-3 w-3" />
                          big→little
                        </Badge>
                      ) : null}
                      {rule.reverse_edge_count > 0 ? (
                        <Badge variant="destructive" className="gap-1">
                          <TriangleAlert className="h-3 w-3" />
                          {rule.reverse_edge_count} wrong-way
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Edit rule"
                        onClick={() => openEdit(rule)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Delete rule"
                        onClick={() => setDeleteTarget(rule)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No rules match the current filter.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* Reachability inspector */}
      <ReachabilityInspector />

      {/* Rule editor */}
      <Sheet open={editor !== null} onOpenChange={(o) => !o && setEditor(null)}>
        <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
          {editor ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {editor.mode === "create"
                    ? "New relationship rule"
                    : "Edit relationship rule"}
                </SheetTitle>
                <SheetDescription>
                  {editorValid
                    ? ruleSentence({
                        source_type: editor.sourceType,
                        target_type: editor.targetType,
                        label: editor.label || null,
                        container_side: editor.containerSide,
                        conveys_max: editor.conveysMax,
                        is_active: editor.isActive,
                      })
                    : "Pick a source (content) and target (container) to begin."}
                </SheetDescription>
              </SheetHeader>

              {/* Source + target */}
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium">Source (content)</span>
                  {editor.mode === "create" ? (
                    <EntityTypeCombobox
                      value={editor.sourceType || null}
                      onChange={(t) =>
                        setEditor({ ...editor, sourceType: t })
                      }
                      placeholder="Select content type…"
                    />
                  ) : (
                    <EntityTypeChip token={editor.sourceType} showToken />
                  )}
                </div>
                <div className="flex items-center justify-center py-0.5">
                  <DirectionGlyph side={editor.containerSide} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium">Target (container)</span>
                  {editor.mode === "create" ? (
                    <EntityTypeCombobox
                      value={editor.targetType || null}
                      onChange={(t) =>
                        setEditor({ ...editor, targetType: t })
                      }
                      placeholder="Select container type…"
                    />
                  ) : (
                    <EntityTypeChip token={editor.targetType} showToken />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium">
                    Label{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional — blank applies to any label)
                    </span>
                  </span>
                  {editor.mode === "create" ? (
                    <Input
                      value={editor.label}
                      onChange={(e) =>
                        setEditor({ ...editor, label: e.target.value })
                      }
                      placeholder="e.g. attachment"
                      className="h-8"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {editor.label ? (
                        <span className="font-mono">{editor.label}</span>
                      ) : (
                        "— (generic rule, any label)"
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Container side */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">Container side</span>
                <p className="text-xs text-muted-foreground">
                  Convention: the edge is stored little→big, so the{" "}
                  <span className="font-medium text-foreground">target</span>{" "}
                  ({label(editor.targetType) || "container"}) is normally the
                  container.
                </p>
                {(
                  [
                    ["none", "Neither — just a known relationship"],
                    [
                      "target",
                      `${label(editor.targetType) || "Target"} is the container (convention)`,
                    ],
                    [
                      "source",
                      `${label(editor.sourceType) || "Source"} is the container — against convention (big→little); only by explicit design`,
                    ],
                  ] as const
                ).map(([side, text]) => (
                  <Button
                    key={side}
                    variant={
                      editor.containerSide === side ? "default" : "outline"
                    }
                    size="sm"
                    className={`justify-start ${side === "source" && editor.containerSide !== "source" ? "border-amber-500/50 text-amber-700 dark:text-amber-500" : ""}`}
                    onClick={() =>
                      setEditor({ ...editor, containerSide: side })
                    }
                  >
                    {side === "source" ? (
                      <TriangleAlert className="mr-1.5 h-3.5 w-3.5" />
                    ) : null}
                    {text}
                  </Button>
                ))}
                {editor.containerSide === "source" ? (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    This declares the edge stored big→little. Every writer must
                    store it that way, and the notes field must say why.
                  </p>
                ) : null}
              </div>

              {/* Conveyance ceiling — only when it conveys */}
              {editorConveys ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium">
                    Maximum conveyed level
                  </span>
                  <Select
                    value={editor.conveysMax}
                    onValueChange={(v) =>
                      setEditor({ ...editor, conveysMax: v as PermissionLevel })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">
                        viewer — visible through the container, never editable
                      </SelectItem>
                      <SelectItem value="editor">
                        editor — full collaboration inside a shared workspace
                      </SelectItem>
                      <SelectItem value="admin">
                        admin — avoid; almost never right through a cascade
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Composes as LEAST along a path. Admin on a container never
                    silently confers admin on contents.
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-xs font-medium">Active</span>
                <Switch
                  checked={editor.isActive}
                  onCheckedChange={(v) => setEditor({ ...editor, isActive: v })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">Notes</span>
                <Textarea
                  value={editor.notes}
                  onChange={(e) =>
                    setEditor({ ...editor, notes: e.target.value })
                  }
                  rows={3}
                  placeholder="Why this rule exists; any direction exceptions."
                />
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 pb-4">
                {editor.mode === "edit" && editor.original ? (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={saving}
                    onClick={() => setDeleteTarget(editor.original)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Delete
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditor(null)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={saving || !editorValid}
                    onClick={() => {
                      if (editorChangesConveyance) setConfirmSave(true);
                      else void saveRule();
                    }}
                  >
                    {editor.mode === "create" ? "Create rule" : "Save rule"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Guards */}
      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={
          editorNewlyConveys
            ? "Make this relationship convey access?"
            : "Change how this relationship conveys access?"
        }
        description={
          editor
            ? `${
                editorNewlyConveys
                  ? `This will immediately make ${editor.original?.edge_count ?? "any"} existing association(s) of this shape convey access`
                  : `This changes the cascade (side/ceiling) on ${editor.original?.edge_count ?? "any"} existing association(s) of this shape`
              }, and the reachability cache will rebuild. Continue?`
            : undefined
        }
        confirmLabel="Apply"
        busy={saving}
        onConfirm={saveRule}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete this relationship rule?"
        description={
          deleteTarget
            ? `${label(deleteTarget.source_type)} → ${label(deleteTarget.target_type)} will be removed from the registry. ${
                deleteTarget.edge_count > 0
                  ? `Its ${deleteTarget.edge_count} existing association(s) become UNREGISTERED (they convey nothing, and would be rejected under enforcement). `
                  : ""
              }The closure cache rebuilds. You can recreate the rule at any time.`
            : undefined
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={saving}
        onConfirm={deleteRule}
      />
      <ConfirmDialog
        open={confirmRebuild}
        onOpenChange={setConfirmRebuild}
        title="Rebuild the reachability cache?"
        description="Always safe — the cache is disposable and is fully re-derived from the association tuples."
        confirmLabel="Rebuild"
        busy={busy}
        onConfirm={rebuildCache}
      />
      <ConfirmDialog
        open={confirmEnforce !== null}
        onOpenChange={(o) => !o && setConfirmEnforce(null)}
        title={
          confirmEnforce
            ? "Enable relationship enforcement?"
            : "Disable relationship enforcement?"
        }
        description={
          confirmEnforce
            ? "Any association whose (source, target, label) shape is not registered and active will be rejected at write time."
            : "Unregistered edge shapes will be accepted again."
        }
        confirmLabel={confirmEnforce ? "Enable" : "Disable"}
        variant={confirmEnforce ? "default" : "destructive"}
        busy={busy}
        onConfirm={() => setEnforcement(confirmEnforce === true)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Direction between content and container, encoded structurally (no prose). */
function DirectionGlyph({ side }: { side: string }) {
  if (side === "target") {
    return (
      <MoveRight
        className="mx-auto h-4 w-4 text-primary"
        aria-label="content → container (convention)"
      />
    );
  }
  if (side === "source") {
    return (
      <MoveLeft
        className="mx-auto h-4 w-4 text-amber-600 dark:text-amber-500"
        aria-label="container ← content (against convention)"
      />
    );
  }
  return (
    <span
      className="mx-auto block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
      aria-label="related, conveys nothing"
    />
  );
}

/** Conveyance-ceiling pill with a level-appropriate tone. */
function ConveyPill({ level }: { level: PermissionLevel }) {
  const tone =
    level === "admin"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-500"
      : level === "viewer"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400"
        : "border-primary/40 bg-primary/10 text-primary";
  return (
    <span
      className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {level}
    </span>
  );
}

function StatusTile({
  label: tileLabel,
  value,
  accent = false,
  tone,
}: {
  label: string;
  value: number;
  accent?: boolean;
  tone?: "ok" | "warn" | "danger";
}) {
  const valueTone =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : accent
          ? "text-primary"
          : "";
  return (
    <div className="flex items-baseline gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <span className={`text-lg font-semibold tabular-nums ${valueTone}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{tileLabel}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

const PROBLEM_TITLES: Record<string, string> = {
  unregistered_pair: "Unregistered pair",
  wrong_way_edges: "Wrong-way edges",
  conveying_container_not_shareable: "Container not shareable",
  conveying_rule_no_edges: "Conveying rule, no edges",
  inactive_rule_with_edges: "Inactive rule, live edges",
};

/** The single unified drift report — every problem the admin must resolve. */
function ProblemsPanel({
  problems,
  errorCount,
  warningCount,
  busy,
  onRegister,
  onEdit,
}: {
  problems: RelationshipProblem[];
  errorCount: number;
  warningCount: number;
  busy: boolean;
  onRegister: (source: string, target: string, label: string | null) => void;
  onEdit: (source: string, target: string, label: string | null) => void;
}) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-4 w-4" />
        No drift detected — every association shape is registered, directions are
        clean, and every conveying container is shareable.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        Drift &amp; problems
        {errorCount > 0 ? (
          <Badge variant="destructive">{errorCount} error{errorCount === 1 ? "" : "s"}</Badge>
        ) : null}
        {warningCount > 0 ? (
          <Badge
            variant="outline"
            className="border-amber-500/50 text-amber-600 dark:text-amber-500"
          >
            {warningCount} warning{warningCount === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableBody>
            {problems.map((p, i) => (
              <TableRow key={`${p.kind}:${p.source_type}:${p.target_type}:${p.label ?? ""}:${i}`}>
                <TableCell className="w-1">
                  <span
                    className={`block h-2 w-2 rounded-full ${p.severity === "error" ? "bg-destructive" : "bg-amber-500"}`}
                    aria-label={p.severity}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs font-medium">
                  {PROBLEM_TITLES[p.kind] ?? p.kind}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <EntityTypeChip token={p.source_type} />
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <EntityTypeChip token={p.target_type} />
                    {p.label ? (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {p.label}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="max-w-md text-xs text-muted-foreground">
                  {p.detail}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                  {p.edge_count > 0 ? `${p.edge_count} edges` : ""}
                </TableCell>
                <TableCell className="w-40 text-right">
                  {p.kind === "unregistered_pair" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        onRegister(p.source_type, p.target_type, p.label)
                      }
                    >
                      Register as known
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onEdit(p.source_type, p.target_type, p.label)
                      }
                    >
                      Open rule
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ReachabilityInspector() {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<"contents" | "containers">("contents");
  const [entityType, setEntityType] = useState<string>("thread");
  const [entityId, setEntityId] = useState("");
  const [loading, setLoading] = useState(false);
  const [contents, setContents] = useState<ReachabilityContent[] | null>(null);
  const [containers, setContainers] = useState<ReachabilityContainer[] | null>(
    null,
  );

  async function lookup() {
    const id = entityId.trim();
    if (!id) {
      toast.error("Enter an entity UUID");
      return;
    }
    if (!entityType) {
      toast.error("Pick an entity type");
      return;
    }
    setLoading(true);
    setContents(null);
    setContainers(null);
    try {
      if (mode === "contents") {
        const { data, error } = await supabase.rpc(
          "admin_reachability_contents",
          { p_type: entityType, p_id: id },
        );
        if (error) throw error;
        setContents(data ?? []);
      } else {
        const { data, error } = await supabase.rpc(
          "admin_reachability_containers",
          { p_type: entityType, p_id: id },
        );
        if (error) throw error;
        setContainers(data ?? []);
      }
    } catch (e) {
      toast.error(
        `Lookup failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setLoading(false);
    }
  }

  const rows = mode === "contents" ? contents : containers;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Layers className="h-4 w-4" />
        Reachability inspector
        <span className="font-normal text-muted-foreground">
          — the &ldquo;why can they see this?&rdquo; debugger
        </span>
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger className="h-8 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contents">
              What does this container reach?
            </SelectItem>
            <SelectItem value="containers">
              Which containers convey access to this item?
            </SelectItem>
          </SelectContent>
        </Select>
        <EntityTypeCombobox
          value={entityType || null}
          onChange={(t) => setEntityType(t)}
          placeholder="entity type…"
          className="w-52"
        />
        <Input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="entity UUID"
          className="h-8 w-80 font-mono text-xs"
        />
        <Button size="sm" disabled={loading} onClick={() => void lookup()}>
          {loading ? (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          Look up
        </Button>
      </div>

      {rows !== null ? (
        rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {mode === "contents"
              ? "This container reaches nothing."
              : "No container conveys access to this item."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {mode === "contents" ? "Item" : "Container"}
                  </TableHead>
                  <TableHead className="w-96">ID</TableHead>
                  <TableHead className="w-20">Depth</TableHead>
                  <TableHead className="w-24">Max level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const type =
                    "item_type" in row ? row.item_type : row.container_type;
                  const id = "item_id" in row ? row.item_id : row.container_id;
                  return (
                    <TableRow key={`${type}:${id}`}>
                      <TableCell>
                        <EntityTypeChip token={type} showToken />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{id}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {row.depth}
                      </TableCell>
                      <TableCell>
                        <ConveyPill level={row.max_level} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </section>
  );
}
