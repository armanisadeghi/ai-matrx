"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Layers,
  Plus,
  Search,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Trash2,
  RefreshCw,
  CheckSquare,
  Square,
  Edit2,
  Check,
  Sparkles,
  ChevronRight,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  listSurfacesWithStats,
  listClientNames,
  createSurface,
  updateSurface,
  bulkSetSurfacesActive,
  bulkDeleteSurfaces,
  createUiClient,
  deleteSurface,
  tierFor,
  SURFACE_TIERS,
  type SurfaceWithStats,
} from "@/features/surfaces/services/surfaces.service";
import { SurfaceDetailDrawer } from "@/features/surfaces/components/SurfaceDetailDrawer";
import { SurfaceCandidatesDialog } from "@/features/surfaces/components/SurfaceCandidatesDialog";
import { SURFACE_CANDIDATES } from "@/features/surfaces/data/surface-candidates";

type StatusFilter = "active" | "inactive" | "all";
type ClientFilterValue = string; // a client name OR "__all__"

const ALL = "__all__";

export function SurfacesAdminPage() {
  const [surfaces, setSurfaces] = useState<SurfaceWithStats[]>([]);
  const [clients, setClients] = useState<{ name: string; description: string | null; is_active: boolean | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientFilterValue>(ALL);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [openDrawerSurface, setOpenDrawerSurface] = useState<SurfaceWithStats | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([listSurfacesWithStats(), listClientNames()]);
      setSurfaces(s);
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

  // Keyboard: "/" focuses search, Escape clears selection or closes overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inEditable =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable);
      if (e.key === "/" && !inEditable) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape" && !inEditable) {
        if (openDrawerSurface) setOpenDrawerSurface(null);
        else if (candidatesOpen) setCandidatesOpen(false);
        else if (newClientOpen) setNewClientOpen(false);
        else if (selected.size > 0) setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDrawerSurface, candidatesOpen, newClientOpen, selected.size]);

  // If the open drawer's surface gets reloaded, refresh its row reference so
  // counts/description in the header stay in sync.
  const drawerSurface =
    openDrawerSurface && surfaces.find((s) => s.name === openDrawerSurface.name)
      ? (surfaces.find((s) => s.name === openDrawerSurface.name) as SurfaceWithStats)
      : openDrawerSurface;

  // Apply client + status + search filters
  const visible = surfaces.filter((s) => {
    if (client !== ALL && s.client_name !== client) return false;
    if (status === "active" && !s.is_active) return false;
    if (status === "inactive" && s.is_active) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.description ?? "").toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Group visible by tier
  const grouped = SURFACE_TIERS.map((tier) => ({
    tier,
    rows: visible.filter((s) => {
      const t = tierFor(s.sort_order);
      return t.label === tier.label;
    }),
  })).filter((g) => g.rows.length > 0);

  const visibleNames = visible.map((s) => s.name);
  const allVisibleSelected = visibleNames.length > 0 && visibleNames.every((n) => selected.has(n));
  const someVisibleSelected = visibleNames.some((n) => selected.has(n));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const next = new Set(selected);
      visibleNames.forEach((n) => next.delete(n));
      setSelected(next);
    } else {
      const next = new Set(selected);
      visibleNames.forEach((n) => next.add(n));
      setSelected(next);
    }
  };

  const toggleSelect = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const onBulkSetActive = async (active: boolean) => {
    const targets = Array.from(selected);
    if (targets.length === 0) return;
    try {
      await bulkSetSurfacesActive(targets, active);
      await load();
      setSelected(new Set());
      toast.success(`${targets.length} surface${targets.length === 1 ? "" : "s"} ${active ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    }
  };

  const onBulkDelete = async () => {
    const targets = Array.from(selected);
    if (targets.length === 0) return;
    const targetRows = surfaces.filter((s) => selected.has(s.name));
    const totalTools = targetRows.reduce((sum, r) => sum + r.toolCount, 0);
    const totalAgents = targetRows.reduce((sum, r) => sum + r.agentCount, 0);
    const ok = await confirm({
      title: `Delete ${targets.length} surface${targets.length === 1 ? "" : "s"}?`,
      description:
        totalTools + totalAgents > 0
          ? `Across the selected rows, ${totalTools} tool reference${totalTools === 1 ? "" : "s"} and ${totalAgents} agent reference${totalAgents === 1 ? "" : "s"} exist. The DELETE will FAIL for any surface that's referenced (FKs do NOT cascade on delete). Use Deactivate instead unless you've already cleaned up those references.`
          : "No tool or agent references — safe to delete.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await bulkDeleteSurfaces(targets);
      await load();
      setSelected(new Set());
      toast.success(`${targets.length} surface${targets.length === 1 ? "" : "s"} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed");
    }
  };

  const candidatesAvailable = SURFACE_CANDIDATES.filter(
    (c) => !surfaces.some((s) => s.name === c.name),
  ).length;

  // Aggregate counts shown in the header chips
  const totalActive = surfaces.filter((s) => s.is_active).length;
  const totalUnused = surfaces.filter((s) => s.toolCount === 0 && s.agentCount === 0).length;

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center gap-3 bg-background flex-wrap">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Tool Registry · UI Surfaces</h1>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">{surfaces.length} total</Badge>
          <Badge variant="outline" className="text-[10px]">{totalActive} active</Badge>
          {totalUnused > 0 && (
            <Badge variant="secondary" className="text-[10px]" title="Surfaces with no tools or agents pointing at them">
              {totalUnused} unused
            </Badge>
          )}
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          className="h-7 ml-auto gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setNewClientOpen(true)}
          className="h-7 gap-1.5 text-xs"
          title="Create a new ui_client"
        >
          <UserPlus className="h-3.5 w-3.5" />
          New client
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCandidatesOpen(true)}
          disabled={candidatesAvailable === 0}
          className="h-7 gap-1.5 text-xs"
          title="Add surfaces from the curated candidate inventory"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Candidates
          {candidatesAvailable > 0 && (
            <Badge variant="default" className="ml-1 text-[10px] px-1 h-4">
              {candidatesAvailable}
            </Badge>
          )}
        </Button>
        <Button size="sm" onClick={() => setCreating(true)} className="h-7 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New surface
        </Button>
      </div>

      {/* Client tabs */}
      <div className="flex-shrink-0 px-6 pt-2 border-b border-border bg-background">
        <Tabs value={client} onValueChange={(v) => setClient(v)}>
          <TabsList className="h-9">
            <TabsTrigger value={ALL} className="text-xs">
              All clients
              <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                {surfaces.length}
              </span>
            </TabsTrigger>
            {clients.map((c) => {
              const cnt = surfaces.filter((s) => s.client_name === c.name).length;
              return (
                <TabsTrigger key={c.name} value={c.name} className="text-xs">
                  <span className="font-mono">{c.name}</span>
                  <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{cnt}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Filter bar */}
      <div className="flex-shrink-0 px-6 py-2 border-b border-border bg-background flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or description…  ( /  to focus)"
            className="pl-7 h-8 text-xs"
            style={{ fontSize: "16px" }}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto rounded-md border border-border bg-muted/30 px-2 py-1">
            <span className="text-[11px] text-muted-foreground">
              {selected.size} selected
            </span>
            <Button size="sm" variant="ghost" onClick={() => void onBulkSetActive(true)} className="h-6 text-xs gap-1">
              <ToggleRight className="h-3.5 w-3.5" /> Activate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void onBulkSetActive(false)} className="h-6 text-xs gap-1">
              <ToggleLeft className="h-3.5 w-3.5" /> Deactivate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void onBulkDelete()}
              className="h-6 text-xs gap-1 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-6 text-xs">
              Clear
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-6 mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {!loading && grouped.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No surfaces match these filters.
          </div>
        )}
        {grouped.map(({ tier, rows }) => {
          const tierAllSelected = rows.every((r) => selected.has(r.name));
          const tierSomeSelected = rows.some((r) => selected.has(r.name));
          const onTierToggle = () => {
            const next = new Set(selected);
            if (tierAllSelected) {
              rows.forEach((r) => next.delete(r.name));
            } else {
              rows.forEach((r) => next.add(r.name));
            }
            setSelected(next);
          };
          return (
            <section key={tier.label} className="space-y-2">
              <div className="flex items-center gap-2 border-b border-border pb-1">
                <button
                  onClick={onTierToggle}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Toggle tier ${tier.label}`}
                >
                  {tierAllSelected ? (
                    <CheckSquare className="h-3.5 w-3.5" />
                  ) : tierSomeSelected ? (
                    <CheckSquare className="h-3.5 w-3.5 opacity-50" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                </button>
                <h2 className="text-sm font-medium">{tier.label}</h2>
                <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
                <span className="text-[11px] text-muted-foreground">{tier.description}</span>
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums font-mono">
                  sort {tier.min}{tier.max === Number.MAX_SAFE_INTEGER ? "+" : `–${tier.max}`}
                </span>
              </div>
              <div className="rounded-md border border-border bg-card divide-y divide-border">
                {rows.map((row) => (
                  <SurfaceRow
                    key={row.name}
                    row={row}
                    selected={selected.has(row.name)}
                    onToggleSelect={() => toggleSelect(row.name)}
                    onChanged={() => void load()}
                    onOpenDetail={() => setOpenDrawerSurface(row)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {creating && (
        <NewSurfaceDialog
          clients={clients.filter((c) => c.is_active !== false)}
          existingNames={new Set(surfaces.map((s) => s.name))}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {candidatesOpen && (
        <SurfaceCandidatesDialog
          existingNames={new Set(surfaces.map((s) => s.name))}
          onClose={() => setCandidatesOpen(false)}
          onAdded={() => {
            setCandidatesOpen(false);
            void load();
          }}
        />
      )}
      {newClientOpen && (
        <NewClientDialog
          existingNames={new Set(clients.map((c) => c.name))}
          onClose={() => setNewClientOpen(false)}
          onCreated={() => {
            setNewClientOpen(false);
            void load();
          }}
        />
      )}
      {drawerSurface && (
        <SurfaceDetailDrawer
          surface={drawerSurface}
          onClose={() => setOpenDrawerSurface(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function SurfaceRow({
  row,
  selected,
  onToggleSelect,
  onChanged,
  onOpenDetail,
}: {
  row: SurfaceWithStats;
  selected: boolean;
  onToggleSelect: () => void;
  onChanged: () => void;
  onOpenDetail: () => void;
}) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(row.description ?? "");
  const [busy, setBusy] = useState(false);

  const onSaveDesc = async () => {
    setBusy(true);
    try {
      await updateSurface(row.name, { description: desc || null });
      setEditingDesc(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onToggleActive = async (next: boolean) => {
    setBusy(true);
    try {
      await updateSurface(row.name, { is_active: next });
      onChanged();
      toast.success(`${row.name} ${next ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (row.toolCount > 0 || row.agentCount > 0) {
      const ok = await confirm({
        title: `Delete ${row.name}?`,
        description: `This surface has ${row.toolCount} tool reference${row.toolCount === 1 ? "" : "s"} and ${row.agentCount} agent reference${row.agentCount === 1 ? "" : "s"}. Deleting will cascade-remove those rows. This is usually a mistake — deactivate instead.`,
        confirmLabel: "Delete anyway",
        variant: "destructive",
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: `Delete ${row.name}?`,
        description: "No tools or agents point at this surface. The row can be recreated later if needed.",
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await deleteSurface(row.name);
      onChanged();
      toast.success(`${row.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`px-3 py-2 grid grid-cols-[24px_1fr_140px_140px_120px_28px_28px] items-start gap-3 ${row.is_active ? "" : "opacity-50"}`}>
      <button
        onClick={onToggleSelect}
        className="mt-1 text-muted-foreground hover:text-foreground"
        aria-label={`Select ${row.name}`}
      >
        {selected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenDetail}
            className="font-mono text-xs text-foreground hover:text-primary hover:underline text-left"
            title="Open details"
          >
            {row.name}
          </button>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            sort {row.sort_order}
          </span>
        </div>
        {!editingDesc ? (
          <button
            onClick={() => {
              setDesc(row.description ?? "");
              setEditingDesc(true);
            }}
            className="group flex items-center gap-1.5 text-left max-w-full"
          >
            <span className="text-[11px] text-muted-foreground line-clamp-2">
              {row.description ?? <em>no description</em>}
            </span>
            <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
          </button>
        ) : (
          <div className="flex items-start gap-1.5">
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              autoFocus
              className="text-xs"
              style={{ fontSize: "13px" }}
              disabled={busy}
            />
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                onClick={() => void onSaveDesc()}
                disabled={busy}
                className="h-6 w-6 p-0"
                aria-label="Save description"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingDesc(false)}
                disabled={busy}
                className="h-6 w-6 p-0"
                aria-label="Cancel edit"
              >
                ×
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Badge
          variant={row.toolCount > 0 ? "default" : "outline"}
          className="text-[10px] tabular-nums"
          title={`${row.toolCount} tool${row.toolCount === 1 ? "" : "s"} reference this surface`}
        >
          {row.toolCount} tool{row.toolCount === 1 ? "" : "s"}
        </Badge>
      </div>
      <div className="flex items-center gap-1.5">
        <Badge
          variant={row.agentCount > 0 ? "default" : "outline"}
          className="text-[10px] tabular-nums"
          title={`${row.agentCount} agent${row.agentCount === 1 ? "" : "s"} visible on this surface`}
        >
          {row.agentCount} agent{row.agentCount === 1 ? "" : "s"}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={row.is_active ?? true}
          onCheckedChange={(v) => void onToggleActive(v)}
          disabled={busy}
          aria-label={row.is_active ? "Deactivate" : "Activate"}
        />
        <span className="text-[11px] text-muted-foreground">
          {row.is_active ? "active" : "inactive"}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void onDelete()}
        disabled={busy}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        aria-label="Delete surface"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenDetail}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        aria-label="Open surface detail drawer"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function NewClientDialog({
  existingNames,
  onClose,
  onCreated,
}: {
  existingNames: Set<string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(100);
  const [busy, setBusy] = useState(false);

  const NAME_RE = /^[a-z][a-z0-9-]*$/;
  const nameValid = NAME_RE.test(name);
  const nameClash = existingNames.has(name);

  const submit = async () => {
    if (!nameValid || nameClash) return;
    setBusy(true);
    try {
      await createUiClient({ name, description: description || null, sortOrder });
      toast.success(`Client ${name} created`);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New UI client</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name (PK)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="e.g. matrx-mobile"
              className="font-mono text-sm"
              style={{ fontSize: "16px" }}
              disabled={busy}
              autoFocus
            />
            {!nameValid && name.length > 0 && (
              <p className="text-[11px] text-destructive">
                Lowercase letters, digits, hyphens. Must start with a letter.
              </p>
            )}
            {nameClash && (
              <p className="text-[11px] text-destructive">
                Client <code className="font-mono">{name}</code> already exists.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description shown to admins"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sort order (in client tabs)</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !nameValid || nameClash}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSurfaceDialog({
  clients,
  existingNames,
  onClose,
  onCreated,
}: {
  clients: { name: string; description: string | null; is_active: boolean | null }[];
  existingNames: Set<string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [client, setClient] = useState(clients[0]?.name ?? "");
  const [local, setLocal] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState<string>("Pages");
  const [busy, setBusy] = useState(false);

  const tierEntry = SURFACE_TIERS.find((t) => t.label === tier) ?? SURFACE_TIERS[1];
  const fullName = client && local ? `${client}/${local}` : "";
  const LOCAL_RE = /^[a-z0-9-/]+$/;
  const localValid = LOCAL_RE.test(local);
  const nameClash = fullName !== "" && existingNames.has(fullName);

  const submit = async () => {
    if (!client || !localValid || nameClash) return;
    setBusy(true);
    try {
      await createSurface({
        name: fullName,
        client_name: client,
        description: description || null,
        sort_order: tierEntry.min + 50,
        is_active: true,
      });
      toast.success(`${fullName} created`);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New UI surface</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Client</Label>
            <Select value={client} onValueChange={setClient} disabled={busy}>
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
            <Label className="text-xs">Local part of name</Label>
            <Input
              value={local}
              onChange={(e) => setLocal(e.target.value.toLowerCase())}
              placeholder="e.g. notes  or  debug/state-analyzer"
              className="font-mono text-sm"
              style={{ fontSize: "16px" }}
              disabled={busy}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Full name:{" "}
              <code className="bg-muted px-1 py-0.5 rounded font-mono">
                {fullName || `${client || "<client>"}/<local>`}
              </code>
            </p>
            {!localValid && local.length > 0 && (
              <p className="text-[11px] text-destructive">
                Use lowercase letters, digits, hyphens, and slashes.
              </p>
            )}
            {nameClash && (
              <p className="text-[11px] text-destructive">
                <code className="font-mono">{fullName}</code> already exists.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tier (sort_order band)</Label>
            <Select value={tier} onValueChange={setTier} disabled={busy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SURFACE_TIERS.filter((t) => t.label !== "Reserved").map((t) => (
                  <SelectItem key={t.label} value={t.label}>
                    <div className="flex flex-col items-start">
                      <span>{t.label}</span>
                      <span className="text-[10px] text-muted-foreground">{t.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short, agent-facing description"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || !client || !localValid || nameClash || !local}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
