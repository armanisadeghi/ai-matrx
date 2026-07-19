"use client";

// features/admin/relationships/components/EntityTypesClient.tsx
//
// Entity Types tab of the Relationships hub — the first-ever admin UI for
// platform.entity_types (previously migration-only). Full CRUD via the
// admin_entity_types_* SECURITY DEFINER RPCs; deletion is deactivate-only
// (tokens are FK targets of platform.associations).
//
// After any write the registry and types/generated/entity-types.generated.ts
// diverge until `pnpm gen:entity-types` runs — the drift banner compares the
// active registry tokens (server prop) against the generated vocabulary and
// stays up until they match again.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Power, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/utils/supabase/client";
import { ENTITY_TYPE_TOKENS } from "@/types/generated/entity-types.generated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  EntityTypeForm,
  isValidEntityToken,
  type EntityTypeEditorState,
} from "./EntityTypeForm";
import { RELATIONSHIPS_LOCATION } from "../utils";
import type { EntityTypeRow } from "../types";

type EntityTypeFacet = "all" | "active" | "inactive";

const EMPTY_EDITOR: EntityTypeEditorState = {
  mode: "create",
  token: "",
  schemaName: "",
  tableName: "",
  label: "",
  baseTier: "1",
  isVersioned: true,
  hasSoftDelete: true,
  isListed: false,
  isComponent: false,
  isModule: false,
  category: "",
  defaultScopeable: true,
  defaultVisibility: "",
  defaultMembersCanAdd: true,
  defaultNeedsApproval: false,
  defaultAutoIngest: false,
  rlsVariant: "",
  isActive: true,
  notes: "",
  referencePickable: false,
  titleColumn: "",
  contentRole: "",
  referenceCategory: "",
};

function rowToEditor(row: EntityTypeRow): EntityTypeEditorState {
  return {
    mode: "edit",
    token: row.token,
    schemaName: row.schema_name,
    tableName: row.table_name,
    label: row.label,
    baseTier: String(row.base_tier),
    isVersioned: row.is_versioned,
    hasSoftDelete: row.has_soft_delete,
    isListed: row.is_listed,
    isComponent: row.is_component,
    isModule: row.is_module,
    category: row.category ?? "",
    defaultScopeable: row.default_scopeable,
    defaultVisibility: row.default_visibility ?? "",
    defaultMembersCanAdd: row.default_members_can_add,
    defaultNeedsApproval: row.default_needs_approval,
    defaultAutoIngest: row.default_auto_ingest,
    rlsVariant: row.rls_variant ?? "",
    isActive: row.is_active,
    notes: row.notes ?? "",
    referencePickable: row.reference_pickable,
    titleColumn: row.title_column ?? "",
    contentRole: row.content_role ?? "",
    referenceCategory: row.reference_category ?? "",
  };
}

function FlagPill({ on, children }: { on: boolean; children: string }) {
  if (!on) return null;
  return (
    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
      {children}
    </Badge>
  );
}

interface Props {
  entityTypes: EntityTypeRow[];
}

