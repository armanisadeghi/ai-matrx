"use client";

// features/education/memory/components/MemoryDetail.tsx
//
// A stored memory-aid set: the mnemonics/analogies/palace view + its trust
// sources + owner controls (regenerate / delete / share). Read-only for
// non-owners (the shared viewer). Mirrors MindMapDetail. React Compiler is on.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Brain, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { useAccess } from "@/utils/permissions/access";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";
import { MemoryAidView } from "./MemoryAidView";

export function MemoryDetail({ mediaId }: { mediaId: string }) {
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

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!media) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 p-10 text-center">
        <Brain className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          This memory aid doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/education/memory")}
        >
          Back to Memory Aids
        </Button>
      </div>
    );
  }

  const trust = coerceTrustEnvelope({ trust: media.trust });

  return (
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
          </div>
        )}
      </div>

      <MemoryAidView envelope={media.ir_envelope} />

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
  );
}
