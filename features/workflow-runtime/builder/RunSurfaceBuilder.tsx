"use client";

/**
 * RunSurfaceBuilder — build on the left, watch it on the right.
 *
 * The paradigm is the agent-apps LiveBuilder's, applied to a workflow's run
 * page: the left column is a short flow of plain-language decisions, the right
 * column mounts the REAL run surface so every decision is visible before it is
 * saved. What it deliberately does NOT have is the thing it replaces — a
 * coordinate grid a person drags boxes around in.
 *
 * On mobile the two halves become one, behind a single Build / Preview switch
 * (ios-mobile-first: stack, never shrink).
 */

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, Loader2, MonitorPlay, Save } from "lucide-react";

import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import type { RunSurfaceConfig } from "../surface/config";
import { autoLayoutSurface } from "../surface/layout";
import {
  createSurface,
  fetchWorkflowDefinition,
  getDefaultSurface,
  saveSurfaceConfig,
  type RuntimeSurfaceRow,
  type SaveSurfaceOutcome,
} from "../surface/service";
import type { WorkflowDefinitionLike } from "../trigger-points";
import { BuildPane, type SurfaceMeta } from "./BuildPane";
import { PreviewPane } from "./PreviewPane";
import { Segmented } from "./parts";
import { normalize, type ScreenId } from "./layout-model";
import { describeSteps } from "./vocabulary";

interface LoadedWorkflow {
  name: string;
  definition: WorkflowDefinitionLike;
}

type MobileView = "build" | "preview";