export function EntityTypesClient({ entityTypes }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [, startTransition] = useTransition();

  const [facet, setFacet] = useState<EntityTypeFacet>("all");
  const [editor, setEditor] = useState<EntityTypeEditorState | null>(null);
  const [sidePanelId, setSidePanelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Row targeted for deactivate/reactivate confirmation. */
  const [activeTarget, setActiveTarget] = useState<EntityTypeRow | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  const existingTokens = useMemo(
    () => new Set(entityTypes.map((r) => r.token)),
    [entityTypes],
  );

  // -- generated-types drift ---------------------------------------------------

  const drift = useMemo(() => {
    const registryActive = new Set(
      entityTypes.filter((r) => r.is_active).map((r) => r.token),
    );
    const generated = new Set<string>(ENTITY_TYPE_TOKENS);
    const added = [...registryActive].filter((t) => !generated.has(t)).sort();
    const removed = [...generated].filter((t) => !registryActive.has(t)).sort();
    return { added, removed, dirty: added.length > 0 || removed.length > 0 };
  }, [entityTypes]);

  // -- derived -------------------------------------------------------------------

  const filtered = useMemo(() => {
    return entityTypes.filter((r) => {
      if (facet === "active" && !r.is_active) return false;
      if (facet === "inactive" && r.is_active) return false;
      return true;
    });
  }, [entityTypes, facet]);

  const columns = useMemo((): MatrxColumnDef<EntityTypeRow>[] => {
    return [
      {
        id: "token",
        accessorKey: "token",
        header: "Token",
        cell: (row) => (
          <span className="font-mono text-xs font-medium">{row.token}</span>
        ),
        width: 200,
      },
      {
        id: "table",
        header: "Schema.table",
        accessorFn: (r) => `${r.schema_name}.${r.table_name}`,
        cell: (row) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.schema_name}.{row.table_name}
          </span>
        ),
        width: 200,
      },
      {
        id: "label",
        accessorKey: "label",
        header: "Label",
        cell: (row) => <span className="text-sm">{row.label}</span>,
        width: 148,
      },
      {
        id: "category",
        accessorKey: "category",
        header: "Category",
        filter: "select",
        cell: (row) =>
          row.category ? (
            <Badge variant="outline">{row.category}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 120,
      },
      {
        id: "base_tier",
        accessorKey: "base_tier",
        header: "Tier",
        filter: "number",
        cell: (row) => (
          <span className="text-xs tabular-nums">{row.base_tier}</span>
        ),
        align: "center",
        width: 56,
      },
      {
        id: "flags",
        header: "Flags",
        accessorFn: (r) =>
          [
            r.is_versioned ? "versioned" : "",
            r.has_soft_delete ? "soft-delete" : "",
            r.is_listed ? "listed" : "",
            r.is_component ? "component" : "",
            r.is_module ? "module" : "",
            r.default_scopeable ? "scopeable" : "",
            r.reference_pickable ? "reference" : "",
          ]
            .filter(Boolean)
            .join(" "),
        cell: (row) => (
          <div className="flex flex-wrap items-center gap-1">
            <FlagPill on={row.is_versioned}>versioned</FlagPill>
            <FlagPill on={row.has_soft_delete}>soft-delete</FlagPill>
            <FlagPill on={row.is_listed}>listed</FlagPill>
            <FlagPill on={row.is_component}>component</FlagPill>
            <FlagPill on={row.is_module}>module</FlagPill>
            <FlagPill on={row.default_scopeable}>scopeable</FlagPill>
            <FlagPill on={row.reference_pickable}>reference</FlagPill>
          </div>
        ),
        width: 260,
      },
      {
        id: "reference",
        header: "Reference",
        accessorFn: (r) =>
          r.reference_pickable
            ? `${r.title_column ?? ""} ${r.content_role ?? ""}`
            : "",
        cell: (row) =>
          row.reference_pickable ? (
            <span className="font-mono text-[11px]">
              {row.title_column ?? "(candidate override)"}
              {row.reference_category ? (
                <span className="text-muted-foreground">
                  {" "}· {row.reference_category}
                </span>
              ) : row.content_role ? (
                <span className="text-muted-foreground"> · {row.content_role}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 170,
      },
      {
        id: "notes",
        accessorKey: "notes",
        header: "Notes",
        cell: (row) => (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {row.notes?.trim() || "—"}
          </span>
        ),
        width: 200,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Active",
        filter: "boolean",
        cell: (row) =>
          row.is_active ? (
            <span className="text-xs">Yes</span>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Inactive
            </Badge>
          ),
        width: 80,
      },
    ];
  }, []);

  const editorValid =
    editor !== null &&
    isValidEntityToken(editor.token) &&
    (editor.mode === "edit" || !existingTokens.has(editor.token)) &&
    editor.schemaName.length > 0 &&
    editor.tableName.length > 0 &&
    editor.label.length > 0 &&
    Number.isInteger(Number(editor.baseTier));

  // -- mutations -----------------------------------------------------------------

  function openCreate() {
    setSidePanelId(null);
    setEditor({ ...EMPTY_EDITOR });
  }

  function openEditInSidePanel(row: EntityTypeRow) {
    setEditor(rowToEditor(row));
    setSidePanelId(row.token);
  }

  async function saveEntityType() {
    if (!editor || !editorValid) return;
    setSaving(true);
    try {
      // A never-seen category slug is registered on the fly (idempotent),
      // so typing a fresh bucket name in the form Just Works.
      const refCat = editor.referenceCategory.trim();
      if (refCat) {
        const { error: catError } = await supabase.rpc(
          "admin_upsert_reference_category",
          {
            p_slug: refCat,
            p_label: refCat
              .replace(/[-_]+/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
          },
        );
        if (catError) throw catError;
      }
      const { error } = await supabase.rpc("admin_upsert_entity_type", {
        p_token: editor.token,
        p_schema_name: editor.schemaName,
        p_table_name: editor.tableName,
        p_label: editor.label,
        p_base_tier: Number(editor.baseTier),
        p_is_versioned: editor.isVersioned,
        p_has_soft_delete: editor.hasSoftDelete,
        p_is_listed: editor.isListed,
        p_is_component: editor.isComponent,
        p_is_module: editor.isModule,
        p_category: editor.category || undefined,
        p_default_scopeable: editor.defaultScopeable,
        p_default_visibility: editor.defaultVisibility || undefined,
        p_default_members_can_add: editor.defaultMembersCanAdd,
        p_default_needs_approval: editor.defaultNeedsApproval,
        p_default_auto_ingest: editor.defaultAutoIngest,
        p_rls_variant: editor.rlsVariant || undefined,
        p_is_active: editor.isActive,
        p_notes: editor.notes || undefined,
        p_reference_pickable: editor.referencePickable,
        p_title_column: editor.titleColumn || undefined,
        p_content_role: editor.contentRole || undefined,
        p_reference_category: editor.referenceCategory.trim() || undefined,
      });
      if (error) throw error;
      toast.success(
        editor.mode === "create"
          ? `${editor.token} registered — run pnpm gen:entity-types to update the TS vocabulary`
          : `${editor.token} saved`,
      );
      setEditor(null);
      setSidePanelId(null);
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't save: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function setActive() {
    const target = activeTarget;
    if (!target) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_set_entity_type_active", {
        p_token: target.token,
        p_is_active: !target.is_active,
      });
      if (error) throw error;
      toast.success(
        target.is_active
          ? `${target.token} deactivated — run pnpm gen:entity-types to update the TS vocabulary`
          : `${target.token} reactivated — run pnpm gen:entity-types to update the TS vocabulary`,
      );
      setActiveTarget(null);
      refresh();
    } catch (e) {
      toast.error(
        `Couldn't update: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  // -- render ---------------------------------------------------------------------

  const activeCount = entityTypes.filter((r) => r.is_active).length;

  return (
    <div className="flex flex-col gap-3 p-4">
      {drift.dirty ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            Generated types are out of date ({drift.added.length} added /{" "}
            {drift.removed.length} removed vs the registry) — run{" "}
            <span className="font-mono text-xs">pnpm gen:entity-types</span>{" "}
            and commit, or <span className="font-mono text-xs">pnpm check:entity-types</span>{" "}
            will fail CI.
            {drift.added.length > 0 ? (
              <span className="block font-mono text-xs">
                + {drift.added.join(", ")}
              </span>
            ) : null}
            {drift.removed.length > 0 ? (
              <span className="block font-mono text-xs">
                − {drift.removed.join(", ")}
              </span>
            ) : null}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText("pnpm gen:entity-types");
              toast.success("Command copied");
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy command
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Entity types registry</h2>
        <Badge variant="outline">
          {activeCount} active / {entityTypes.length}
        </Badge>
        <p className="text-xs text-muted-foreground">
          platform.entity_types — the canonical token vocabulary every registry
          consumer resolves against. Deletion is deactivate-only.
        </p>
        <Button size="sm" className="ml-auto" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New entity type
        </Button>
      </div>

      <div className="min-h-[28rem]">
        <MatrxDataTable
          data={filtered}
          columns={columns}
          getRowId={(r) => r.token}
          pageSize={50}
          zebra
          emptyState={{
            title: "No entity types match",
            description: "Try a different facet or clear column filters.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search tokens, tables, labels…",
            facets: [
              {
                type: "button-group",
                id: "entity-type-facet",
                value: facet,
                defaultValue: "all",
                options: [
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ],
                onChange: (v) => setFacet(v as EntityTypeFacet),
              },
            ],
          }}
          copy={{
            label: "Entity type",
            listLabel: "Entity types (this view)",
            location: RELATIONSHIPS_LOCATION,
            rowKind: "entity-type",
            listKind: "entity-types",
            rowDescription:
              "One platform.entity_types row from the Relationships hub.",
            listDescription:
              "Filtered/sorted entity-type registry rows currently visible.",
            humanRow: (r) =>
              [
                `${r.label} (${r.token}) — ${r.schema_name}.${r.table_name}`,
                `tier=${r.base_tier} active=${r.is_active} versioned=${r.is_versioned} soft_delete=${r.has_soft_delete}`,
                `listed=${r.is_listed} component=${r.is_component} module=${r.is_module} scopeable=${r.default_scopeable}`,
                r.category ? `category: ${r.category}` : null,
                r.notes ? `notes: ${r.notes}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            rowAttributes: (r) => ({
              token: r.token,
              schema: r.schema_name,
              table: r.table_name,
              active: r.is_active,
            }),
            listAttributes: (visible, all) => ({
              visible: visible.length,
              total: all.length,
              facet,
            }),
          }}
          selectedId={sidePanelId}
          onSelectedIdChange={(id) => {
            setSidePanelId(id);
            if (!id && editor?.mode === "edit") setEditor(null);
          }}
          onRowOpen={(row) => openEditInSidePanel(row)}
          detail={{
            title: (row) => `Edit: ${row.label}`,
            description: (row) => `${row.schema_name}.${row.table_name}`,
            defaultWidth: 480,
            render: () =>
              editor && editor.mode === "edit" ? (
                <EntityTypeForm
                  editor={editor}
                  onChange={setEditor}
                  existingTokens={existingTokens}
                  valid={editorValid}
                  saving={saving}
                  onCancel={() => {
                    setEditor(null);
                    setSidePanelId(null);
                  }}
                  onSave={() => void saveEntityType()}
                />
              ) : null,
          }}
          rowActions={(row) => (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Edit entity type"
                onClick={() => openEditInSidePanel(row)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={
                  row.is_active
                    ? "h-7 w-7 text-muted-foreground hover:text-destructive"
                    : "h-7 w-7 text-muted-foreground hover:text-foreground"
                }
                title={row.is_active ? "Deactivate" : "Reactivate"}
                onClick={() => setActiveTarget(row)}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        />
      </div>

      {/* Create — SidePanelSurface */}
      {editor?.mode === "create" ? (
        <SidePanelSurface
          title="New entity type"
          description="Registers a token in platform.entity_types — the canonical vocabulary for associations, sharing, and scopes."
          onClose={() => setEditor(null)}
          defaultWidth={480}
        >
          <EntityTypeForm
            editor={editor}
            onChange={setEditor}
            existingTokens={existingTokens}
            valid={editorValid}
            saving={saving}
            onCancel={() => setEditor(null)}
            onSave={() => void saveEntityType()}
          />
        </SidePanelSurface>
      ) : null}

      {/* Deactivate / reactivate guard */}
      <ConfirmDialog
        open={activeTarget !== null}
        onOpenChange={(o) => !o && setActiveTarget(null)}
        title={
          activeTarget?.is_active
            ? `Deactivate "${activeTarget.token}"?`
            : `Reactivate "${activeTarget?.token}"?`
        }
        description={
          activeTarget?.is_active
            ? `The token disappears from entity_types_list() and the generated TS vocabulary (after pnpm gen:entity-types), but existing platform.associations rows referencing it remain. Hard deletes are not offered — tokens are FK targets. You can reactivate at any time.`
            : `The token returns to entity_types_list() and the generated TS vocabulary on the next pnpm gen:entity-types run.`
        }
        confirmLabel={activeTarget?.is_active ? "Deactivate" : "Reactivate"}
        variant={activeTarget?.is_active ? "destructive" : "default"}
        busy={saving}
        onConfirm={setActive}
      />
    </div>
  );
}
