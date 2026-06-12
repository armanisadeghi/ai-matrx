"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, AlertCircle, Database as DbIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import {
  listUiClients,
  listUiSurfaces,
  listToolExecutors,
  upsertUiClient,
  upsertUiSurface,
  upsertToolExecutor,
  setUiClientActive,
  setUiSurfaceActive,
  setToolExecutorActive,
  dependentSurfaceCount,
  type UiClientRow,
  type UiSurfaceRow,
  type ToolExecutorRow,
} from "@/features/tool-registry/lookups/services/lookups.service";

type TabKey = "clients" | "surfaces" | "executors";

export function LookupsAdminPage() {
  const [tab, setTab] = useState<TabKey>("clients");
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 bg-background">
        <DbIcon className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Tool Registry · Lookups</h1>
        <span className="text-xs text-muted-foreground">
          ui_client · ui_surface · tool_executor
        </span>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        className="flex-1 flex flex-col"
      >
        <div className="flex-shrink-0 px-6 pt-2 border-b border-border bg-background">
          <TabsList className="h-9">
            <TabsTrigger value="clients" className="text-xs">
              UI Clients
            </TabsTrigger>
            <TabsTrigger value="surfaces" className="text-xs">
              UI Surfaces
            </TabsTrigger>
            <TabsTrigger value="executors" className="text-xs">
              Tool Executors
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 p-6">
          <TabsContent value="clients" className="m-0">
            <UiClientCrud />
          </TabsContent>
          <TabsContent value="surfaces" className="m-0">
            <UiSurfaceCrud />
          </TabsContent>
          <TabsContent value="executors" className="m-0">
            <ToolExecutorCrud />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

function ToolbarCard({
  title,
  count,
  loading,
  error,
  onCreate,
  children,
}: {
  title: string;
  count: number;
  loading: boolean;
  error: string | null;
  onCreate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium">{title}</h2>
          <Badge variant="outline" className="text-[10px]">
            {count}
          </Badge>
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        {onCreate && (
          <Button size="sm" onClick={onCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function ActiveToggle({
  active,
  onToggle,
  busy,
}: {
  active: boolean;
  onToggle: (next: boolean) => void;
  busy?: boolean;
}) {
  return (
    <Switch
      checked={active}
      onCheckedChange={onToggle}
      disabled={busy}
      aria-label={active ? "Deactivate row" : "Activate row"}
    />
  );
}

// ─── UI Clients ──────────────────────────────────────────────────────────────

function UiClientCrud() {
  const [rows, setRows] = useState<UiClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UiClientRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listUiClients());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onToggleActive = async (row: UiClientRow, next: boolean) => {
    if (!next) {
      const dep = await dependentSurfaceCount(row.name);
      const ok = await confirm({
        title: `Deactivate ${row.name}?`,
        description:
          dep > 0
            ? `${dep} surface${dep === 1 ? "" : "s"} are linked to this client. They will remain in the table but become hidden from active pickers. You can reactivate at any time.`
            : `No surfaces are currently linked. You can reactivate at any time.`,
        confirmLabel: "Deactivate",
        variant: "destructive",
      });
      if (!ok) return;
    }
    try {
      await setUiClientActive(row.name, next);
      await load();
      toast.success(`${row.name} ${next ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <>
      <ToolbarCard
        title="UI Clients"
        count={rows.length}
        loading={loading}
        error={error}
        onCreate={() => setCreating(true)}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Name (PK)</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[80px] text-right">Sort</TableHead>
              <TableHead className="w-[100px]">Active</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-xs">
                  No clients yet — click "New" to add one.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.name} className={row.is_active ? "" : "opacity-50"}>
                <TableCell className="font-mono text-xs">{row.name}</TableCell>
                <TableCell className="text-xs">{row.description ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.sort_order}</TableCell>
                <TableCell>
                  <ActiveToggle
                    active={row.is_active ?? true}
                    onToggle={(next) => void onToggleActive(row, next)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(row)}
                    className="text-xs h-7"
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ToolbarCard>
      {(editing || creating) && (
        <UiClientDialog
          row={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function UiClientDialog({
  row,
  onClose,
  onSaved,
}: {
  row: UiClientRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [sortOrder, setSortOrder] = useState<number>(row?.sort_order ?? 100);
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  const NAME_RE = /^[a-z][a-z0-9-]*$/;
  const nameValid = NAME_RE.test(name);

  const submit = async () => {
    if (!nameValid) {
      toast.error("Name must be lowercase letters, digits, and hyphens (start with a letter).");
      return;
    }
    setBusy(true);
    try {
      await upsertUiClient({
        name,
        description: description || null,
        sort_order: sortOrder,
        is_active: isActive,
      });
      toast.success(`${name} saved`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${row.name}` : "New UI Client"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name (PK)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="e.g., matrx-mobile"
              disabled={isEdit}
              className="font-mono text-sm"
              style={{ fontSize: "16px" }}
            />
            {!isEdit && !nameValid && name.length > 0 && (
              <p className="text-[11px] text-destructive">
                Lowercase letters, digits, hyphens. Must start with a letter.
              </p>
            )}
            {isEdit && (
              <p className="text-[11px] text-muted-foreground">
                Name is the primary key — to rename, deactivate this row and create a new one.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short, human-readable label"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sort order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Active</Label>
              <div className="flex items-center h-10">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !nameValid}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── UI Surfaces ─────────────────────────────────────────────────────────────

function UiSurfaceCrud() {
  const [rows, setRows] = useState<UiSurfaceRow[]>([]);
  const [clients, setClients] = useState<UiClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState<string>("__all__");
  const [editing, setEditing] = useState<UiSurfaceRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([listUiSurfaces(), listUiClients()]);
      setRows(s);
      setClients(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load surfaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible =
    filterClient === "__all__" ? rows : rows.filter((r) => r.client_name === filterClient);

  const onToggleActive = async (row: UiSurfaceRow, next: boolean) => {
    try {
      await setUiSurfaceActive(row.name, next);
      await load();
      toast.success(`${row.name} ${next ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-center gap-2">
          <span className="text-foreground">
            For most surface work, use the dedicated{" "}
            <a
              href="/administration/surfaces"
              className="font-medium text-primary hover:underline"
            >
              /administration/surfaces
            </a>{" "}
            page — it groups by client &amp; tier, shows tool/agent usage counts,
            supports bulk activate/deactivate, and is built for the 100+ surface
            scale our system needs.
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium">UI Surfaces</h2>
            <Badge variant="outline" className="text-[10px]">{visible.length}</Badge>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Filter by client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Name (PK)</TableHead>
                <TableHead className="w-[160px]">Client</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[80px] text-right">Sort</TableHead>
                <TableHead className="w-[100px]">Active</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-xs">
                    No surfaces match this filter.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((row) => (
                <TableRow key={row.name} className={row.is_active ? "" : "opacity-50"}>
                  <TableCell className="font-mono text-xs">{row.name}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="secondary" className="text-[10px] font-mono">{row.client_name}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.description ?? <span className="text-muted-foreground italic">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{row.sort_order}</TableCell>
                  <TableCell>
                    <ActiveToggle
                      active={row.is_active ?? true}
                      onToggle={(next) => void onToggleActive(row, next)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(row)} className="text-xs h-7">
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {(editing || creating) && (
        <UiSurfaceDialog
          row={editing}
          clients={clients.filter((c) => c.is_active)}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function UiSurfaceDialog({
  row,
  clients,
  onClose,
  onSaved,
}: {
  row: UiSurfaceRow | null;
  clients: UiClientRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [clientName, setClientName] = useState(row?.client_name ?? clients[0]?.name ?? "");
  const [localPart, setLocalPart] = useState(
    row ? row.name.replace(`${row.client_name}/`, "") : "",
  );
  const [description, setDescription] = useState(row?.description ?? "");
  const [sortOrder, setSortOrder] = useState<number>(row?.sort_order ?? 1000);
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  const fullName = `${clientName}/${localPart}`;
  const LOCAL_RE = /^[a-z0-9-]+$/;
  const localValid = LOCAL_RE.test(localPart);

  const submit = async () => {
    if (!clientName || !localValid) {
      toast.error("Client and local name (lowercase, digits, hyphens) are required.");
      return;
    }
    setBusy(true);
    try {
      await upsertUiSurface({
        name: fullName,
        client_name: clientName,
        description: description || null,
        sort_order: sortOrder,
        is_active: isActive,
      });
      toast.success(`${fullName} saved`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${row.name}` : "New UI Surface"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Client</Label>
            <Select value={clientName} onValueChange={setClientName} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Local name</Label>
            <Input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value.toLowerCase())}
              placeholder="e.g., notes"
              disabled={isEdit}
              className="font-mono text-sm"
              style={{ fontSize: "16px" }}
            />
            <p className="text-[11px] text-muted-foreground">
              Full name will be{" "}
              <code className="font-mono bg-muted px-1 py-0.5 rounded">
                {clientName ? `${clientName}/${localPart || "<local>"}` : "<client>/<local>"}
              </code>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sort order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Active</Label>
              <div className="flex items-center h-10">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !clientName || !localValid}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tool Executors ──────────────────────────────────────────────────────────
//
// Post-2026 refactor: "executor kind" no longer exists. `tool_executor` rows
// are first-class capability providers. Dropped from the old schema:
// `is_client_side`, `client_name`, `payload_schema`, `payload_validator_path`.
// Added: `parent_executor_name` (FK to self), `mcp_server_id` (FK to
// tool_mcp_server).

function ToolExecutorCrud() {
  const [rows, setRows] = useState<ToolExecutorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ToolExecutorRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listToolExecutors());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tool executors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onToggleActive = async (row: ToolExecutorRow, next: boolean) => {
    try {
      await setToolExecutorActive(row.name, next);
      await load();
      toast.success(`${row.name} ${next ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <>
      <ToolbarCard
        title="Tool Executors"
        count={rows.length}
        loading={loading}
        error={error}
        onCreate={() => setCreating(true)}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Name (PK)</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[180px]">Parent</TableHead>
              <TableHead className="w-[120px]">MCP server</TableHead>
              <TableHead className="w-[100px]">Active</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-xs">
                  No tool executors.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.name} className={row.is_active ? "" : "opacity-50"}>
                <TableCell className="font-mono text-xs">{row.name}</TableCell>
                <TableCell className="text-xs">
                  {row.description ?? <span className="text-muted-foreground italic">—</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.parent_executor_name ?? "—"}
                </TableCell>
                <TableCell>
                  {row.mcp_server_id ? (
                    <Badge variant="outline" className="text-[10px] gap-0.5">
                      MCP
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <ActiveToggle
                    active={row.is_active}
                    onToggle={(next) => void onToggleActive(row, next)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(row)} className="text-xs h-7">
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ToolbarCard>
      {(editing || creating) && (
        <ToolExecutorDialog
          row={editing}
          allRows={rows}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function ToolExecutorDialog({
  row,
  allRows,
  onClose,
  onSaved,
}: {
  row: ToolExecutorRow | null;
  allRows: ToolExecutorRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [parentExecutorName, setParentExecutorName] = useState<string>(
    row?.parent_executor_name ?? "__none__",
  );
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [configJson, setConfigJson] = useState(
    JSON.stringify(row?.config ?? {}, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const NAME_RE = /^[a-z][a-z0-9._-]*$/;
  const nameValid = NAME_RE.test(name);

  const parentChoices = allRows.filter((r) => r.name !== name);

  const submit = async () => {
    if (!nameValid) {
      toast.error("Name must be lowercase letters/digits/`._-`, starting with a letter.");
      return;
    }
    let configParsed: unknown;
    try {
      configParsed = JSON.parse(configJson || "{}");
      setJsonErr(null);
    } catch (e) {
      setJsonErr(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }
    setBusy(true);
    try {
      await upsertToolExecutor({
        name,
        description: description ?? "",
        is_active: isActive,
        config: configParsed as never,
        parent_executor_name:
          parentExecutorName === "__none__" ? null : parentExecutorName,
        // mcp_server_id stays whatever it was — only the MCP provisioning RPC
        // should set/clear it. Leaving it unset preserves existing FK.
        mcp_server_id: row?.mcp_server_id ?? null,
      });
      toast.success(`${name} saved`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${row.name}` : "New Tool Executor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70dvh] overflow-y-auto">
          <div className="space-y-1.5">
            <Label className="text-xs">Name (PK)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="e.g., mcp.my-server"
              disabled={isEdit}
              className="font-mono text-sm"
              style={{ fontSize: "16px" }}
            />
            <p className="text-[11px] text-muted-foreground">
              Convention: <code className="font-mono">mcp.&lt;slug&gt;</code> for
              MCP-backed executors;{" "}
              <code className="font-mono">aidream</code>,{" "}
              <code className="font-mono">matrx-ai-core</code>,{" "}
              <code className="font-mono">matrx-local</code>,{" "}
              <code className="font-mono">chrome-extension</code>,{" "}
              <code className="font-mono">matrx-user</code> for first-party.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Parent executor</Label>
              <Select
                value={parentExecutorName}
                onValueChange={setParentExecutorName}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {parentChoices.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Active</Label>
              <div className="flex items-center h-10">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Config (JSON)</Label>
            <Textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              style={{ fontSize: "13px" }}
            />
          </div>
          {row?.mcp_server_id && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
              This executor is linked to MCP server{" "}
              <code className="font-mono">{row.mcp_server_id}</code>. The link is
              managed by the MCP provisioning flow — edit the server, not this
              row.
            </div>
          )}
          {jsonErr && (
            <p className="text-[11px] text-destructive">{jsonErr}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !nameValid}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