export function RunSurfaceBuilder({ definitionId }: { definitionId: string }) {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const isMobile = useIsMobile();

  const [workflow, setWorkflow] = useState<LoadedWorkflow | null>(null);
  const [surface, setSurface] = useState<RuntimeSurfaceRow | null>(null);
  const [config, setConfig] = useState<RunSurfaceConfig | null>(null);
  const [meta, setMeta] = useState<SurfaceMeta>({
    name: "Default",
    audience: "consumer",
    profile: "full",
  });
  const [screenId, setScreenId] = useState<ScreenId>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveProblem, setSaveProblem] = useState<
    Exclude<SaveSurfaceOutcome, "saved"> | null
  >(null);
  const [mobileView, setMobileView] = useState<MobileView>("build");
  const [reloadNonce, setReloadNonce] = useState(0);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchWorkflowDefinition(definitionId),
      getDefaultSurface(definitionId),
    ])
      .then(([loaded, row]) => {
        if (cancelled) return;
        setLoadError(null);
        if (!loaded) {
          setLoadError("We couldn't open this workflow. It may have been deleted.");
          return;
        }
        setWorkflow({ name: loaded.name, definition: loaded.definition });
        setSurface(row);
        const next = normalize(row ? row.config : autoLayoutSurface(loaded.definition));
        setConfig(next);
        setScreenId(next.pages[0]?.id ?? null);
        if (row) {
          setMeta({ name: row.name, audience: row.audience, profile: row.profile });
        }
        setDirty(false);
        if (row && row.warnings.length > 0) {
          toast.error(`Part of this view couldn't be read: ${row.warnings.join(" ")}`);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "We couldn't open this workflow.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId, reloadNonce]);

  // ── Never lose an edit to a stray tab close ──────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const changeConfig = useCallback((next: RunSurfaceConfig) => {
    setConfig(next);
    setDirty(true);
  }, []);

  const changeMeta = useCallback((patch: Partial<SurfaceMeta>) => {
    setMeta((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const create = useCallback(async () => {
    if (!config) return;
    if (!organizationId) {
      toast.error("Pick an organization before creating this view.");
      return;
    }
    setBusy(true);
    try {
      const row = await createSurface({
        definitionId,
        organizationId,
        name: meta.name,
        audience: meta.audience,
        profile: meta.profile,
        isDefault: true,
        config,
      });
      setSurface(row);
      setConfig(normalize(row.config));
      setDirty(false);
      toast.success("This view is live. Everyone who runs this workflow sees it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't create this view.");
    } finally {
      setBusy(false);
    }
  }, [config, definitionId, meta, organizationId]);

  const save = useCallback(async () => {
    if (!surface || !config) return;
    setBusy(true);
    try {
      const outcome = await saveSurfaceConfig({
        id: surface.id,
        expectedVersion: surface.version,
        config,
        meta,
      });
      if (outcome !== "saved") {
        setSaveProblem(outcome);
        return;
      }
      setSurface({ ...surface, ...meta, config, warnings: [], version: surface.version + 1 });
      setDirty(false);
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't save this view.");
    } finally {
      setBusy(false);
    }
  }, [config, meta, surface]);

  // ── Chrome ───────────────────────────────────────────────────────────────
  const header = (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton
            href={`/workflows/${definitionId}`}
            ariaLabel="Back to this workflow"
          />
          <span className="ml-1 max-w-[130px] truncate text-sm font-medium text-foreground sm:max-w-[260px]">
            {workflow?.name ?? "Workflow"}
          </span>
        </>
      }
      right={
        surface ? (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "hidden text-xs sm:inline",
                dirty ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              )}
            >
              {dirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => void save()}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null
      }
    />
  );

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">{loadError}</p>
      </div>
    );
  }

  if (!workflow || !config) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const steps = describeSteps(workflow.definition);

  const buildColumn = (
    <div className="min-h-0 overflow-y-auto px-4 pt-4">
      {!surface ? (
        <div className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 space-y-2">
              <h2 className="text-sm font-semibold text-foreground">
                Nobody has designed this workflow&apos;s run page yet
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                We&apos;ve laid one out for you from the steps in this workflow —
                it&apos;s on the right. Make it yours, or take it as it is.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MonitorPlay className="h-4 w-4" />
                )}
                {busy ? "Creating…" : "Use this page"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <BuildPane
        config={config}
        onChange={changeConfig}
        steps={steps}
        meta={meta}
        onMetaChange={changeMeta}
        screenId={screenId}
        onScreenChange={setScreenId}
      />
    </div>
  );

  const previewColumn = (
    <div className="min-h-0 p-4">
      <PreviewPane
        definitionId={definitionId}
        definition={workflow.definition}
        config={config}
        screenId={screenId}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {header}

      {isMobile ? (
        <>
          <div className="shrink-0 px-4 pt-[calc(var(--shell-header-h)+0.5rem)]">
            <Segmented<MobileView>
              ariaLabel="Build or preview"
              value={mobileView}
              options={[
                { value: "build", label: "Build" },
                { value: "preview", label: "Preview" },
              ]}
              onChange={setMobileView}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {mobileView === "build" ? buildColumn : previewColumn}
          </div>
        </>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,420px)_minmax(0,1fr)] overflow-hidden pt-[var(--shell-header-h)]">
          {buildColumn}
          {previewColumn}
        </div>
      )}

      <ConfirmDialog
        open={saveProblem !== null}
        onOpenChange={(open) => {
          if (!open) setSaveProblem(null);
        }}
        title={
          saveProblem === "conflict"
            ? "Someone else saved this view"
            : saveProblem === "refused"
              ? "This account can't change this view"
              : "This view is no longer there"
        }
        description={
          saveProblem === "conflict"
            ? "Your changes weren't saved, because they'd have overwritten theirs. Load their version to see what changed — your unsaved edits will be lost."
            : saveProblem === "refused"
              ? "Nothing was saved. This view belongs to another workspace, and you're signed in with an account that can read it but not change it. Ask its owner for edit access — or copy anything you need out of your edits before you leave this page."
              : "Nothing was saved, because this view has been deleted since you opened it. Copy anything you need out of your edits before you leave this page."
        }
        confirmLabel={
          saveProblem === "conflict" ? "Load their version" : "Reload the page"
        }
        cancelLabel={saveProblem === "conflict" ? "Keep editing mine" : "Stay here"}
        variant="destructive"
        onConfirm={() => {
          setSaveProblem(null);
          setDirty(false);
          setReloadNonce((n) => n + 1);
        }}
      />
    </div>
  );
}
