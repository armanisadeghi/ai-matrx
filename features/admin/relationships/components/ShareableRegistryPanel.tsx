"use client";

// features/admin/relationships/components/ShareableRegistryPanel.tsx
//
// Full CRUD home for platform.shareable_resource_registry, colocated with the
// Relationship Manager so "conveying_container_not_shareable" drift can be
// fixed in place: click "Register as shareable" on a drift row (or "Register
// resource" here) and the row exists the moment the RPC commits — the
// reachability cascade goes live immediately.
//
// /administration/sharing keeps its link-policy specialty view (is_link_
// shareable + public_columns for anonymous share links); this panel owns the
// full row so those two levers are also editable here.

import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/utils/supabase/client";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { EntityTypeCombobox } from "@/components/entity-types/EntityTypeCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  ShareableResourceForm,
  type ShareableEditorState,
} from "./ShareableResourceForm";
import type { ShareableRegistryRow } from "../types";

function label(token: string): string {
  return tryGetEntityInfo(token)?.label ?? token;
}

const EMPTY_EDITOR: ShareableEditorState = {
  mode: "create",
  resourceType: "",
  schemaName: "",
  tableName: "",
  displayLabel: "",
  urlPathTemplate: "",
  idColumn: "id",
  ownerColumn: "created_by",
  isPublicColumn: "visibility",
  rlsUsesHasPermission: false,
  isActive: true,
  contentRole: "",
  isScopeable: false,
  isLinkShareable: false,
  publicColumns: "",
  notes: "",
};

function rowToEditor(row: ShareableRegistryRow): ShareableEditorState {
  return {
    mode: "edit",
    resourceType: row.resource_type,
    schemaName: row.schema_name,
    tableName: row.table_name,
    displayLabel: row.display_label,
    urlPathTemplate: row.url_path_template,
    idColumn: row.id_column ?? "id",
    ownerColumn: row.owner_column ?? "created_by",
    isPublicColumn: row.is_public_column ?? "",
    rlsUsesHasPermission: row.rls_uses_has_permission,
    isActive: row.is_active,
    contentRole: row.content_role ?? "",
    isScopeable: row.is_scopeable,
    isLinkShareable: row.is_link_shareable,
    publicColumns: (row.public_columns ?? []).join(", "),
    notes: row.notes ?? "",
  };
}

interface Props {
  registry: ShareableRegistryRow[];
  /** Set by the drift panel's "Register as shareable" action; consumed once. */
  pendingToken: string | null;
  onPendingTokenConsumed: () => void;
  /** Bump the server-fetched data (router.refresh() in the parent). */
  onMutated: () => void;
}

