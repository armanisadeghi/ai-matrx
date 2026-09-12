"use client";

// Admin surface for the 2026-07-10 ai-schema reshape: the old single service
// catalog is GONE, replaced by ai.endpoint (one row per serving vendor) +
// ai.api (one row per wire contract). Simple two-list rendering — a tab per
// entity, each with a table and an edit panel. ADMIN-ONLY: vendors and wire
// formats must never leak to user-facing surfaces.

import React, { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ai-matrx/design-system";
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
import { EnhancedEditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import { AlertTriangle, Lock, Plug, Plus, Save, Trash2, X } from "lucide-react";
import { extractErrorMessage } from "@/utils/errors";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { useAppDispatch } from "@/lib/redux/hooks";
import { reloadAiCatalog } from "../../catalogReload";
import { aiModelService } from "../../service";
import type { AiApi, AiEndpoint } from "../../types";
import { ProTextarea } from "@/components/official/ProTextarea";

// ─── Shared bits ─────────────────────────────────────────────────────────────

function FormField({
  label,
  children,
  required,
  description,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

const VISIBILITIES = ["personal", "internal", "link", "public"] as const;

function VisibilitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VISIBILITIES.map((v) => (
          <SelectItem key={v} value={v}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Endpoint form ───────────────────────────────────────────────────────────

type EndpointFormData = {
  vendor: string;
  internal_name: string;
  display_name: string;
  base_url: string;
  auth_ref: Record<string, unknown>;
  byok_secret_key: string;
  priority: string;
  is_active: boolean;
  notes: string;
  visibility: AiEndpoint["visibility"];
};

const EMPTY_ENDPOINT_FORM: EndpointFormData = {
  vendor: "",
  internal_name: "",
  display_name: "",
  base_url: "",
  auth_ref: {},
  byok_secret_key: "",
  priority: "100",
  is_active: true,
  notes: "",
  visibility: "internal",
};

function endpointToForm(row: AiEndpoint): EndpointFormData {
  return {
    vendor: row.vendor ?? "",
    internal_name: row.internal_name ?? "",
    display_name: row.display_name ?? "",
    base_url: row.base_url ?? "",
    auth_ref: row.auth_ref ?? {},
    byok_secret_key: row.byok_secret_key ?? "",
    priority: row.priority != null ? String(row.priority) : "100",
    is_active: row.is_active ?? true,
    notes: row.notes ?? "",
    visibility: row.visibility,
  };
}

function EndpointFormFields({
  data,
  onChange,
}: {
  data: EndpointFormData;
  onChange: (d: EndpointFormData) => void;
}) {
  const set =
    (key: keyof EndpointFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...data, [key]: e.target.value });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Vendor"
          required
          description="Unique serving vendor key (admin-only fact)"
        >
          <Input
            value={data.vendor}
            onChange={set("vendor")}
            placeholder="e.g. anthropic"
            className="h-8 text-sm font-mono"
          />
        </FormField>
        <FormField label="Internal Name" required>
          <Input
            value={data.internal_name}
            onChange={set("internal_name")}
            placeholder="e.g. anthropic"
            className="h-8 text-sm font-mono"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Display Name" required>
          <Input
            value={data.display_name}
            onChange={set("display_name")}
            placeholder="e.g. Anthropic"
            className="h-8 text-sm"
          />
        </FormField>
        <FormField label="Base URL">
          <Input
            type="url"
            value={data.base_url}
            onChange={set("base_url")}
            placeholder="https://api.vendor.com/v1"
            className="h-8 text-sm font-mono"
          />
        </FormField>
      </div>
      <FormField
        label="Auth Ref"
        description='How auth is resolved, e.g. {"type":"env","key":"ANTHROPIC_API_KEY"}'
      >
        <EnhancedEditableJsonViewer
          data={data.auth_ref}
          title="Auth Ref"
          onChange={(d) =>
            onChange({
              ...data,
              auth_ref: (typeof d === "string" ? {} : d) as Record<
                string,
                unknown
              >,
            })
          }
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3 items-end">
        <FormField
          label="BYOK Secret Key"
          description="Bring-your-own-key secret reference name"
        >
          <Input
            value={data.byok_secret_key}
            onChange={set("byok_secret_key")}
            placeholder="e.g. USER_ANTHROPIC_API_KEY"
            className="h-8 text-sm font-mono"
          />
        </FormField>
        <FormField label="Priority" description="Lower = preferred">
          <Input
            type="number"
            value={data.priority}
            onChange={set("priority")}
            className="h-8 text-sm"
          />
        </FormField>
      </div>
      <div className="flex items-center gap-2 h-8">
        <Switch
          checked={data.is_active}
          onCheckedChange={(v) => onChange({ ...data, is_active: v })}
          id="endpoint_is_active"
        />
        <Label htmlFor="endpoint_is_active" className="text-sm cursor-pointer">
          Active
        </Label>
      </div>
      <FormField label="Notes">
        <ProTextarea
          value={data.notes}
          onChange={set("notes")}
          className="text-sm min-h-[72px] resize-none"
        />
      </FormField>
      <FormField label="Visibility">
        <VisibilitySelect
          value={data.visibility}
          onChange={(v) =>
            onChange({
              ...data,
              visibility: v as EndpointFormData["visibility"],
            })
          }
        />
      </FormField>
    </div>
  );
}

// ─── API form ────────────────────────────────────────────────────────────────

type ApiFormData = {
  name: string;
  display_name: string;
  translator_key: string;
  transport: string;
  rules: Record<string, unknown>;
  request_defaults: Record<string, unknown>;
  description: string;
  visibility: AiApi["visibility"];
};

const EMPTY_API_FORM: ApiFormData = {
  name: "",
  display_name: "",
  translator_key: "",
  transport: "http",
  rules: { params: {}, constraints: [] },
  request_defaults: {},
  description: "",
  visibility: "internal",
};

function apiToForm(row: AiApi): ApiFormData {
  return {
    name: row.name ?? "",
    display_name: row.display_name ?? "",
    translator_key: row.translator_key ?? "",
    transport: row.transport ?? "",
    rules: row.rules ?? { params: {}, constraints: [] },
    request_defaults: row.request_defaults ?? {},
    description: row.description ?? "",
    visibility: row.visibility,
  };
}

function ApiFormFields({
  data,
  onChange,
}: {
  data: ApiFormData;
  onChange: (d: ApiFormData) => void;
}) {
  const set =
    (key: keyof ApiFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...data, [key]: e.target.value });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Name" required description="Unique machine key">
          <Input
            value={data.name}
            onChange={set("name")}
            placeholder="e.g. anthropic-messages"
            className="h-8 text-sm font-mono"
          />
        </FormField>
        <FormField label="Display Name" required>
          <Input
            value={data.display_name}
            onChange={set("display_name")}
            placeholder="e.g. Anthropic Messages API"
            className="h-8 text-sm"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Translator Key"
          required
          description="Unique wire-contract token (the old wire_format vocabulary)"
        >
          <Input
            value={data.translator_key}
            onChange={set("translator_key")}
            placeholder="e.g. anthropic"
            className="h-8 text-sm font-mono"
          />
        </FormField>
        <FormField label="Transport" required>
          <Input
            value={data.transport}
            onChange={set("transport")}
            placeholder="e.g. http"
            className="h-8 text-sm font-mono"
          />
        </FormField>
      </div>
      <FormField
        label="Rules"
        description='Enveloped params/constraints: {"params":{...},"constraints":[...]}'
      >
        <EnhancedEditableJsonViewer
          data={data.rules}
          title="Rules"
          onChange={(d) =>
            onChange({
              ...data,
              rules: (typeof d === "string" ? {} : d) as Record<
                string,
                unknown
              >,
            })
          }
        />
      </FormField>
      <FormField
        label="Request Defaults"
        description="Default request body overrides"
      >
        <EnhancedEditableJsonViewer
          data={data.request_defaults}
          title="Request Defaults"
          onChange={(d) =>
            onChange({
              ...data,
              request_defaults: (typeof d === "string" ? {} : d) as Record<
                string,
                unknown
              >,
            })
          }
        />
      </FormField>
      <FormField label="Description">
        <ProTextarea
          value={data.description}
          onChange={set("description")}
          className="text-sm min-h-[72px] resize-none"
        />
      </FormField>
      <FormField label="Visibility">
        <VisibilitySelect
          value={data.visibility}
          onChange={(v) =>
            onChange({ ...data, visibility: v as ApiFormData["visibility"] })
          }
        />
      </FormField>
    </div>
  );
}

// ─── Shared table + panel scaffolding ───────────────────────────────────────

type EndpointApiRow = { id: string; is_system: boolean };

function RowActions<T extends EndpointApiRow>({
  row,
  onDelete,
  deleteNoun,
}: {
  row: T;
  onDelete: (row: T) => void;
  deleteNoun: string;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 sm:h-7 sm:w-7"
        title={row.is_system ? "System rows cannot be deleted" : "Delete"}
        disabled={row.is_system}
        onClick={(event) => {
          event.stopPropagation();
          setPendingDelete(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleteNoun}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {deleteNoun} from the active list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setPendingDelete(false);
                onDelete(row);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EndpointApiTable<T extends EndpointApiRow>({
  title,
  rows,
  columns,
  loading,
  loadError,
  actionError,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onRetry,
  deleteNoun,
  mobileTitle,
  mobileDetails,
}: {
  title: string;
  rows: T[];
  columns: MatrxColumnDef<T>[];
  loading: boolean;
  loadError: string | null;
  actionError: string | null;
  selectedId: string | null;
  onSelect: (row: T) => void;
  onCreate: () => void;
  onDelete: (row: T) => void;
  onRetry: () => void;
  deleteNoun: string;
  mobileTitle: (row: T) => string;
  mobileDetails: (row: T) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {actionError && (
        <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      <MatrxDataTable<T>
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={loading}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        defaultSort={null}
        onRowOpen={onSelect}
        detail={{ enabled: false }}
        rowClassName={(row) =>
          row.id === selectedId
            ? "bg-primary/10 hover:bg-primary/15"
            : undefined
        }
        emptyState={
          loadError
            ? {
                title: `Could not load ${title.toLowerCase()}`,
                description: loadError,
                icon: <Plug className="h-8 w-8" />,
                action: (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    Retry
                  </Button>
                ),
              }
            : {
                title: "Nothing here yet",
                icon: <Plug className="h-8 w-8" />,
              }
        }
        toolbar={{
          search: false,
          leading: (
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{title}</h2>
              <Badge variant="outline" className="text-xs">
                {rows.length}
              </Badge>
            </div>
          ),
          actions: (
            <Button
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={onCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          ),
        }}
        rowActions={(row) => (
          <RowActions row={row} onDelete={onDelete} deleteNoun={deleteNoun} />
        )}
        mobileCards={(row, _index, controls) => (
          <article
            className={
              row.id === selectedId
                ? "space-y-2 rounded-md border border-primary/40 bg-primary/10 p-3"
                : "space-y-2 rounded-md border border-border p-3"
            }
          >
            <button
              type="button"
              className="block max-w-full truncate text-left font-medium hover:underline"
              onClick={() => onSelect(row)}
            >
              {mobileTitle(row)}
            </button>
            <div className="text-xs text-muted-foreground">
              {mobileDetails(row)}
            </div>
            <div className="flex justify-end">{controls.actions}</div>
          </article>
        )}
      />
    </div>
  );
}

function DetailPanel({
  title,
  isSystem,
  saving,
  saveError,
  canSave,
  onClose,
  onSave,
  children,
}: {
  title: string;
  isSystem: boolean;
  saving: boolean;
  saveError: string | null;
  canSave: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{title}</span>
          {isSystem && (
            <Badge
              variant="outline"
              className="text-xs gap-1 bg-muted text-muted-foreground shrink-0"
            >
              <Lock className="h-3 w-3" />
              System
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3 min-h-0">{children}</div>
      <div className="border-t bg-card shrink-0">
        {saveError && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
            <span className="flex-1 min-w-0 break-words">{saveError}</span>
          </div>
        )}
        <div className="px-3 py-2 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
            Close
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={onSave}
            disabled={saving || !canSave}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Container ───────────────────────────────────────────────────────────────

export default function EndpointsApisContainer() {
  const dispatch = useAppDispatch();
  const [endpoints, setEndpoints] = useState<AiEndpoint[]>([]);
  const [apis, setApis] = useState<AiApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedEndpoint, setSelectedEndpoint] = useState<AiEndpoint | null>(
    null,
  );
  const [endpointIsNew, setEndpointIsNew] = useState(false);
  const [endpointPanelOpen, setEndpointPanelOpen] = useState(false);
  const [endpointForm, setEndpointForm] =
    useState<EndpointFormData>(EMPTY_ENDPOINT_FORM);

  const [selectedApi, setSelectedApi] = useState<AiApi | null>(null);
  const [apiIsNew, setApiIsNew] = useState(false);
  const [apiPanelOpen, setApiPanelOpen] = useState(false);
  const [apiForm, setApiForm] = useState<ApiFormData>(EMPTY_API_FORM);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [fetchedEndpoints, fetchedApis] = await Promise.all([
        aiModelService.fetchEndpoints(),
        aiModelService.fetchApis(),
      ]);
      setEndpoints(fetchedEndpoints);
      setApis(fetchedApis);
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Endpoint save/delete ──

  const saveEndpoint = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const payload = {
        vendor: endpointForm.vendor.trim(),
        internal_name: endpointForm.internal_name.trim(),
        display_name: endpointForm.display_name.trim(),
        base_url: endpointForm.base_url.trim() || null,
        auth_ref: endpointForm.auth_ref,
        byok_secret_key: endpointForm.byok_secret_key.trim() || null,
        priority: parseInt(endpointForm.priority, 10) || 100,
        is_active: endpointForm.is_active,
        notes: endpointForm.notes.trim() || null,
        visibility: endpointForm.visibility,
      };
      let saved: AiEndpoint;
      if (endpointIsNew) {
        const organization_id = await resolveSystemOrgId();
        saved = await aiModelService.createEndpoint({
          ...payload,
          organization_id,
        });
      } else if (selectedEndpoint) {
        saved = await aiModelService.updateEndpoint(
          selectedEndpoint.id,
          payload,
        );
      } else {
        return;
      }
      setSelectedEndpoint(saved);
      setEndpointIsNew(false);
      setEndpointForm(endpointToForm(saved));
      setEndpoints((prev) => {
        const idx = prev.findIndex((e) => e.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved].sort((a, b) =>
          a.display_name.localeCompare(b.display_name),
        );
      });
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteEndpoint = async (row: AiEndpoint) => {
    setActionError(null);
    try {
      await aiModelService.deleteEndpoint(row.id);
      setEndpoints((prev) => prev.filter((e) => e.id !== row.id));
      if (selectedEndpoint?.id === row.id) setEndpointPanelOpen(false);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  };

  // ── API save/delete ──

  const saveApi = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const payload = {
        name: apiForm.name.trim(),
        display_name: apiForm.display_name.trim(),
        translator_key: apiForm.translator_key.trim(),
        transport: apiForm.transport.trim(),
        rules: apiForm.rules,
        request_defaults: apiForm.request_defaults,
        description: apiForm.description.trim() || null,
        visibility: apiForm.visibility,
      };
      let saved: AiApi;
      if (apiIsNew) {
        const organization_id = await resolveSystemOrgId();
        saved = await aiModelService.createApi({ ...payload, organization_id });
      } else if (selectedApi) {
        saved = await aiModelService.updateApi(selectedApi.id, payload);
      } else {
        return;
      }
      setSelectedApi(saved);
      setApiIsNew(false);
      setApiForm(apiToForm(saved));
      setApis((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved].sort((a, b) =>
          a.display_name.localeCompare(b.display_name),
        );
      });
      // ai.api.rules drives live translation — reload the brain's catalog.
      void dispatch(reloadAiCatalog());
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteApi = async (row: AiApi) => {
    setActionError(null);
    try {
      await aiModelService.deleteApi(row.id);
      setApis((prev) => prev.filter((a) => a.id !== row.id));
      if (selectedApi?.id === row.id) setApiPanelOpen(false);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  };

  // ── Columns ──

  const endpointColumns: MatrxColumnDef<AiEndpoint>[] = [
    {
      accessorKey: "display_name",
      header: "Display Name",
      sortable: false,
      filter: false,
      cell: (e) => <span className="font-medium">{e.display_name}</span>,
    },
    {
      accessorKey: "vendor",
      header: "Vendor",
      sortable: false,
      filter: false,
      cell: (e) => (
        <Badge variant="outline" className="text-xs font-mono">
          {e.vendor}
        </Badge>
      ),
    },
    {
      accessorKey: "internal_name",
      header: "Internal Name",
      sortable: false,
      filter: false,
      cell: (e) => (
        <span className="font-mono text-muted-foreground">
          {e.internal_name}
        </span>
      ),
    },
    {
      accessorKey: "base_url",
      header: "Base URL",
      sortable: false,
      filter: false,
      cell: (e) =>
        e.base_url ? (
          <span className="font-mono text-muted-foreground truncate block max-w-[220px]">
            {e.base_url}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      sortable: false,
      filter: false,
      cell: (e) => <span className="tabular-nums">{e.priority}</span>,
    },
    {
      accessorKey: "is_active",
      header: "Active",
      sortable: false,
      filter: false,
      cell: (e) =>
        e.is_active ? (
          <Badge
            variant="outline"
            className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
          >
            Active
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-xs bg-muted text-muted-foreground"
          >
            Inactive
          </Badge>
        ),
    },
  ];

  const apiColumns: MatrxColumnDef<AiApi>[] = [
    {
      accessorKey: "display_name",
      header: "Display Name",
      sortable: false,
      filter: false,
      cell: (a) => <span className="font-medium">{a.display_name}</span>,
    },
    {
      accessorKey: "name",
      header: "Name",
      sortable: false,
      filter: false,
      cell: (a) => (
        <span className="font-mono text-muted-foreground">{a.name}</span>
      ),
    },
    {
      accessorKey: "translator_key",
      header: "Translator Key",
      sortable: false,
      filter: false,
      cell: (a) => (
        <Badge variant="outline" className="text-xs font-mono">
          {a.translator_key}
        </Badge>
      ),
    },
    {
      accessorKey: "transport",
      header: "Transport",
      sortable: false,
      filter: false,
      cell: (a) => (
        <span className="font-mono text-muted-foreground">{a.transport}</span>
      ),
    },
  ];

  const endpointCanSave =
    endpointForm.vendor.trim().length > 0 &&
    endpointForm.internal_name.trim().length > 0 &&
    endpointForm.display_name.trim().length > 0;

  const apiCanSave =
    apiForm.name.trim().length > 0 &&
    apiForm.display_name.trim().length > 0 &&
    apiForm.translator_key.trim().length > 0 &&
    apiForm.transport.trim().length > 0;

  return (
    <Tabs defaultValue="endpoints" className="flex flex-col h-full min-h-0">
      <div className="border-b px-3 shrink-0 bg-card">
        <TabsList className="h-10 bg-transparent p-0 gap-0">
          <TabsTrigger
            value="endpoints"
            className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-sm px-4"
          >
            Endpoints
            <Badge variant="outline" className="ml-1.5 text-xs h-4 px-1">
              {endpoints.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="apis"
            className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-sm px-4"
          >
            APIs
            <Badge variant="outline" className="ml-1.5 text-xs h-4 px-1">
              {apis.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="endpoints"
        className="flex-1 m-0 overflow-hidden min-h-0"
      >
        <div className="flex h-full min-h-0">
          <div
            className={`${endpointPanelOpen ? "w-1/2" : "w-full"} min-w-0 flex flex-col overflow-hidden transition-all duration-200`}
          >
            <EndpointApiTable
              title="AI Endpoints (serving vendors)"
              rows={endpoints}
              columns={endpointColumns}
              loading={loading}
              loadError={loadError}
              actionError={actionError}
              selectedId={selectedEndpoint?.id ?? null}
              onSelect={(row) => {
                setSelectedEndpoint(row);
                setEndpointIsNew(false);
                setEndpointForm(endpointToForm(row));
                setEndpointPanelOpen(true);
                setSaveError(null);
              }}
              onCreate={() => {
                setSelectedEndpoint(null);
                setEndpointIsNew(true);
                setEndpointForm(EMPTY_ENDPOINT_FORM);
                setEndpointPanelOpen(true);
                setSaveError(null);
              }}
              onDelete={deleteEndpoint}
              onRetry={() => void loadData()}
              deleteNoun="endpoint"
              mobileTitle={(row) => row.display_name}
              mobileDetails={(row) => (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono">{row.vendor}</span>
                  <span>{row.internal_name}</span>
                  <span>Priority {row.priority}</span>
                  <span>{row.is_active ? "Active" : "Inactive"}</span>
                </div>
              )}
            />
          </div>
          {endpointPanelOpen && (
            <div className="w-1/2 border-l-2 border-l-primary/20 shrink-0 flex flex-col overflow-hidden">
              <DetailPanel
                title={
                  endpointIsNew
                    ? "New Endpoint"
                    : selectedEndpoint?.display_name || "Endpoint"
                }
                isSystem={!endpointIsNew && !!selectedEndpoint?.is_system}
                saving={saving}
                saveError={saveError}
                canSave={endpointCanSave}
                onClose={() => setEndpointPanelOpen(false)}
                onSave={saveEndpoint}
              >
                <EndpointFormFields
                  data={endpointForm}
                  onChange={setEndpointForm}
                />
              </DetailPanel>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="apis" className="flex-1 m-0 overflow-hidden min-h-0">
        <div className="flex h-full min-h-0">
          <div
            className={`${apiPanelOpen ? "w-1/2" : "w-full"} min-w-0 flex flex-col overflow-hidden transition-all duration-200`}
          >
            <EndpointApiTable
              title="AI APIs (wire contracts)"
              rows={apis}
              columns={apiColumns}
              loading={loading}
              loadError={loadError}
              actionError={actionError}
              selectedId={selectedApi?.id ?? null}
              onSelect={(row) => {
                setSelectedApi(row);
                setApiIsNew(false);
                setApiForm(apiToForm(row));
                setApiPanelOpen(true);
                setSaveError(null);
              }}
              onCreate={() => {
                setSelectedApi(null);
                setApiIsNew(true);
                setApiForm(EMPTY_API_FORM);
                setApiPanelOpen(true);
                setSaveError(null);
              }}
              onDelete={deleteApi}
              onRetry={() => void loadData()}
              deleteNoun="API"
              mobileTitle={(row) => row.display_name}
              mobileDetails={(row) => (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono">{row.name}</span>
                  <span>{row.translator_key}</span>
                  <span>{row.transport}</span>
                </div>
              )}
            />
          </div>
          {apiPanelOpen && (
            <div className="w-1/2 border-l-2 border-l-primary/20 shrink-0 flex flex-col overflow-hidden">
              <DetailPanel
                title={
                  apiIsNew ? "New API" : selectedApi?.display_name || "API"
                }
                isSystem={!apiIsNew && !!selectedApi?.is_system}
                saving={saving}
                saveError={saveError}
                canSave={apiCanSave}
                onClose={() => setApiPanelOpen(false)}
                onSave={saveApi}
              >
                <ApiFormFields data={apiForm} onChange={setApiForm} />
              </DetailPanel>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
