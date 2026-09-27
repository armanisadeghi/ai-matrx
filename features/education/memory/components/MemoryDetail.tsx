"use client";

// features/education/memory/components/MemoryDetail.tsx
//
// A stored memory-aid set: the mnemonics/analogies/palace view + its trust
// sources + edit controls for authorized collaborators, and owner-only
// regenerate / delete / share controls. Mirrors MindMapDetail.

import { useEffect, useRef, useState } from "react";
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
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationMemoryScope } from "@/features/surfaces/manifests/education-memory.manifest";
import MemoryAidBlock from "@/components/mardown-display/blocks/memory-aid/MemoryAidBlock";
import { coerceMemoryAid } from "@/features/content-ir/kinds/memory-aid";
import { MemoryEditor } from "./MemoryEditor";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { parseCreateMemoryAids, parseMemoryIds, parseUpdateMemoryAids } from "../memoryWrites";
import { ContentFindControl } from "@/features/rich-document/search/ContentFindControl";

const SURFACE_NAME = "matrx-user/education-memory";

export function MemoryDetail({ mediaId, edit = false }: { mediaId: string; edit?: boolean }) {
  const router = useRouter();
  const [media, setMedia] = useState<StudyMediaRow | null>(null);
  const [loading, setLoading] = useState(true);
  // The raw failure, never a sentence — the access gate decides what it means.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const access = useAccess("study_media", mediaId);
  const { isOwner } = access;
  const canEdit = !access.loading && canEditAccess(access.level);
  const getWriteHandlers = () => collectionWriteHandlers({
    plural: "memory_aids", singular: "memory aid",
    create: {
      parse: parseCreateMemoryAids,
      run: async (aid) => {
        const result = await studyMediaService.create({ mediaKind: "memory_aid", title: aid.title,
          irEnvelope: aid, status: "ready" });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not create memory aid.");
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (aid) => aid.title,
    },
    update: {
      parse: (value) => parseUpdateMemoryAids(value, canEdit && media ? [media] : []),
      run: async (plan) => {
        const result = await studyMediaService.updateVersioned(plan.id, plan.version, { title: plan.aid.title, ir_envelope: plan.aid });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not update memory aid.");
        setMedia(result.data);
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (plan) => plan.aid.title, changedOf: (plan) => plan.changed,
    },
    delete: {
      parse: (value) => parseMemoryIds(value, "delete_memory_aids", isOwner && media ? [media] : []).map(() => {
        if (!media) throw new Error("The memory aid is no longer available.");
        return media;
      }),
      run: async (row) => {
        const result = await studyMediaService.softDelete(row.id);
        if (result.error) throw new Error(result.error);
        router.push("/education/memory");
        return { id: row.id, name: row.title };
      }, nameOf: (row) => row.title,
    },
  }, refuseSurfaceWrite);

  // Read at trigger time, never from stale closure state. `/[id]/edit` renders
  // this same component behind a requireAccess gate and reports `detail`.
  const buildScope = () => {
    const aid = media ? coerceMemoryAid(media.ir_envelope) : null;
    const aidTrust = media ? coerceTrustEnvelope({ trust: media.trust }) : null;
    return createEducationMemoryScope({
      view: "detail",
      aid_id: mediaId,
      aid_loaded: !loading && !!media,
      aid_is_owner: isOwner,
      ...(media
        ? {
            aid_title: media.title,
            ...(media.source_kind ? { aid_source_kind: media.source_kind } : {}),
            ...(media.source_title
              ? { aid_source_title: media.source_title }
              : {}),
            ...(media.source_id ? { aid_source_id: media.source_id } : {}),
          }
        : {}),
      ...(aid
        ? {
            ...(aid.strategy_note ? { aid_strategy_note: aid.strategy_note } : {}),
            mnemonics: aid.mnemonics,
            analogies: aid.analogies,
            memory_palace: aid.memory_palace as unknown as Record<
              string,
              unknown
            >,
            aid_content: aid as unknown as Record<string, unknown>,
          }
        : {}),
      ...(aidTrust
        ? {
            aid_confidence: aidTrust.confidence,
            aid_citations: aidTrust.citations,
          }
        : {}),
    });
  };

  useEffect(() => {
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
  }, [mediaId, reloadKey]);

  async function handleDelete() {
    if (!media) return;
    const ok = await confirm({
      title: "Delete these memory aids?",
      description:
        "They will be removed from your library. This can't be undone.",
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
    router.push("/education/memory");
  }

  // The runtime is mounted on EVERY branch, including loading and not-found —
  // `aid_loaded: false` is a declared, honest value, and an agent launched
  // mid-load should still resolve this surface rather than fall back to the
  // empty-scope path.
  if (loading) {
    return (
      <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope} getWriteHandlers={getWriteHandlers}>
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  if (!media) {
    return (
      <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope} getWriteHandlers={getWriteHandlers}>
        {/* Denied / deleted / never existed / signed-out all read as zero rows here. */}
        <AccessGate
          token="study_media"
          id={mediaId}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          fallbackHref="/education/memory"
          fallbackLabel="Memory Aids"
        />
      </SurfaceRuntimeProvider>
    );
  }

  const trust = coerceTrustEnvelope({ trust: media.trust });

  if (edit) return <MemoryEditor media={media} isOwner={isOwner} />;

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope} getWriteHandlers={getWriteHandlers}>
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => router.push("/education/memory")}
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
          <h1
            className="truncate text-lg font-semibold text-foreground"
            data-surface-value="aid_title"
          >
            {media.title}
          </h1>
        </div>
        <ContentFindControl rootRef={contentRef} label="Find in memory aids" />
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => router.push(`/education/memory/${media.id}/edit`)}>
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </Button>
            {isOwner && <>
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
                    ? "/education/memory/new?source=topic"
                    : `/education/memory/new?source=deck&deck=${media.source_id ?? ""}`,
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
            </>}
          </div>
        )}
      </div>

      <div ref={contentRef} data-surface-value="aid_content">
        {/* THE CANONICAL COMPONENT LAW: the registered `memory_aid` kind renders
            through its ONE kind component — the same pixels as the live run
            window and chat. */}
        <MemoryAidBlock serverData={media.ir_envelope} />
      </div>

      {/* Where this came from + the rest of the kit made from the same upload. */}
      <MadeFromSource entityType="study_media" entityId={media.id} />

      {trust && (
        <div
          className="space-y-2 rounded-xl border border-border bg-card/60 p-4"
          data-surface-value="aid_citations"
        >
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
