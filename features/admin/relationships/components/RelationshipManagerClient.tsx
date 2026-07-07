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
  MoveRight,
  TriangleAlert,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/utils/supabase/client";
import { ENTITY_TYPE_METADATA } from "@/types/generated/entity-types.generated";
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
  RelationshipRule,
  RelationshipSystemStatus,
  UnregisteredPair,
} from "../types";

// ---------------------------------------------------------------------------

function tokenLabel(token: string): string {
  const meta = (
    ENTITY_TYPE_METADATA as Record<
      string,
      { label: string } | undefined
    >
  )[token];
  return meta?.label ?? token;
}

function plural(label: string): string {
  return label.endsWith("s") ? label : `${label}s`;
}

/** Plain-language sentence for a rule — the most important UI detail. */
function ruleSentence(rule: RelationshipRule): string {
  const src = tokenLabel(rule.source_type);
  const tgt = tokenLabel(rule.target_type);
  const label = rule.label ? ` (label "${rule.label}")` : "";
  if (rule.container_side === "target") {
    return `${tgt} contains ${src}${label} — sharing a ${tgt} grants up to ${rule.conveys_max} on its ${plural(src)}.`;
  }
  if (rule.container_side === "source") {
    return `${src} contains ${tgt}${label} — sharing a ${src} grants up to ${rule.conveys_max} on its ${plural(tgt)}.`;
  }
  return `${src} ↔ ${tgt}${label} — known relationship, conveys no access.`;
}

type RuleFilter = "all" | "conveying" | "known" | "inactive";

interface EditorState {
  sourceType: string;
  targetType: string;
  label: string | null;
  containerSide: ContainerSide;
  conveysMax: PermissionLevel;
  isActive: boolean;
  notes: string;
  /** the rule as it exists in the DB, for change detection */
  original: RelationshipRule;
}

interface Props {
  status: RelationshipSystemStatus | null;
  rules: RelationshipRule[];
  unregistered: UnregisteredPair[];
}

