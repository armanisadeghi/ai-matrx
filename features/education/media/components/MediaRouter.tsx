"use client";

// features/education/media/components/MediaRouter.tsx
//
// The canonical shareable viewer for a study-media artifact (`/education/media/[id]`
// — the URL every share link resolves to). Loads the row once and dispatches to
// the audio or mind-map surface by `media_kind`. Access is RLS-enforced; a viewer
// who can't see the row gets the not-found state.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AudioStudyDetail } from "../audio/components/AudioStudyDetail";
import { MindMapDetail } from "../mindmap/components/MindMapDetail";
import { MemoryDetail } from "@/features/education/memory/components/MemoryDetail";
import { SummaryDetail } from "@/features/education/onboard/components/SummaryDetail";
import { studyMediaService } from "../service";
import type { EduMediaKind } from "../types";

export function MediaRouter({ mediaId }: { mediaId: string }) {
  const [kind, setKind] = useState<EduMediaKind | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    studyMediaService.getById(mediaId).then((res) => {
      if (!active) return;
      setKind((res.data?.media_kind as EduMediaKind) ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [mediaId]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (kind === "mind_map") return <MindMapDetail mediaId={mediaId} />;
  if (kind === "memory_aid") return <MemoryDetail mediaId={mediaId} />;
  // A 'summary' row used to fall through to the audio player — the reverse-
  // lineage chips and the class hub both route study_media through this URL
  // (features/education/data/entityRoutes.ts), so every summary opened from
  // one of those rendered an empty podcast surface. Dispatch it properly.
  if (kind === "summary") return <SummaryDetail id={mediaId} />;
  return <AudioStudyDetail mediaId={mediaId} />;
}
