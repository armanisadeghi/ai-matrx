"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Zap,
  UserPlus,
  CircleCheck,
  CircleDashed,
  Circle,
  CircleAlert,
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

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
import { NewSurfaceDialog } from "@/features/surfaces/components/NewSurfaceDialog";

import {
  bulkSetSurfacesActive,
  createUiClient,
  deleteSurface,
  listClientNames,
  listSurfacesWithStats,
  readinessBucketOf,
  type SurfaceWithStats,
  type SurfaceReadinessBucket,
} from "@/features/surfaces/services/surfaces.service";
import { READINESS_META } from "@/features/surfaces/components/SurfaceReadinessBadge";
import { getRegisteredSurfaceNames } from "@/features/surfaces/manifests/registry";
import { SURFACE_CANDIDATES } from "@/features/surfaces/data/surface-candidates";
import { listParentFilterOptions } from "@/features/surfaces/utils/surface-hierarchy";

export function SurfacesContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [surfaces, setSurfaces] = useState<SurfaceWithStats[]>([]);
  const [clients, setClients] = useState<
    { name: string; description: string | null; is_active: boolean | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] =
    useState<SurfacesFilterState>(DEFAULT_FILTER_STATE);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [navigatingName, setNavigatingName] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  // ?drift=1 deep-links straight into the drift dialog (one-shot, read at mount).
  const [driftOpen, setDriftOpen] = useState(
    () => searchParams.get("drift") === "1",
  );

  /** Navigate to the full-screen per-surface editor (house nav rules). */
  const openEditor = (row: SurfaceWithStats) => {
    if (navigatingName) return;
    setNavigatingName(row.name);
    const href = `/administration/ui/surfaces/${row.name
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    startTransition(() => router.push(href));
  };

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

  // Clear the per-row navigation loader if the transition settles without
  // unmounting (e.g. push to the same route).
  useEffect(() => {
    if (!isPending) setNavigatingName(null);
  }, [isPending]);

  const clientNames = useMemo(
    () => clients.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    [clients],
  );

  const parentNames = useMemo(
    () => listParentFilterOptions(surfaces),
    [surfaces],
  );

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return surfaces.filter((s) => {
      if (filters.client !== "__all__" && s.client_name !== filters.client) {
        return false;
      }
      if (filters.parent === "__none__" && s.parent_surface_name !== null) {
        return false;
      }
      if (
        filters.parent !== "__all__" &&
        filters.parent !== "__none__" &&
        s.parent_surface_name !== filters.parent
      ) {
        return false;
      }
      if (filters.status === "active" && !s.is_active) return false;
      if (filters.status === "inactive" && s.is_active) return false;
      if (
        filters.readiness !== "all" &&
        readinessBucketOf(s) !== filters.readiness
      ) {
        return false;
      }
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
          !(s.label ?? "").toLowerCase().includes(q) &&
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
  // Readiness rollup — scoped to the active client filter (before the other
  // filters) so the tiles always describe the client you're looking at.
  const readinessCounts = useMemo(() => {
    const counts: Record<SurfaceReadinessBucket, number> = {
      verified: 0,
      partial: 0,
      stub: 0,
      unregistered: 0,
    };
    for (const s of surfaces) {
      if (filters.client !== "__all__" && s.client_name !== filters.client) {
        continue;
      }
      counts[readinessBucketOf(s)] += 1;
    }
    return counts;
  }, [surfaces, filters.client]);

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

      {/* Readiness rollup — the surface tracking board. Counts follow the
          client filter; clicking a tile filters the list by that bucket. */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border bg-background">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {(
            [
              { bucket: "verified", icon: CircleCheck },
              { bucket: "partial", icon: CircleDashed },
              { bucket: "stub", icon: Circle },
              { bucket: "unregistered", icon: CircleAlert },
            ] as const
          ).map(({ bucket, icon: Icon }) => {
            const meta = READINESS_META[bucket];
            const active = filters.readiness === bucket;
            return (
              <button
                key={bucket}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    readiness: active ? "all" : bucket,
                  }))
                }
                title={`${meta.description} — click to ${active ? "clear the" : "filter by this"} readiness filter`}
                aria-pressed={active}
                className={`rounded-md border px-2.5 py-1.5 text-left transition-colors flex items-center justify-between gap-2 ${
                  active
                    ? "border-primary ring-1 ring-primary bg-muted/40"
                    : "border-border bg-card hover:bg-muted/30"
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${meta.iconClassName}`}
                  />
                  <span className="text-[11px] font-medium capitalize truncate">
                    {meta.label}
                  </span>
                </span>
                <span className="text-base font-semibold tabular-nums leading-none">
                  {readinessCounts[bucket]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <SurfacesFilterBar
        state={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        clientNames={clientNames}
        parentNames={parentNames}
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
            onSelect={openEditor}
            onEdit={openEditor}
            onPeek={(r) => setSelectedName(r.name)}
            onDelete={(r) => void onDelete(r)}
            navigatingName={navigatingName}
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
          parentOptions={parentNames}
          onClose={() => setCreating(false)}
          onCreated={(_name) => {
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
// New client dialog (lifted from the legacy admin page)
// ------------------------------------------------------------------

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