export default function RelationshipManagerClient({
  status,
  rules,
  unregistered,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isPending, startTransition] = useTransition();

  const [filter, setFilter] = useState<RuleFilter>("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
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
        `${tokenLabel(r.source_type)} ${tokenLabel(r.target_type)}`.toLowerCase();
      return hay.toLowerCase().includes(q);
    });
  }, [rules, filter, query]);

  const reversedRuleCount = useMemo(
    () => rules.filter((r) => r.is_active && r.reverse_edge_count > 0).length,
    [rules],
  );

  const editorFlipsToConveying =
    editor !== null &&
    editor.containerSide !== "none" &&
    (editor.original.container_side === "none" ||
      editor.original.container_side !== editor.containerSide ||
      editor.original.conveys_max !== editor.conveysMax);

  // -- mutations ---------------------------------------------------------------

  async function saveRule() {
    if (!editor) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_upsert_relationship_rule", {
        p_source_type: editor.sourceType,
        p_target_type: editor.targetType,
        p_label: editor.label ?? undefined,
        p_container_side: editor.containerSide,
        p_conveys_max: editor.conveysMax,
        p_is_active: editor.isActive,
        p_notes: editor.notes || undefined,
      });
      if (error) throw error;
      toast.success("Rule saved — closure cache rebuilt");
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

  async function registerPair(pair: UnregisteredPair) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_upsert_relationship_rule", {
        p_source_type: pair.source_type,
        p_target_type: pair.target_type,
        p_label: pair.label ?? undefined,
        p_container_side: "none",
        p_conveys_max: "editor",
        p_is_active: true,
        p_notes: "Registered as known from the unregistered-pairs panel",
      });
      if (error) throw error;
      toast.success(
        `Registered ${pair.source_type} → ${pair.target_type} as known`,
      );
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
  const unregisteredCount = unregistered.length;

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
        <div className="ml-auto flex items-center gap-2">
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
          container (a task points to its project). Container side{" "}
          <span className="font-mono">target</span> is the norm —{" "}
          <span className="font-mono">source</span> means the edge is stored
          big→little and is a deliberate, documented exception. A write in the
          wrong direction of a registered pair is REJECTED at the DB with an
          error naming the canonical direction — direction changes happen
          here, in the registry, not in code. Rows below flag any reversed
          edges already in the data.
        </span>
      </div>

      {reversedRuleCount > 0 ? (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {reversedRuleCount} rule(s) have wrong-way edges in the data
          (flagged below). Find the writer and fix it — the direction guard
          only rejects writes made after 2026-07-06.
        </div>
      ) : null}

      {enforcementOn && unregisteredCount > 0 ? (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Enforcement is ON but {unregisteredCount} unregistered pair(s) exist
          in the data. This should not happen — register them below.
        </div>
      ) : null}

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
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {label}
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

      {/* Registry table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Relationship</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-20">Ceiling</TableHead>
              <TableHead className="w-20 text-right">Edges</TableHead>
              <TableHead className="w-24 text-right">Closure</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((rule) => {
              const conveying =
                rule.container_side !== "none" && rule.is_active;
              return (
                <TableRow
                  key={`${rule.source_type}:${rule.target_type}:${rule.label ?? ""}`}
                  className="cursor-pointer"
                  onClick={() =>
                    setEditor({
                      sourceType: rule.source_type,
                      targetType: rule.target_type,
                      label: rule.label,
                      containerSide: rule.container_side as ContainerSide,
                      conveysMax: rule.conveys_max,
                      isActive: rule.is_active,
                      notes: rule.notes ?? "",
                      original: rule,
                    })
                  }
                >
                  <TableCell className="max-w-xl">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{ruleSentence(rule)}</span>
                      <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                        <DirectionChip
                          token={rule.source_type}
                          isContainer={rule.container_side === "source"}
                        />
                        <MoveRight className="h-3 w-3" />
                        <DirectionChip
                          token={rule.target_type}
                          isContainer={rule.container_side === "target"}
                        />
                        {rule.container_side === "source" ? (
                          <span className="ml-1 text-amber-600 dark:text-amber-500">
                            big→little — deliberate exception
                          </span>
                        ) : null}
                        {rule.reverse_edge_count > 0 ? (
                          <Badge variant="destructive" className="ml-1 gap-1">
                            <TriangleAlert className="h-3 w-3" />
                            {rule.reverse_edge_count} wrong-way edge
                            {rule.reverse_edge_count === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {!rule.is_active ? (
                      <Badge variant="outline" className="text-muted-foreground">
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
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {conveying ? rule.conveys_max : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {rule.edge_count}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {conveying ? rule.closure_rows : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No rules match the current filter.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* Unregistered pairs */}
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Boxes className="h-4 w-4" />
          Unregistered pairs
          <Badge variant={unregisteredCount > 0 ? "destructive" : "secondary"}>
            {unregisteredCount}
          </Badge>
        </h2>
        {unregisteredCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every association shape in the data is registered. Enforcement can
            be enabled.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableBody>
                {unregistered.map((pair) => (
                  <TableRow key={`${pair.source_type}:${pair.target_type}:${pair.label ?? ""}`}>
                    <TableCell className="text-sm">
                      {tokenLabel(pair.source_type)}
                      <ArrowRight className="mx-1 inline h-3 w-3" />
                      {tokenLabel(pair.target_type)}
                      {pair.label ? (
                        <span className="text-muted-foreground"> · {pair.label}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {pair.edge_count} edges
                    </TableCell>
                    <TableCell className="w-40 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void registerPair(pair)}
                      >
                        Register as known
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Reachability inspector */}
      <ReachabilityInspector />

      {/* Rule editor */}
      <Sheet open={editor !== null} onOpenChange={(o) => !o && setEditor(null)}>
        <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
          {editor ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {tokenLabel(editor.sourceType)}
                  <ArrowRight className="mx-1.5 inline h-4 w-4" />
                  {tokenLabel(editor.targetType)}
                  {editor.label ? (
                    <span className="text-muted-foreground"> · {editor.label}</span>
                  ) : null}
                </SheetTitle>
                <SheetDescription>
                  {ruleSentence({
                    ...editor.original,
                    container_side: editor.containerSide,
                    conveys_max: editor.conveysMax,
                    is_active: editor.isActive,
                  })}
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">Container side</span>
                <p className="text-xs text-muted-foreground">
                  Convention: the edge is stored little→big, so the{" "}
                  <span className="font-medium text-foreground">target</span>{" "}
                  ({tokenLabel(editor.targetType)}) is normally the container.
                </p>
                {(
                  [
                    ["none", "Neither — just a known relationship"],
                    [
                      "target",
                      `${tokenLabel(editor.targetType)} is the container (convention)`,
                    ],
                    [
                      "source",
                      `${tokenLabel(editor.sourceType)} is the container — against convention (big→little); only by explicit design`,
                    ],
                  ] as const
                ).map(([side, label]) => (
                  <Button
                    key={side}
                    variant={editor.containerSide === side ? "default" : "outline"}
                    size="sm"
                    className={`justify-start ${side === "source" && editor.containerSide !== "source" ? "border-amber-500/50 text-amber-700 dark:text-amber-500" : ""}`}
                    onClick={() =>
                      setEditor({ ...editor, containerSide: side })
                    }
                  >
                    {side === "source" ? (
                      <TriangleAlert className="mr-1.5 h-3.5 w-3.5" />
                    ) : null}
                    {label}
                  </Button>
                ))}
                {editor.containerSide === "source" ? (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    This declares the edge stored big→little. Every writer
                    must store it that way, and the notes field must say why.
                  </p>
                ) : null}
              </div>

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
                />
              </div>

              <div className="mt-auto flex justify-end gap-2 pb-4">
                <Button variant="outline" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    if (editorFlipsToConveying) setConfirmSave(true);
                    else void saveRule();
                  }}
                >
                  Save rule
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Guards */}
      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title="Make this relationship convey access?"
        description={
          editor
            ? `This will immediately make ${editor.original.edge_count} existing association(s) convey access, and the reachability cache will rebuild. Continue?`
            : undefined
        }
        confirmLabel="Apply"
        busy={saving}
        onConfirm={saveRule}
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

/** Source/target token chip; the container side gets the visual weight. */
function DirectionChip({
  token,
  isContainer,
}: {
  token: string;
  isContainer: boolean;
}) {
  return (
    <span
      className={
        isContainer
          ? "rounded bg-primary/10 px-1 py-0.5 font-medium text-primary"
          : "rounded bg-muted px-1 py-0.5"
      }
      title={isContainer ? "container (receives shares; conveys to contents)" : "content"}
    >
      {isContainer ? <Boxes className="mr-0.5 inline h-3 w-3" /> : null}
      {token}
    </span>
  );
}

function StatusTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <span
        className={`text-lg font-semibold tabular-nums ${accent ? "text-primary" : ""}`}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReachabilityInspector() {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<"contents" | "containers">("contents");
  const [entityType, setEntityType] = useState("thread");
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
        <Input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="entity token (e.g. thread)"
          className="h-8 w-44"
          list="relationship-entity-tokens"
        />
        <datalist id="relationship-entity-tokens">
          {Object.keys(ENTITY_TYPE_METADATA).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
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
                      <TableCell className="text-sm">
                        {tokenLabel(type)}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {type}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{id}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {row.depth}
                      </TableCell>
                      <TableCell className="text-xs">{row.max_level}</TableCell>
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
