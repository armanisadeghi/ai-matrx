"use client";

// features/education/media/mindmap/components/MindMapDetail.tsx
//
// A stored mind map: the interactive concept map + its trust sources + owner
// controls (regenerate / delete / share). Read-only for non-owners (the shared
// viewer). React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Network, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { useAccess } from "@/utils/permissions/access";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationMindMapsScope } from "@/features/surfaces/manifests/education-mind-maps.manifest";
import { studyMediaService } from "../../service";
import type { StudyMediaRow } from "../../types";
import { MindMapView } from "./MindMapView";

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

export function MindMapDetail({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const [media, setMedia] = useState<StudyMediaRow | null>(null);
  const [loading, setLoading] = useState(true);
  const { isOwner } = useAccess("study_media", mediaId);

  useEffect(() => {
    let active = true;
    setLoading(true);
    studyMediaService.getById(mediaId).then((res) => {
      if (!active) return;
      setMedia(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [mediaId]);

  async function handleDelete() {
    if (!media) return;
    const ok = await confirm({
      title: "Delete this mind map?",
      description:
        "It will be removed from your library. This can't be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await studyMediaService.softDelete(media.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Deleted");
    router.push("/education/mind-maps");
  }

  const trust = media ? coerceTrustEnvelope({ trust: media.trust }) : null;
  const diagram = media ? readDiagramShape(media.ir_envelope) : null;
  const mapConfig = media ? readMapConfig(media.config) : {};

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
              ...(media.description
                ? { mind_map_description: media.description }
                : {}),
              mind_map_status: media.status,
              ...(media.source_kind ? { map_source_kind: media.source_kind } : {}),
              ...(media.source_title
                ? { map_source_title: media.source_title }
                : {}),
              ...(media.source_id ? { map_source_id: media.source_id } : {}),
              ...(mapConfig.hint ? { map_focus_hint: mapConfig.hint } : {}),
              ...(media.diagram_kind ? { diagram_kind: media.diagram_kind } : {}),
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
              map_visibility: media.visibility,
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
      >
        <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-80 w-full" />
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  if (!media) {
    return (
      <SurfaceRuntimeProvider
        surfaceName="matrx-user/education-mind-maps"
        getScope={getScope}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 p-10 text-center">
          <Network className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This mind map doesn&apos;t exist or you don&apos;t have access.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/education/mind-maps")}
          >
            Back to Mind Maps
          </Button>
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-mind-maps"
      getScope={getScope}
    >
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => router.push("/education/mind-maps")}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          {media.source_title && (
            <span className="truncate text-xs text-muted-foreground">
              from {media.source_title}
            </span>
          )}
          <h1 className="truncate text-lg font-semibold text-foreground">
            {media.title}
          </h1>
        </div>
        {isOwner && (
          <div className="flex shrink-0 items-center gap-1">
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
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>

      <MindMapView envelope={media.ir_envelope} mapTrust={trust} />

      {trust && (
        <div className="space-y-2 rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              Grounded in
            </span>
            <ConfidenceBadge confidence={trust.confidence} />
          </div>
          <SourceCitations trust={trust} />
        </div>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}
