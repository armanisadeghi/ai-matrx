"use client";

// Admin surface for the 2026-07-10 ai-schema reshape: the old single service
// catalog is GONE, replaced by ai.endpoint (one row per serving vendor) +
// ai.api (one row per wire contract). Simple two-list rendering — a tab per
// entity, each with a table and an edit panel. ADMIN-ONLY: vendors and wire
// formats must never leak to user-facing surfaces.

import React, { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  AlertTriangle,
  Lock,
  Plug,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { extractErrorMessage } from "@/utils/errors";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { useAppDispatch } from "@/lib/redux/hooks";
import { reloadAiCatalog } from "../../catalogReload";
import { aiModelService } from "../../service";
import type { AiApi, AiEndpoint } from "../../types";

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
        <Textarea
          value={data.notes}
          onChange={set("notes")}
          className="text-sm min-h-[72px] resize-none"
        />
      </FormField>
      <FormField label="Visibility">
        <VisibilitySelect
          value={data.visibility}
          onChange={(v) =>
            onChange({ ...data, visibility: v as EndpointFormData["visibility"] })
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
      <FormField label="Request Defaults" description="Default request body overrides">
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
        <Textarea
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

// ─── Generic list + panel scaffolding ────────────────────────────────────────

type Column<T> = {
  label: string;
  render: (row: T) => React.ReactNode;
};

function SimpleTable<T extends { id: string; is_system: boolean }>({
  title,
  rows,
  columns,
  loading,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  deleteNoun,
}: {
  title: string;
  rows: T[];
  columns: Column<T>[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (row: T) => void;
  onCreate: () => void;
  onDelete: (row: T) => void;
  deleteNoun: string;
}) {
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between shrink-0 px-3 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Badge variant="outline" className="text-xs">
            {rows.length}
          </Badge>
        </div>
        <Button size="sm" className="h-7 px-2 text-xs gap-1.5" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full caption-bottom text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr className="h-8">
              {columns.map((c) => (
                <th
                  key={c.label}
                  className="px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground"
                >
                  {c.label}
                </th>
              ))}
              <th className="w-[60px] px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="h-9 border-b border-border">
                  {Array.from({ length: columns.length + 1 }).map((__, j) => (
                    <td key={j} className="px-2 py-1.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="h-32 text-center p-2">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Plug className="h-10 w-10 opacity-30" />
                    <p className="text-sm">Nothing here yet</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`group h-9 border-b border-border cursor-pointer transition-colors ${
                    selectedId === row.id
                      ? "bg-primary/10 hover:bg-primary/15"
                      : idx % 2 === 0
                        ? "hover:bg-muted/50"
                        : "bg-muted/20 hover:bg-muted/50"
                  }`}
                  onClick={() => onSelect(row)}
                >
                  {columns.map((c) => (
                    <td key={c.label} className="py-1 px-2 align-middle">
                      {c.render(row)}
                    </td>
                  ))}
                  <td className="py-1 px-2 align-middle text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:pointer-events-none"
                      title={
                        row.is_system
                          ? "System rows cannot be deleted"
                          : "Delete"
                      }
                      disabled={row.is_system}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(row);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleteNoun}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any offerings referencing this {deleteNoun} will lose their
              reference. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    try {
      const [fetchedEndpoints, fetchedApis] = await Promise.all([
        aiModelService.fetchEndpoints(),
        aiModelService.fetchApis(),
      ]);
      setEndpoints(fetchedEndpoints);
      setApis(fetchedApis);
    } catch (err) {
      console.error(
        "Failed to load endpoints/apis",
        extractErrorMessage(err),
      );
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
    try {
      await aiModelService.deleteEndpoint(row.id);
      setEndpoints((prev) => prev.filter((e) => e.id !== row.id));
      if (selectedEndpoint?.id === row.id) setEndpointPanelOpen(false);
    } catch (err) {
      console.error("Failed to delete endpoint", extractErrorMessage(err));
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
    try {
      await aiModelService.deleteApi(row.id);
      setApis((prev) => prev.filter((a) => a.id !== row.id));
      if (selectedApi?.id === row.id) setApiPanelOpen(false);
    } catch (err) {
      console.error("Failed to delete api", extractErrorMessage(err));
    }
  };

  // ── Columns ──

  const endpointColumns: Column<AiEndpoint>[] = [
    {
      label: "Display Name",
      render: (e) => <span className="font-medium">{e.display_name}</span>,
    },
    {
      label: "Vendor",
      render: (e) => (
        <Badge variant="outline" className="text-xs font-mono">
          {e.vendor}
        </Badge>
      ),
    },
    {
      label: "Internal Name",
      render: (e) => (
        <span className="font-mono text-muted-foreground">
          {e.internal_name}
        </span>
      ),
    },
    {
      label: "Base URL",
      render: (e) =>
        e.base_url ? (
          <span className="font-mono text-muted-foreground truncate block max-w-[220px]">
            {e.base_url}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      label: "Priority",
      render: (e) => <span className="tabular-nums">{e.priority}</span>,
    },
    {
      label: "Active",
      render: (e) =>
        e.is_active ? (
          <Badge
            variant="outline"
            className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
          >
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
            Inactive
          </Badge>
        ),
    },
  ];

  const apiColumns: Column<AiApi>[] = [
    {
      label: "Display Name",
      render: (a) => <span className="font-medium">{a.display_name}</span>,
    },
    {
      label: "Name",
      render: (a) => (
        <span className="font-mono text-muted-foreground">{a.name}</span>
      ),
    },
    {
      label: "Translator Key",
      render: (a) => (
        <Badge variant="outline" className="text-xs font-mono">
          {a.translator_key}
        </Badge>
      ),
    },
    {
      label: "Transport",
      render: (a) => (
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

      <TabsContent value="endpoints" className="flex-1 m-0 overflow-hidden min-h-0">
        <div className="flex h-full min-h-0">
          <div
            className={`${endpointPanelOpen ? "w-1/2" : "w-full"} min-w-0 flex flex-col overflow-hidden transition-all duration-200`}
          >
            <SimpleTable
              title="AI Endpoints (serving vendors)"
              rows={endpoints}
              columns={endpointColumns}
              loading={loading}
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
              deleteNoun="endpoint"
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
            <SimpleTable
              title="AI APIs (wire contracts)"
              rows={apis}
              columns={apiColumns}
              loading={loading}
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
              deleteNoun="API"
            />
          </div>
          {apiPanelOpen && (
            <div className="w-1/2 border-l-2 border-l-primary/20 shrink-0 flex flex-col overflow-hidden">
              <DetailPanel
                title={apiIsNew ? "New API" : selectedApi?.display_name || "API"}
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
