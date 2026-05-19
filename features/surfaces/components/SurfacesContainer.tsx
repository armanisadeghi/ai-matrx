"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Zap,
  UserPlus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import {
  SurfacesFilterBar,
  DEFAULT_FILTER_STATE,
  type SurfacesFilterState,
} from "@/features/surfaces/components/SurfacesFilterBar";
import { SurfacesTable } from "@/features/surfaces/components/SurfacesTable";
import { SurfaceDetailPanel } from "@/features/surfaces/components/SurfaceDetailPanel";
import { SurfaceCandidatesDialog } from "@/features/surfaces/components/SurfaceCandidatesDialog";
import { ManifestSyncDialog } from "@/features/surfaces/components/ManifestSyncDialog";
import { ManifestDriftDialog } from "@/features/surfaces/components/ManifestDriftDialog";

import {
  bulkSetSurfacesActive,
  createSurface,
  createUiClient,
  deleteSurface,
  listClientNames,
  listSurfacesWithStats,
  SURFACE_TIERS,
  type SurfaceWithStats,
} from "@/features/surfaces/services/surfaces.service";
import { getRegisteredSurfaceNames } from "@/features/surfaces/manifests/registry";
import { SURFACE_CANDIDATES } from "@/features/surfaces/data/surface-candidates";

