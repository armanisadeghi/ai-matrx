"use client";

import React, {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Zap,
  UserPlus,
  CircleCheck,
  CircleDashed,
  Circle,
  CircleAlert,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { ADMIN_UI_SURFACES_SURFACE_NAME } from "@/features/surfaces/manifests/admin-ui-surfaces.manifest";
import {
  buildUiSurfacesScope,
  type UiSurfacesDialog,
} from "@/features/surfaces/lib/ui-surfaces-scope";
import {
  parseCreateSurfacesValue,
  parseDeleteSurfacesValue,
  parseNewSurfaceDraftValue,
  parseUpdateSurfacesValue,
  type NewSurfaceDraftFields,
  type SurfaceWriteContext,
} from "@/features/surfaces/lib/ui-surfaces-agent-writes";
import { surfaceDeleteConsequence } from "@/features/surfaces/utils/surface-delete-consequence";
import { countDriftIssues } from "@/features/surfaces/utils/drift-report-count";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { toast, recordToast, dismissRecordToasts } from "@/lib/toast";

import {
  DEFAULT_FILTER_STATE,
  type SurfacesFilterState,
} from "@/features/surfaces/components/SurfacesFilterBar";
import { SurfacesTable } from "@/features/surfaces/components/SurfacesTable";
import { SurfaceDetailPanel } from "@/features/surfaces/components/SurfaceDetailPanel";
import { SurfaceCandidatesDialog } from "@/features/surfaces/components/SurfaceCandidatesDialog";
import { ManifestSyncDialog } from "@/features/surfaces/components/ManifestSyncDialog";
import { ManifestDriftDialog } from "@/features/surfaces/components/ManifestDriftDialog";
import {
  NewSurfaceDialog,
  type NewSurfaceDraftScope,
} from "@/features/surfaces/components/NewSurfaceDialog";

import {
  bulkSetSurfacesActive,
  createSurface,
  createUiClient,
  deleteSurface,
  getDriftReport,
  updateSurface,
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
import { surfaceCheckState } from "@/features/surfaces/utils/surface-check-ledger";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function SurfacesContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

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
  // new_surface_draft: an agent's fill for the New surface dialog, and the
  // dialog's live values (published into a ref so getScope stays synchronous).
  const [draftSeed, setDraftSeed] = useState<
    { fields: NewSurfaceDraftFields; version: number } | undefined
  >(undefined);
  const draftRef = useRef<NewSurfaceDraftScope | null>(null);
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

  const manifestedSurfaceNames = new Set(getRegisteredSurfaceNames());

  // The Drift report button's count is the drift report's own total (the ONE
  // helper, countDriftIssues) — it used to count only code manifests with no
  // registry row, so the badge and the report disagreed. null = not loaded.
  const [driftIssues, setDriftIssues] = useState<number | null>(null);
  const loadDrift = async () => {
    try {
      setDriftIssues(countDriftIssues(await getDriftReport()));
    } catch {
      // The report dialog shows the error itself; the badge just stays off.
      setDriftIssues(null);
    }
  };

  const load = async () => {
    void loadDrift();
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
  };

  // Load once on mount; every later load is an explicit refresh or a write.
  const loadOnMount = useEffectEvent(() => void load());
  useEffect(() => {
    loadOnMount();
  }, []);

  // Clear the per-row navigation loader if the transition settles without
  // unmounting (e.g. push to the same route).
  useEffect(() => {
    if (!isPending) setNavigatingName(null);
  }, [isPending]);

  const clientNames = clients
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  const parentNames = listParentFilterOptions(surfaces);

  const visible = surfaces.filter((s) => {
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
        filters.checked !== "all" &&
        surfaceCheckState(s) !== filters.checked
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
      return true;
  });

  const selected = surfaces.find((s) => s.name === selectedName) ?? null;

  const totalActive = surfaces.filter((s) => s.is_active).length;
  const totalUnbound = surfaces.filter(
    (s) => s.toolCount === 0 && s.agentCount === 0,
  ).length;
  // Readiness rollup — scoped to the active client filter (before the other
  // filters) so the tiles always describe the client you're looking at.
  const readinessCounts: Record<SurfaceReadinessBucket, number> = {
      verified: 0,
      partial: 0,
      stub: 0,
      unregistered: 0,
  };
  for (const s of surfaces) {
    if (filters.client !== "__all__" && s.client_name !== filters.client) {
      continue;
    }
    readinessCounts[readinessBucketOf(s)] += 1;
  }

  const candidatesAvailable = SURFACE_CANDIDATES.filter(
    (c) => !surfaces.some((s) => s.name === c.name),
  ).length;
  const driftSignal = driftIssues ?? 0;

  // Reversible: deactivating keeps every binding (the delete alternative).
  const onToggleActive = async (row: SurfaceWithStats) => {
    const next = row.is_active === false;
    try {
      await updateSurface(row.name, { is_active: next });
      toast.success(`${row.label ?? row.name} ${next ? "activated" : "deactivated"}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const onDelete = async (row: SurfaceWithStats) => {
    const ok = await confirm({
      title: `Delete ${row.label ?? row.name}?`,
      description: surfaceDeleteConsequence(
        row,
        manifestedSurfaceNames.has(row.name),
      ),
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteSurface(row.name);
      dismissRecordToasts({ type: "ui_surface", id: row.name });
      toast.success(`${row.name} deleted`);
      if (selectedName === row.name) setSelectedName(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const openDialog: UiSurfacesDialog | null = creating
    ? "new_surface"
    : newClientOpen
      ? "new_client"
      : candidatesOpen
        ? "candidates"
        : syncOpen
          ? "sync_manifests"
          : driftOpen
            ? "drift_report"
            : null;

  // Agent context — built from state this page already rendered; never fetches.
  const getScope = () =>
    buildUiSurfacesScope({
      loading,
      error,
      surfaces,
      visible,
      clientNames,
      manifestedNames: manifestedSurfaceNames,
      filters,
      readinessCounts,
      candidatesAvailable,
      driftIssues,
      peekedName: selectedName,
      openDialog,
      newSurfaceDraft: creating ? draftRef.current : null,
    });

  // Agent writes — one record type (surfaces), full list CRUD through this
  // page's own service functions; every list is checked whole before the
  // approval card, and the page reloads after each write.
  const writeContext = (): SurfaceWriteContext => ({
    existing: surfaces.map((s) => ({
      name: s.name,
      has_manifest: manifestedSurfaceNames.has(s.name),
    })),
    clientNames,
  });
  const reloadAfter =
    <T,>(run: (plan: T) => Promise<{ id: string; name: string }>) =>
    async (plan: T) => {
      const ref = await run(plan);
      void load();
      return ref;
    };
  const getWriteHandlers = () => ({
    ...collectionWriteHandlers(
      {
        plural: "surfaces",
        singular: "surface",
        create: {
          parse: (value) => parseCreateSurfacesValue(value, writeContext()),
          run: reloadAfter(async (plan: ReturnType<typeof parseCreateSurfacesValue>[number]) => {
            const row = await createSurface(plan);
            return { id: row.name, name: row.label ?? row.name };
          }),
          nameOf: (plan) => plan.name,
        },
        update: {
          parse: (value) => parseUpdateSurfacesValue(value, writeContext()),
          run: reloadAfter(async (plan: ReturnType<typeof parseUpdateSurfacesValue>[number]) => {
            await updateSurface(plan.name, plan.patch);
            return { id: plan.name, name: plan.name };
          }),
          nameOf: (plan) => plan.name,
          changedOf: (plan) => plan.changed,
        },
        delete: {
          parse: (value) => parseDeleteSurfacesValue(value, writeContext()),
          run: reloadAfter(async (s: { name: string }) => {
            await deleteSurface(s.name);
            dismissRecordToasts({ type: "ui_surface", id: s.name });
            if (selectedName === s.name) setSelectedName(null);
            return { id: s.name, name: s.name };
          }),
          nameOf: (s) => s.name,
        },
      },
      refuseSurfaceWrite,
    ),
    new_surface_draft: {
      // Before the approval card: a bad value is refused with no card.
      validate: (value: unknown) => {
        parseNewSurfaceDraftValue(value, writeContext());
      },
      apply: (value: unknown) => {
        const fields = parseNewSurfaceDraftValue(value, writeContext());
        setDraftSeed((prev) => ({ fields, version: (prev?.version ?? 0) + 1 }));
        setCreating(true);
        return {
          summary: `Filled the New surface dialog (${Object.keys(fields).join(", ")}). Nothing is saved until the person presses Create.`,
        };
      },
    },
  });

  const peekPanel = (surface: SurfaceWithStats) => (
    <SurfaceDetailPanel
      surface={surface}
      onClose={() => setSelectedName(null)}
      onChanged={() => void load()}
      onDeleted={(name) => {
        if (selectedName === name) setSelectedName(null);
        void load();
      }}
    />
  );

  const actions = [
    {
      key: "drift",
      label: "Drift report",
      icon: AlertTriangle,
      title: "Compare code manifests to database state — the count is the report's total",
      badge: driftSignal,
      onClick: () => setDriftOpen(true),
    },
    {
      key: "sync",
      label: "Sync manifests",
      icon: RefreshCw,
      title: "Apply code manifests to the database",
      badge: 0,
      onClick: () => setSyncOpen(true),
    },
    {
      key: "client",
      label: "New client",
      icon: UserPlus,
      title: "Create a new UI client",
      badge: 0,
      onClick: () => setNewClientOpen(true),
    },
    {
      key: "candidates",
      label: "Candidates",
      icon: Zap,
      title:
        candidatesAvailable === 0
          ? "Every curated candidate is already in the registry"
          : "Bulk-add from the curated candidate inventory",
      badge: candidatesAvailable,
      disabled: candidatesAvailable === 0,
      onClick: () => setCandidatesOpen(true),
    },
  ];

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_UI_SURFACES_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
    <NonEditableContextMenu
      sourceFeature="admin"
      surfaceName={ADMIN_UI_SURFACES_SURFACE_NAME}
      menuVersion={1}
      getApplicationScope={getScope}
      contentSource={{ type: "raw" }}
    >
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col bg-background matrx-touch-targets">
      {/* Summary row — the page title lives in the shell header. One line of
          counts, the readiness filter toggles (desktop) and the actions. On a
          phone it is ONE line: counts + one Actions menu; readiness moves into
          the table's Filters sheet. */}
      <div
        data-matrx-table-page
        className="shrink-0 py-1.5 border-b border-border flex items-center gap-1.5 flex-wrap"
      >
        <span
          className="min-w-0 truncate text-xs tabular-nums text-muted-foreground"
          title={`${surfaces.length} surfaces · ${totalActive} active · ${manifestedSurfaceNames.size} with a code manifest · ${totalUnbound} with no agents or tools`}
        >
          {surfaces.length} surfaces · {totalActive} active
          {!isMobile && (
            <>
              {" "}· {manifestedSurfaceNames.size} with a code manifest
              {totalUnbound > 0 && <> · {totalUnbound} with no agents or tools</>}
            </>
          )}
        </span>
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {/* Readiness filter — counts follow the client filter; pressing one
            filters the list by that bucket, pressing it again clears it. */}
        {!isMobile && (
          <div className="flex flex-wrap items-center gap-1">
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
                <Button
                  key={bucket}
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  aria-pressed={active}
                  title={`${meta.description} — ${active ? "clear the" : "filter by this"} readiness`}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      readiness: active ? "all" : bucket,
                    }))
                  }
                  className={`h-7 gap-1.5 px-2 text-xs ${active ? "ring-1 ring-primary" : ""}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${meta.iconClassName}`} />
                  <span className="capitalize">{meta.label}</span>
                  <span className="font-semibold tabular-nums">
                    {readinessCounts[bucket]}
                  </span>
                </Button>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!isMobile &&
            actions
              .filter((a) => a.key === "drift" || a.key === "sync")
              .map((a) => (
                <Button
                  key={a.key}
                  size="sm"
                  variant="outline"
                  onClick={a.onClick}
                  disabled={a.disabled}
                  className="h-7 gap-1.5 text-xs"
                  title={a.title}
                >
                  <a.icon className="h-3.5 w-3.5" />
                  {a.label}
                  {a.badge > 0 && (
                    <Badge variant="default" className="ml-1 h-4 px-1 text-xs">
                      {a.badge}
                    </Badge>
                  )}
                </Button>
              ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                aria-label={isMobile ? "Registry actions" : "More registry actions"}
                title={isMobile ? "Registry actions" : "New client, Candidates"}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {actions
                .filter(
                  (a) => isMobile || (a.key !== "drift" && a.key !== "sync"),
                )
                .map((a) => (
                  <DropdownMenuItem
                    key={a.key}
                    disabled={a.disabled}
                    onSelect={a.onClick}
                    className="gap-2"
                  >
                    <a.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{a.label}</span>
                    {a.badge > 0 && (
                      <span className="pl-3 tabular-nums text-muted-foreground">
                        {a.badge}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      )}

      {/* Body: table + optional detail panel */}
      <div className="flex-1 min-h-0 flex">
        <div
          data-matrx-table-page
          className="flex-1 min-w-0 flex flex-col border-r border-border"
        >
          <SurfacesTable
            rows={visible}
            isLoading={loading}
            selectedName={selectedName}
            manifestedSurfaceNames={manifestedSurfaceNames}
            onSelect={openEditor}
            onEdit={openEditor}
            onPeek={(r) => setSelectedName(r.name)}
            onDelete={(r) => void onDelete(r)}
            onToggleActive={(r) => void onToggleActive(r)}
            navigatingName={navigatingName}
            filters={filters}
            onFilterChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            onClearFilters={() => setFilters(DEFAULT_FILTER_STATE)}
            clientNames={clientNames}
            parentNames={parentNames}
            onRefresh={load}
            onAdd={() => setCreating(true)}
          />
        </div>

        {/* Peek — a side panel on desktop (narrow enough that the triage
            columns stay in view), a bottom sheet on a phone. */}
        {selected && !isMobile && (
          <div className="w-[400px] shrink-0 border-l border-border min-w-0">
            {peekPanel(selected)}
          </div>
        )}
      </div>
      {isMobile && (
        <Drawer
          open={selected !== null}
          onOpenChange={(open) => !open && setSelectedName(null)}
        >
          <DrawerContent className="h-[92dvh] pb-safe">
            <DrawerHeader className="sr-only">
              <DrawerTitle>
                {selected ? (selected.label ?? selected.name) : "Surface"}
              </DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 flex-1">
              {selected && peekPanel(selected)}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Dialogs */}
      {creating && (
        <NewSurfaceDialog
          clients={clients.filter((c) => c.is_active !== false)}
          existingNames={new Set(surfaces.map((s) => s.name))}
          parentOptions={parentNames}
          seed={draftSeed}
          agentSurfaceName={ADMIN_UI_SURFACES_SURFACE_NAME}
          onDraftChange={(d) => {
            draftRef.current = d;
          }}
          onClose={() => {
            setCreating(false);
            setDraftSeed(undefined);
          }}
          onCreated={(_name) => {
            setCreating(false);
            setDraftSeed(undefined);
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
    </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
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
      recordToast.success(
        { type: "ui_client", id: name, title: name },
        `Client ${name} created`,
      );
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
            <Label className="text-xs">Name</Label>
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
            <ProTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description shown to admins"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Position in the client tabs</Label>
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
