"use client";

// features/admin/relationships/components/RelationshipRulesClient.tsx
//
// Rules tab of the Relationships hub: the platform.association_types registry
// (MatrxDataTable, every-column filter/sort, inline edit) with full CRUD via
// the admin_relationship_* SECURITY DEFINER RPCs. Rule changes trigger an
// automatic full closure rebuild in the DB, so after any mutation we just
// router.refresh() the server-fetched data.
//
// The Overview drift panel deep-links here with ?edit=<source:target:label>
// (consume-once: applied then stripped with router.replace).

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleSlash,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { createClient } from "@/utils/supabase/client";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { UrlStateMatrxDataTable } from "@/lib/data-table/UrlStateMatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { RuleEditorForm } from "./RuleEditorForm";
import { ConveyPill, DirectionGlyph } from "./shared";
import { label, ruleKey, ruleSentence, RELATIONSHIPS_LOCATION } from "../utils";
import type {
  ContainerSide,
  PermissionLevel,
  RelationshipRule,
} from "../types";
import {
  enumUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@/lib/url-state/useUrlState";

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

function ruleToEditor(rule: RelationshipRule): EditorState {
  return {
    mode: "edit",
    sourceType: rule.source_type,
    targetType: rule.target_type,
    label: rule.label ?? "",
    containerSide: rule.container_side as ContainerSide,
    conveysMax: rule.conveys_max,
    isActive: rule.is_active,
    notes: rule.notes ?? "",
    original: rule,
  };
}

interface Props {
  rules: RelationshipRule[];
  /** ?edit=<source:target:label> from the Overview drift panel; consume-once. */
  initialEditKey?: string;
}

export function RelationshipRulesClient({ rules, initialEditKey }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [, startTransition] = useTransition();

  const [filter, setFilter] = useUrlState(
    "facet",
    enumUrlCodec<RuleFilter>(["all", "conveying", "known", "inactive"], "all"),
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  /** Side-panel selection — independent of WindowPanel edit hydration. */
  const [sidePanelParam, setSidePanelParam] = useUrlState(
    "row",
    stringUrlCodec(),
  );
  const sidePanelId = sidePanelParam || null;
  const setSidePanelId = (id: string | null) => setSidePanelParam(id ?? "");
  const [saving, setSaving] = useState(false);
  /** The rule targeted for deletion — independent of the editor so a row-level
   *  delete doesn't also pop the editor sheet. */
  const [deleteTarget, setDeleteTarget] = useState<RelationshipRule | null>(
    null,
  );

  const refresh = () => startTransition(() => router.refresh());

  useEffect(() => {
    if (!sidePanelId) return;
    const rule = rules.find((candidate) => ruleKey(candidate) === sidePanelId);
    if (rule) setEditor(ruleToEditor(rule));
  }, [rules, sidePanelId]);

  // Consume-once deep link: open the side-panel editor for the requested rule,
  // then strip the param so refresh/back doesn't re-trigger it.
  const consumedEditKey = useRef(false);
  useEffect(() => {
    if (!initialEditKey || consumedEditKey.current) return;
    consumedEditKey.current = true;
    const rule = rules.find((r) => ruleKey(r) === initialEditKey);
    if (rule) {
      openEditInSidePanel(rule);
    } else {
      toast.error(`Rule not found: ${initialEditKey}`);
    }
    const params = new URLSearchParams(window.location.search);
    params.delete("edit");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `/administration/database/relationships/rules${query ? `?${query}` : ""}`,
    );
  }, [initialEditKey, rules]);

  // -- derived ---------------------------------------------------------------

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (
        filter === "conveying" &&
        (r.container_side === "none" || !r.is_active)
      )
        return false;
      if (filter === "known" && (r.container_side !== "none" || !r.is_active))
        return false;
      if (filter === "inactive" && r.is_active) return false;
      return true;
    });
  }, [rules, filter]);

  const ruleColumns = useMemo((): MatrxColumnDef<RelationshipRule>[] => {
    return [
      {
        id: "source_type",
        accessorKey: "source_type",
        header: "Source (content)",
        accessorFn: (r) =>
          `${r.source_type} ${label(r.source_type)} ${r.label ?? ""}`,
        cell: (rule) => {
          const srcIsContainer = rule.container_side === "source";
          return (
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
          );
        },
        width: 208,
      },
      {
        id: "dir",
        header: "Dir",
        accessorFn: (r) => r.container_side,
        filter: "select",
        filterOptions: [
          { value: "target", label: "content → container" },
          { value: "source", label: "container ← content" },
          { value: "none", label: "known only" },
        ],
        accessorKey: "container_side",
        editable: "select",
        editOptions: [
          { value: "target", label: "target (convention)" },
          { value: "source", label: "source (big→little)" },
          { value: "none", label: "none" },
        ],
        cell: (rule) => <DirectionGlyph side={rule.container_side} />,
        align: "center",
        width: 64,
        sortable: true,
      },
      {
        id: "target_type",
        accessorKey: "target_type",
        header: "Target (container)",
        accessorFn: (r) => `${r.target_type} ${label(r.target_type)}`,
        cell: (rule) => (
          <EntityTypeChip
            token={rule.target_type}
            variant={rule.container_side === "target" ? "container" : "default"}
          />
        ),
        width: 208,
      },
      {
        id: "conveys_max",
        accessorKey: "conveys_max",
        header: "Conveys",
        accessorFn: (r) =>
          r.container_side !== "none" && r.is_active ? r.conveys_max : "",
        editable: "select",
        editOptions: [
          { value: "viewer", label: "viewer" },
          { value: "editor", label: "editor" },
          { value: "admin", label: "admin" },
        ],
        cell: (rule) =>
          rule.container_side !== "none" && rule.is_active ? (
            <ConveyPill level={rule.conveys_max} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 96,
      },
      {
        id: "edge_count",
        accessorKey: "edge_count",
        header: "Edges",
        filter: "number",
        cell: (rule) => (
          <span className="text-xs tabular-nums">{rule.edge_count}</span>
        ),
        align: "right",
        width: 64,
      },
      {
        id: "closure_rows",
        accessorKey: "closure_rows",
        header: "Closure",
        filter: "number",
        accessorFn: (r) =>
          r.container_side !== "none" && r.is_active ? r.closure_rows : null,
        cell: (rule) => (
          <span className="text-xs tabular-nums">
            {rule.container_side !== "none" && rule.is_active
              ? rule.closure_rows
              : "—"}
          </span>
        ),
        align: "right",
        width: 80,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => {
          const conveying = r.container_side !== "none" && r.is_active;
          if (!r.is_active) return "inactive";
          if (conveying) return "conveys";
          return "known";
        },
        filter: "select",
        filterOptions: [
          { value: "conveys", label: "Conveys" },
          { value: "known", label: "Known" },
          { value: "inactive", label: "Inactive" },
        ],
        cell: (rule) => {
          const conveying = rule.container_side !== "none" && rule.is_active;
          const srcIsContainer = rule.container_side === "source";
          return (
            <div className="flex flex-wrap items-center gap-1">
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
          );
        },
        width: 160,
      },
      {
        id: "notes",
        accessorKey: "notes",
        header: "Notes",
        editable: "string",
        cell: (rule) => (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {rule.notes?.trim() || "—"}
          </span>
        ),
        width: 180,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Active",
        filter: "boolean",
        editable: "boolean",
        cell: (rule) => (
          <span className="text-xs">{rule.is_active ? "Yes" : "No"}</span>
        ),
        width: 72,
      },
    ];
  }, []);

  const editorConveys = editor !== null && editor.containerSide !== "none";

  const editorIsDuplicate =
    editor?.mode === "create" &&
    editor.sourceType.length > 0 &&
    editor.targetType.length > 0 &&
    rules.some(
      (r) =>
        r.source_type === editor.sourceType &&
        r.target_type === editor.targetType &&
        (r.label ?? "") === (editor.label || ""),
    );

  const editorValid =
    editor !== null &&
    editor.sourceType.length > 0 &&
    editor.targetType.length > 0 &&
    !editorIsDuplicate;

  // -- mutations ---------------------------------------------------------------

  function openCreate() {
    setSidePanelId(null);
    setEditor({ ...EMPTY_EDITOR });
  }

  function openEdit(rule: RelationshipRule) {
    setEditor(ruleToEditor(rule));
  }

  function openEditInSidePanel(rule: RelationshipRule) {
    openEdit(rule);
    setSidePanelId(ruleKey(rule));
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
      setSidePanelId(null);
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't save the rule: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
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
      if (sidePanelId === ruleKey(target)) setSidePanelId(null);
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't delete the rule: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  // -- render ------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Association rules</h2>
        <Badge variant="outline">{rules.length}</Badge>
        <Button size="sm" className="ml-auto" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New rule
        </Button>
      </div>

      {/* Registry table — MatrxDataTable (sticky, every-column filter/sort) */}
      <div className="min-h-[28rem]">
        <UrlStateMatrxDataTable
          data={filtered}
          columns={ruleColumns}
          getRowId={ruleKey}
          pageSize={50}
          zebra
          emptyState={{
            title: "No rules match",
            description: "Try a different facet or clear column filters.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search all fields…",
            anyOf: {
              columnIds: ["source_type", "target_type"],
              placeholder: "Entity type (source or target)…",
            },
            facets: [
              {
                type: "button-group",
                id: "rule-facet",
                value: filter,
                defaultValue: "all",
                options: [
                  { value: "all", label: "All" },
                  { value: "conveying", label: "Conveys access" },
                  { value: "known", label: "Known only" },
                  { value: "inactive", label: "Inactive" },
                ],
                onChange: (v) => setFilter(v as RuleFilter),
              },
            ],
          }}
          copy={{
            label: "Relationship rule",
            listLabel: "Relationship rules (this view)",
            location: RELATIONSHIPS_LOCATION,
            rowKind: "relationship-rule",
            listKind: "relationship-rules",
            rowDescription:
              "One platform.association_types rule from the Relationship Manager.",
            listDescription:
              "Filtered/sorted relationship rules currently visible in the registry table.",
            humanRow: (r) =>
              [
                ruleSentence(r),
                `source=${r.source_type} target=${r.target_type} label=${r.label ?? "(any)"}`,
                `side=${r.container_side} conveys=${r.conveys_max} active=${r.is_active}`,
                `edges=${r.edge_count} closure=${r.closure_rows} reverse=${r.reverse_edge_count}`,
                r.notes ? `notes: ${r.notes}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            rowAttributes: (r) => ({
              source: r.source_type,
              target: r.target_type,
              label: r.label,
              side: r.container_side,
              active: r.is_active,
            }),
            listAttributes: (visible, all) => ({
              visible: visible.length,
              total: all.length,
              facet: filter,
            }),
          }}
          edit={{
            enabled: true,
            onSave: async (editsMap) => {
              const keys = Object.keys(editsMap);
              for (const key of keys) {
                const rule = rules.find((r) => ruleKey(r) === key);
                if (!rule) continue;
                const patch = editsMap[key] ?? {};
                const next = { ...rule, ...patch } as RelationshipRule;
                const { error } = await supabase.rpc(
                  "admin_upsert_relationship_rule",
                  {
                    p_source_type: next.source_type,
                    p_target_type: next.target_type,
                    p_label: next.label ?? undefined,
                    p_container_side: next.container_side,
                    p_conveys_max: next.conveys_max,
                    p_is_active: next.is_active,
                    p_notes: next.notes ?? undefined,
                  },
                );
                if (error) throw error;
              }
              refresh();
            },
          }}
          selectedId={sidePanelId}
          onSelectedIdChange={(id) => {
            setSidePanelId(id);
            if (!id && editor?.mode === "edit") setEditor(null);
          }}
          onRowOpen={(rule) => openEditInSidePanel(rule)}
          detail={{
            title: (rule) =>
              `Edit: ${label(rule.source_type)} → ${label(rule.target_type)}`,
            description: (rule) => ruleSentence(rule),
            defaultWidth: 480,
            render: () =>
              editor && editor.mode === "edit" ? (
                <RuleEditorForm
                  editor={editor}
                  onChange={(next) =>
                    setEditor({ ...next, original: editor.original })
                  }
                  directionGlyph={
                    <DirectionGlyph side={editor.containerSide} />
                  }
                  sentence={
                    editorValid
                      ? ruleSentence({
                          source_type: editor.sourceType,
                          target_type: editor.targetType,
                          label: editor.label || null,
                          container_side: editor.containerSide,
                          conveys_max: editor.conveysMax,
                          is_active: editor.isActive,
                        })
                      : "Pick a source (content) and target (container) to begin."
                  }
                  conveys={editorConveys}
                  valid={editorValid}
                  saving={saving}
                  existingRules={rules}
                  onCancel={() => {
                    setEditor(null);
                    setSidePanelId(null);
                  }}
                  onSave={() => void saveRule()}
                  onDelete={
                    editor.original
                      ? () => setDeleteTarget(editor.original)
                      : undefined
                  }
                />
              ) : null,
          }}
          window={{
            title: (rule) =>
              `${label(rule.source_type)} → ${label(rule.target_type)}`,
            defaultTab: "edit",
            onOpen: (rule) => openEdit(rule),
            width: 760,
            height: 640,
            // Edit tab reuses detail.render (RuleEditorForm) via MatrxDataTable
            // fallback. View tab = DataRowInspector.
          }}
          rowActions={(rule) => (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Edit rule"
                onClick={() => openEditInSidePanel(rule)}
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
            </>
          )}
        />
      </div>

      {/* Create rule — SidePanelSurface (MatrxDynamicPanelHost) */}
      {editor?.mode === "create" ? (
        <SidePanelSurface
          title="New relationship rule"
          description={
            editorValid
              ? ruleSentence({
                  source_type: editor.sourceType,
                  target_type: editor.targetType,
                  label: editor.label || null,
                  container_side: editor.containerSide,
                  conveys_max: editor.conveysMax,
                  is_active: editor.isActive,
                })
              : "Pick a source (content) and target (container) to begin."
          }
          onClose={() => setEditor(null)}
          defaultWidth={480}
        >
          <RuleEditorForm
            editor={editor}
            onChange={(next) => setEditor({ ...next, original: null })}
            directionGlyph={<DirectionGlyph side={editor.containerSide} />}
            sentence={
              editorValid
                ? ruleSentence({
                    source_type: editor.sourceType,
                    target_type: editor.targetType,
                    label: editor.label || null,
                    container_side: editor.containerSide,
                    conveys_max: editor.conveysMax,
                    is_active: editor.isActive,
                  })
                : "Pick a source (content) and target (container) to begin."
            }
            conveys={editorConveys}
            valid={editorValid}
            saving={saving}
            existingRules={rules}
            onCancel={() => setEditor(null)}
            onSave={() => void saveRule()}
          />
        </SidePanelSurface>
      ) : null}

      {/* Guards */}
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
    </div>
  );
}