export function SurfacesContainer() {
  const [surfaces, setSurfaces] = useState<SurfaceWithStats[]>([]);
  const [clients, setClients] = useState<
    { name: string; description: string | null; is_active: boolean | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] =
    useState<SurfacesFilterState>(DEFAULT_FILTER_STATE);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [driftOpen, setDriftOpen] = useState(false);

  const manifestedSurfaceNames = useMemo(
    () => new Set(getRegisteredSurfaceNames()),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([
        listSurfacesWithStats(),
        listClientNames(),
      ]);
      setSurfaces(s);
      setClients(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load surfaces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clientNames = useMemo(
    () => clients.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    [clients],
  );

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return surfaces.filter((s) => {
      if (filters.client !== "__all__" && s.client_name !== filters.client) {
        return false;
      }
      if (filters.status === "active" && !s.is_active) return false;
      if (filters.status === "inactive" && s.is_active) return false;
      if (
        filters.manifest === "with_manifest" &&
        !manifestedSurfaceNames.has(s.name)
      )
        return false;
      if (
        filters.manifest === "without_manifest" &&
        manifestedSurfaceNames.has(s.name)
      )
        return false;
      if (q) {
        if (
          !s.name.toLowerCase().includes(q) &&
          !(s.description ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [surfaces, filters, manifestedSurfaceNames]);

  const selected = useMemo(
    () => surfaces.find((s) => s.name === selectedName) ?? null,
    [surfaces, selectedName],
  );

  const totalActive = useMemo(
    () => surfaces.filter((s) => s.is_active).length,
    [surfaces],
  );
  const totalUnused = useMemo(
    () =>
      surfaces.filter((s) => s.toolCount === 0 && s.agentCount === 0).length,
    [surfaces],
  );
  const candidatesAvailable = useMemo(
    () =>
      SURFACE_CANDIDATES.filter((c) => !surfaces.some((s) => s.name === c.name))
        .length,
    [surfaces],
  );
  const driftSignal = useMemo(() => {
    // Surfaces in DB without a code manifest, or manifested surfaces missing
    // from the surfaces table — both indicate potential drift.
    const dbNames = new Set(surfaces.map((s) => s.name));
    const codeOnly = [...manifestedSurfaceNames].filter((n) => !dbNames.has(n));
    return codeOnly.length;
  }, [surfaces, manifestedSurfaceNames]);

  const onDelete = async (row: SurfaceWithStats) => {
    try {
      await deleteSurface(row.name);
      toast.success(`${row.name} deleted`);
      if (selectedName === row.name) setSelectedName(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-2 flex-wrap">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Tool Registry · UI Surfaces</h1>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {surfaces.length} total
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {totalActive} active
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {manifestedSurfaceNames.size} manifests
          </Badge>
          {totalUnused > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px]"
              title="No tools or agents"
            >
              {totalUnused} unused
            </Badge>
          )}
        </div>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load()}
            className="h-7 gap-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDriftOpen(true)}
            className="h-7 gap-1.5 text-xs"
            title="Compare code manifests to database state"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Drift report
            {driftSignal > 0 && (
              <Badge variant="default" className="ml-1 text-[10px] px-1 h-4">
                {driftSignal}
              </Badge>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSyncOpen(true)}
            className="h-7 gap-1.5 text-xs"
            title="Apply code manifests to the database"
          >
            Sync manifests
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
            title="Bulk-add from the curated candidate inventory"
          >
            <Zap className="h-3.5 w-3.5" />
            Candidates
            {candidatesAvailable > 0 && (
              <Badge variant="default" className="ml-1 text-[10px] px-1 h-4">
                {candidatesAvailable}
              </Badge>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            className="h-7 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New surface
          </Button>
        </div>
      </div>

      <SurfacesFilterBar
        state={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        clientNames={clientNames}
      />

      {error && (
        <div className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Body: table + optional detail panel */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col border-r border-border">
          <SurfacesTable
            rows={visible}
            isLoading={loading}
            selectedName={selectedName}
            manifestedSurfaceNames={manifestedSurfaceNames}
            onSelect={(r) => setSelectedName(r.name)}
            onEdit={(r) => setSelectedName(r.name)}
            onDelete={(r) => void onDelete(r)}
          />
          <div className="shrink-0 px-3 py-1 text-[10px] text-muted-foreground tabular-nums border-t border-border bg-card">
            {visible.length} of {surfaces.length} surface
            {surfaces.length === 1 ? "" : "s"} shown
          </div>
        </div>

        {selected && (
          <div className="w-[480px] shrink-0 border-l border-border min-w-0">
            <SurfaceDetailPanel
              surface={selected}
              onClose={() => setSelectedName(null)}
              onChanged={() => void load()}
              onDeleted={(name) => {
                if (selectedName === name) setSelectedName(null);
                void load();
              }}
            />
          </div>
        )}
      </div>

      {/* Dialogs */}
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
      {syncOpen && (
        <ManifestSyncDialog
          onClose={() => setSyncOpen(false)}
          onSynced={() => {
            setSyncOpen(false);
            void load();
          }}
        />
      )}
      {driftOpen && (
        <ManifestDriftDialog
          onClose={() => setDriftOpen(false)}
          onSyncClick={() => {
            setDriftOpen(false);
            setSyncOpen(true);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// New surface / new client dialogs (lifted from the legacy admin page)
// ------------------------------------------------------------------

function NewSurfaceDialog({
  clients,
  existingNames,
  onClose,
  onCreated,
}: {
  clients: {
    name: string;
    description: string | null;
    is_active: boolean | null;
  }[];
  existingNames: Set<string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [client, setClient] = useState(clients[0]?.name ?? "");
  const [local, setLocal] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState<string>("Pages");
  const [busy, setBusy] = useState(false);

  const tierEntry =
    SURFACE_TIERS.find((t) => t.label === tier) ?? SURFACE_TIERS[1];
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
              placeholder="e.g. notes or debug/state-analyzer"
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
                {SURFACE_TIERS.filter((t) => t.label !== "Reserved").map(
                  (t) => (
                    <SelectItem key={t.label} value={t.label}>
                      <div className="flex flex-col items-start">
                        <span>{t.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {t.description}
                        </span>
                      </div>
                    </SelectItem>
                  ),
                )}
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
      await createUiClient({
        name,
        description: description || null,
        sortOrder,
      });
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
          <Button
            onClick={() => void submit()}
            disabled={busy || !nameValid || nameClash}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Create client"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { bulkSetSurfacesActive };