export function ShareableRegistryPanel({
  registry,
  pendingToken,
  onPendingTokenConsumed,
  onMutated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<ShareableEditorState | null>(null);
  const [sidePanelId, setSidePanelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);

  const registeredTokens = useMemo(
    () => new Set(registry.map((r) => r.resource_type)),
    [registry],
  );

  async function openForToken(token: string) {
    const existing = registry.find((r) => r.resource_type === token);
    if (existing) {
      setEditor(rowToEditor(existing));
      setSidePanelId(existing.resource_type);
      return;
    }
    setResolving(true);
    try {
      const { data, error } = await supabase.rpc(
        "admin_shareable_registry_defaults",
        { p_token: token },
      );
      if (error) throw error;
      const d = data?.[0];
      setEditor({
        ...EMPTY_EDITOR,
        resourceType: token,
        schemaName: d?.schema_name ?? "",
        tableName: d?.table_name ?? "",
        displayLabel: d?.display_label ?? label(token),
        notes:
          "Registered as shareable from the Relationship Manager drift report.",
      });
    } catch (e) {
      toast.error(
        `Couldn't load defaults for ${label(token)}: ${e instanceof Error ? e.message : String(e)}`,
      );
      setEditor({
        ...EMPTY_EDITOR,
        resourceType: token,
        displayLabel: label(token),
      });
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => {
    if (!pendingToken) return;
    void openForToken(pendingToken);
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    onPendingTokenConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingToken]);

  function openCreate() {
    setSidePanelId(null);
    setEditor({ ...EMPTY_EDITOR });
  }

  function openEdit(row: ShareableRegistryRow) {
    setEditor(rowToEditor(row));
  }

  function openEditInSidePanel(row: ShareableRegistryRow) {
    openEdit(row);
    setSidePanelId(row.resource_type);
  }

  const valid =
    editor !== null &&
    editor.resourceType.length > 0 &&
    editor.schemaName.length > 0 &&
    editor.tableName.length > 0 &&
    editor.displayLabel.length > 0 &&
    editor.urlPathTemplate.includes("{id}");

  async function saveResource() {
    if (!editor || !valid) return;
    setSaving(true);
    try {
      const columns = editor.isLinkShareable
        ? editor.publicColumns
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const { error } = await supabase.rpc("admin_upsert_shareable_resource", {
        p_resource_type: editor.resourceType,
        p_schema_name: editor.schemaName,
        p_table_name: editor.tableName,
        p_display_label: editor.displayLabel,
        p_url_path_template: editor.urlPathTemplate,
        p_id_column: editor.idColumn || undefined,
        p_owner_column: editor.ownerColumn || undefined,
        p_is_public_column: editor.isPublicColumn || undefined,
        p_rls_uses_has_permission: editor.rlsUsesHasPermission,
        p_is_active: editor.isActive,
        p_content_role: editor.contentRole || undefined,
        p_notes: editor.notes || undefined,
        p_is_scopeable: editor.isScopeable,
        p_is_link_shareable: editor.isLinkShareable,
        p_public_columns: columns,
      });
      if (error) throw error;
      toast.success(
        editor.mode === "create"
          ? `${label(editor.resourceType)} registered as shareable`
          : `${label(editor.resourceType)} saved`,
      );
      toast.info(
        "FE compile-time mirror (utils/permissions/registry.ts) needs `pnpm tsx scripts/regen-shareable-registry-snapshot.ts` to stay in parity.",
      );
      setEditor(null);
      setSidePanelId(null);
      onMutated();
    } catch (e) {
      toast.error(
        `Couldn't save: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo((): MatrxColumnDef<ShareableRegistryRow>[] => {
    return [
      {
        id: "resource_type",
        accessorKey: "resource_type",
        header: "Resource type",
        accessorFn: (r) => `${r.resource_type} ${label(r.resource_type)}`,
        cell: (row) => <EntityTypeChip token={row.resource_type} showToken />,
        width: 208,
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
        width: 176,
      },
      {
        id: "display_label",
        accessorKey: "display_label",
        header: "Label",
        editable: "string",
        cell: (row) => <span className="text-sm">{row.display_label}</span>,
        width: 140,
      },
      {
        id: "content_role",
        accessorKey: "content_role",
        header: "Role",
        filter: "select",
        filterOptions: [
          { value: "source", label: "source" },
          { value: "destination", label: "destination" },
          { value: "container", label: "container" },
          { value: "utility", label: "utility" },
          { value: "hybrid", label: "hybrid" },
        ],
        cell: (row) =>
          row.content_role ? (
            <Badge variant="outline">{row.content_role}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 108,
      },
      {
        id: "rls_uses_has_permission",
        accessorKey: "rls_uses_has_permission",
        header: "Direct grants",
        filter: "boolean",
        editable: "boolean",
        cell: (row) => (
          <span className="text-xs">
            {row.rls_uses_has_permission ? "Yes" : "No"}
          </span>
        ),
        align: "center",
        width: 96,
      },
      {
        id: "is_scopeable",
        accessorKey: "is_scopeable",
        header: "Scopeable",
        filter: "boolean",
        editable: "boolean",
        cell: (row) => (
          <span className="text-xs">{row.is_scopeable ? "Yes" : "No"}</span>
        ),
        align: "center",
        width: 84,
      },
      {
        id: "is_link_shareable",
        accessorKey: "is_link_shareable",
        header: "Link share",
        filter: "boolean",
        editable: "boolean",
        cell: (row) => (
          <span className="text-xs">
            {row.is_link_shareable ? "Yes" : "No"}
          </span>
        ),
        align: "center",
        width: 88,
      },
      {
        id: "notes",
        accessorKey: "notes",
        header: "Notes",
        editable: "string",
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
        editable: "boolean",
        cell: (row) => (
          <span className="text-xs">{row.is_active ? "Yes" : "No"}</span>
        ),
        width: 72,
      },
    ];
  }, []);

  return (
    <section
      ref={sectionRef}
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldQuestion className="h-4 w-4 text-primary" />
          Shareable resource registry
          <Badge variant="outline">{registry.length}</Badge>
        </h2>
        <p className="text-xs text-muted-foreground">
          What can be shared — sharing/ownership/RLS shape per entity type.
        </p>
        <Button
          size="sm"
          className="ml-auto"
          disabled={resolving}
          onClick={openCreate}
        >
          Register resource
        </Button>
      </div>
      <div className="min-h-[16rem]">
        <MatrxDataTable
          data={registry}
          columns={columns}
          getRowId={(r) => r.resource_type}
          pageSize={25}
          zebra
          emptyState={{
            title: "Nothing registered yet",
            description: "Register a resource to make it shareable.",
          }}
          toolbar={{ search: true, searchPlaceholder: "Search registry…" }}
          copy={{
            label: "Shareable resource",
            listLabel: "Shareable resource registry (this view)",
            location:
              "AI Matrx Admin — Relationship Manager (/administration/relationships)",
            rowKind: "shareable-resource",
            listKind: "shareable-resources",
            rowDescription:
              "One platform.shareable_resource_registry row from the Relationship Manager.",
            listDescription:
              "Filtered/sorted shareable-registry rows currently visible.",
            humanRow: (r) =>
              [
                `${label(r.resource_type)} (${r.resource_type}) — ${r.schema_name}.${r.table_name}`,
                `active=${r.is_active} link_shareable=${r.is_link_shareable} rls_has_permission=${r.rls_uses_has_permission} scopeable=${r.is_scopeable}`,
                r.notes ? `notes: ${r.notes}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            rowAttributes: (r) => ({
              resource_type: r.resource_type,
              schema: r.schema_name,
              table: r.table_name,
              active: r.is_active,
            }),
            listAttributes: (visible, all) => ({
              visible: visible.length,
              total: all.length,
            }),
          }}
          edit={{
            enabled: true,
            onSave: async (editsMap) => {
              const keys = Object.keys(editsMap);
              for (const key of keys) {
                const row = registry.find((r) => r.resource_type === key);
                if (!row) continue;
                const patch = editsMap[key] ?? {};
                const next = { ...row, ...patch } as ShareableRegistryRow;
                const { error } = await supabase.rpc(
                  "admin_upsert_shareable_resource",
                  {
                    p_resource_type: next.resource_type,
                    p_schema_name: next.schema_name,
                    p_table_name: next.table_name,
                    p_display_label: next.display_label,
                    p_url_path_template: next.url_path_template,
                    p_id_column: next.id_column ?? undefined,
                    p_owner_column: next.owner_column ?? undefined,
                    p_is_public_column: next.is_public_column ?? undefined,
                    p_rls_uses_has_permission: next.rls_uses_has_permission,
                    p_is_active: next.is_active,
                    p_content_role: next.content_role ?? undefined,
                    p_notes: next.notes ?? undefined,
                    p_is_scopeable: next.is_scopeable,
                    p_is_link_shareable: next.is_link_shareable,
                    p_public_columns: next.public_columns ?? [],
                  },
                );
                if (error) throw error;
              }
              onMutated();
            },
          }}
          selectedId={sidePanelId}
          onSelectedIdChange={(id) => {
            setSidePanelId(id);
            if (!id && editor?.mode === "edit") setEditor(null);
          }}
          onRowOpen={(row) => openEditInSidePanel(row)}
          detail={{
            title: (row) => `Edit: ${label(row.resource_type)}`,
            description: (row) => `${row.schema_name}.${row.table_name}`,
            defaultWidth: 480,
            render: () =>
              editor && editor.mode === "edit" ? (
                <ShareableResourceForm
                  editor={editor}
                  onChange={setEditor}
                  valid={valid}
                  saving={saving}
                  onCancel={() => {
                    setEditor(null);
                    setSidePanelId(null);
                  }}
                  onSave={() => void saveResource()}
                />
              ) : null,
          }}
          rowActions={(row) => (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openEditInSidePanel(row)}
            >
              Edit
            </Button>
          )}
        />
      </div>

      {editor?.mode === "create" ? (
        <SidePanelSurface
          title="New shareable resource"
          description="Registers a row in platform.shareable_resource_registry — the container type the reachability cascade checks."
          onClose={() => setEditor(null)}
          defaultWidth={480}
        >
          <ShareableResourceForm
            editor={editor}
            onChange={(next) => {
              // Auto-resolve schema/table/label the moment a token is chosen
              // from a blank create (Register resource button flow).
              if (
                next.resourceType &&
                next.resourceType !== editor.resourceType
              ) {
                void openForToken(next.resourceType);
                return;
              }
              setEditor(next);
            }}
            disabledTokens={registeredTokens}
            valid={valid}
            saving={saving}
            onCancel={() => setEditor(null)}
            onSave={() => void saveResource()}
          />
        </SidePanelSurface>
      ) : null}
    </section>
  );
}
