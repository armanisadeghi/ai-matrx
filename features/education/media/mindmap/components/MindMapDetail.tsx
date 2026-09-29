"use client";

// features/education/media/mindmap/components/MindMapDetail.tsx
//
// A stored mind map: the interactive concept map + its trust sources + owner
// controls (regenerate / delete / share). Read-only for non-owners (the shared
// viewer). React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { MadeFromSource } from "@/features/education/convert/MadeFromSource";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationMindMapsScope } from "@/features/surfaces/manifests/education-mind-maps.manifest";
import { useStudyMediaAuthReady } from "../../authLoad";
import { studyMediaService } from "../../service";
import type { StudyMediaRow } from "../../types";
import { MindMapNodeSearch, MindMapView } from "./MindMapView";
import { distinctSourceTitle } from "@/features/education/components/EducationCollectionSearch";
import type { DiagramNode } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { parseCreateMindMaps, parseMindMapIds, parseUpdateMindMaps, trustAfterMindMapEdit } from "../mindMapWrites";
import { MindMapEditor } from "./MindMapEditor";

/**
 * Read the stored diagram's size + node labels for the surface scope. Pure and
 * defensive: a row whose `ir_envelope` is missing or not a readable diagram
 * yields null, and the manifest declares those values `alwaysAvailable: false`
 * for exactly that case.
 */
function readDiagramShape(
  envelope: unknown,
): { nodeCount: number; edgeCount: number; nodeLabels: string[] } | null {
  if (typeof envelope !== "object" || envelope === null) return null;
  const { nodes, edges } = envelope as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(nodes)) return null;
  return {
    nodeCount: nodes.length,
    edgeCount: Array.isArray(edges) ? edges.length : 0,
    nodeLabels: nodes
      .map((n) =>
        typeof n === "object" && n !== null
          ? (n as { label?: unknown }).label
          : undefined,
      )
      .filter((l): l is string => typeof l === "string" && l.length > 0),
  };
}

/** Read the mind-map generation config stamped on the row at create time. */
function readMapConfig(config: unknown): {
  hint?: string;
  linkedCards?: number;
} {
  if (typeof config !== "object" || config === null) return {};
  const c = config as { hint?: unknown; linkedCards?: unknown };
  return {
    ...(typeof c.hint === "string" && c.hint ? { hint: c.hint } : {}),
    ...(typeof c.linkedCards === "number"
      ? { linkedCards: c.linkedCards }
      : {}),
  };
}

export function MindMapDetail({ mediaId, edit = false }: { mediaId: string; edit?: boolean }) {
  const router = useRouter();
  const [media, setMedia] = useState<StudyMediaRow | null>(null);
  const [loading, setLoading] = useState(true);
  // The raw failure, never a sentence — the access gate decides what it means.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null);
  const access = useAccess("study_media", mediaId);
  const { isOwner } = access;
  const canEdit = !access.loading && canEditAccess(access.level);
  // A persisted Redux identity can briefly precede Supabase's restored
  // browser session; firing getById before all three signals are ready sends
  // it as `anon`, which a private study_media row refuses with 42501 —
  // rendering a real record as a permanent "Something went wrong" on first
  // load. See features/education/media/authLoad.ts.
  const authReady = useStudyMediaAuthReady();

  useEffect(() => {
    if (!authReady) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      studyMediaService.getById(mediaId).then((res) => {
        if (!active) return;
        setMedia(res.data);
        setLoadError(res.data ? null : (res.error ?? null));
        setLoading(false);
      });
    });
    return () => {
      active = false;
    };
  }, [mediaId, reloadKey, authReady]);

  async function handleDelete() {
    if (!media) return;
    const ok = await confirm({
      title: "Move this mind map to Trash?",
      description:
        "It leaves your library and goes to Trash, where you can restore it.",
      confirmLabel: "Move to Trash",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await studyMediaService.softDelete(media.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Moved to Trash");
    router.push("/education/mind-maps");
  }

  const trust = media ? coerceTrustEnvelope({ trust: media.trust }) : null;
  const diagram = media ? readDiagramShape(media.ir_envelope) : null;
  const mapConfig = media ? readMapConfig(media.config) : {};
  const getWriteHandlers = () => collectionWriteHandlers({
    plural: "mind_maps", singular: "mind map",
    create: { parse: parseCreateMindMaps, run: async (map) => {
      const result = await studyMediaService.create({ mediaKind: "mind_map", title: map.title, irEnvelope: map, diagramKind: "diagram_spec", status: "ready" });
      if (result.error || !result.data) throw new Error(result.error ?? "Could not create mind map.");
      return { id: result.data.id, name: result.data.title };
    }, nameOf: (map) => map.title },
    update: { parse: (value) => parseUpdateMindMaps(value, canEdit && media ? [media] : []), run: async (plan) => {
      const result = await studyMediaService.updateVersioned(plan.id, plan.version, { title: plan.map.title, ir_envelope: plan.map, trust: trustAfterMindMapEdit(media?.trust) });
      if (result.error || !result.data) throw new Error(result.error ?? "Could not update mind map.");
      setMedia(result.data); return { id: result.data.id, name: result.data.title };
    }, nameOf: (plan) => plan.map.title, changedOf: (plan) => plan.changed },
    delete: { parse: (value) => parseMindMapIds(value, "delete_mind_maps", isOwner && media ? [media] : []).map(() => {
      if (!media) throw new Error("The mind map is no longer available."); return media;
    }), run: async (row) => { const result = await studyMediaService.softDelete(row.id); if (result.error) throw new Error(result.error); router.push("/education/mind-maps"); return { id: row.id, name: row.title }; }, nameOf: (row) => row.title },
  }, refuseSurfaceWrite);

  // Live surface scope for the Agents chrome (matrx-user/education-mind-maps,
  // detail view). Synchronous over live render state — no fetch; the Surface
  // Context window polls this every 400ms. The provider wraps the loading and
  // not-found branches too, so an agent launched on a map that is still
  // resolving (or that the learner cannot see) is told exactly that instead of
  // getting a surface with nothing in it.
  //
  // This mount registers NO write handlers. Despite the /[id]/edit route name
  // there is no node editor here — the component renders the stored diagram
  // plus its trust envelope and the owner's regenerate / delete / share
  // controls, all of which the manifest's writeTargets docblock excludes.
  const getScope = () =>
    createEducationMindMapsScope({
      view: "detail",
      map_loading: loading,
      ...(loading
        ? {}
        : !media
          ? { map_not_found: true }
          : {
              map_not_found: false,
              mind_map_id: media.id,
              mind_map_title: media.title,
              mind_map_version: media.version,
              ...(media.description
                ? { mind_map_description: media.description }
                : {}),
              mind_map_status: media.status,
              ...(media.source_kind
                ? { map_source_kind: media.source_kind }
                : {}),
              ...(media.source_title
                ? { map_source_title: media.source_title }
                : {}),
              ...(media.source_id ? { map_source_id: media.source_id } : {}),
              ...(mapConfig.hint ? { map_focus_hint: mapConfig.hint } : {}),
              ...(media.diagram_kind
                ? { diagram_kind: media.diagram_kind }
                : {}),
              ...(diagram
                ? {
                    node_count: diagram.nodeCount,
                    edge_count: diagram.edgeCount,
                    node_labels: diagram.nodeLabels,
                  }
                : {}),
              ...(mapConfig.linkedCards !== undefined
                ? { linked_card_count: mapConfig.linkedCards }
                : {}),
              map_visibility: media.published_to_web
                ? "published_to_web"
                : (media.shown_to ?? "default"),
              is_owner: isOwner,
              ...(trust
                ? {
                    trust_confidence: trust.confidence,
                    ...(trust.groundedIn
                      ? { trust_grounded_in: trust.groundedIn }
                      : {}),
                    trust_citation_count: trust.citations.length,
                    trust_citations: trust.citations.map((c) => ({
                      sourceId: c.sourceId,
                      sourceKind: c.sourceKind,
                      title: c.title ?? null,
                      excerpt: c.excerpt ?? null,
                    })),
                  }
                : {}),
            }),
    });

  if (loading) {
    return (
      <SurfaceRuntimeProvider
        surfaceName="matrx-user/education-mind-maps"
        getScope={getScope}
        getWriteHandlers={getWriteHandlers}
      >
        <div className="relative h-full min-h-0 w-full overflow-hidden bg-textured">
          <div className="absolute left-3 top-3 z-20 flex items-center gap-3 rounded-xl border border-border/70 bg-card/90 p-2 shadow-lg backdrop-blur-xl">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  if (!media) {
    return (
      <SurfaceRuntimeProvider
        surfaceName="matrx-user/education-mind-maps"
        getScope={getScope}
        getWriteHandlers={getWriteHandlers}
      >
        {/* Denied / deleted / never existed / signed-out all read as zero rows here. */}
        <AccessGate
          token="study_media"
          id={mediaId}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          fallbackHref="/education/mind-maps"
          fallbackLabel="Mind Maps"
        />
      </SurfaceRuntimeProvider>
    );
  }

  if (edit) return <MindMapEditor media={media} isOwner={isOwner} />;

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-mind-maps"
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      <div className="relative h-full min-h-0 w-full overflow-hidden bg-textured">
        <MindMapView
          envelope={media.ir_envelope}
          mapTrust={trust}
          presentation="workspace"
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />

        <div className="absolute left-3 right-3 top-3 z-20 flex min-w-0 flex-col gap-2 rounded-xl border border-border/70 bg-card/90 p-2 shadow-lg backdrop-blur-xl sm:right-auto sm:max-w-[calc(100%-12rem)] lg:flex-row lg:items-center">
          <div className="flex min-w-0 w-full items-center gap-2 lg:w-auto lg:flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => router.push("/education/mind-maps")}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 lg:min-w-48">
              {distinctSourceTitle(media.title, media.source_title) && (
                <span className="block truncate text-xs text-muted-foreground">
                  from {distinctSourceTitle(media.title, media.source_title)}
                </span>
              )}
              <h1 className="truncate text-lg font-semibold text-foreground">
                {media.title}
              </h1>
            </div>
          </div>
          <MindMapNodeSearch envelope={media.ir_envelope} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
          <div className="flex w-full flex-wrap items-center gap-1 lg:w-auto lg:flex-nowrap">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/education/mind-maps/${media.id}/edit`)}>
                <Pencil className="mr-1 h-4 w-4" /> Edit
              </Button>
            )}
            {isOwner && (
              <div className="flex items-center gap-1">
                <ShareButton
                  resourceType="study_media"
                  resourceId={media.id}
                  resourceName={media.title}
                  isOwner
                  size="sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    router.push(
                      media.source_kind === "topic"
                        ? "/education/mind-maps/new?source=topic"
                        : `/education/mind-maps/new?source=deck&deck=${media.source_id ?? ""}`,
                    )
                  }
                  aria-label="Regenerate"
                >
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  aria-label="Move to Trash"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            )}
            {trust && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                onClick={() => setSourcesOpen(true)}
              >
                <ConfidenceBadge confidence={trust.confidence} />
                <span className="hidden sm:inline">Sources</span>
              </Button>
            )}
          </div>
        </div>

        {/* Where this came from + the rest of the kit made from the same upload. */}
        {media && (
          <MadeFromSource entityType="study_media" entityId={media.id} />
        )}

        {trust && (
          <MatrxDynamicPanelHost
            open={sourcesOpen}
            onOpenChange={setSourcesOpen}
            title={
              <span className="flex items-center gap-2">
                Grounded in
                <ConfidenceBadge confidence={trust.confidence} />
              </span>
            }
            position="right"
            defaultSize={32}
            minSize={24}
            contentClassName="flex min-h-0 flex-1 flex-col p-4"
          >
            <SourceCitations trust={trust} />
          </MatrxDynamicPanelHost>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
