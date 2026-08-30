"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Layout } from "react-resizable-panels";
import { StudioView } from "@/features/transcript-studio/components/StudioView";
import { promoteTranscriptThunk } from "@/features/transcript-studio/redux/transcriptBridge.thunks";
import { fetchTranscriptById } from "@/features/transcripts/service/transcriptsService";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";

interface StudioRouteProps {
  defaultColumnLayout?: Record<string, number>;
  defaultSidebarLayout?: Layout;
}

export function StudioRoute({
  defaultColumnLayout,
  defaultSidebarLayout,
}: StudioRouteProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("session");
  const importTranscriptId = searchParams.get("import");
  const userId = useAppSelector(selectUserId);
  const attemptedImportRef = useRef<string | null>(null);

  useEffect(() => {
    if (!importTranscriptId || !userId) return;
    if (attemptedImportRef.current === importTranscriptId) return;
    attemptedImportRef.current = importTranscriptId;

    let cancelled = false;
    void (async () => {
      const transcript = await fetchTranscriptById(importTranscriptId);
      if (cancelled) return;
      if (!transcript) {
        toast.error(
          "That transcript isn't available — it may have been deleted, or it isn't shared with you.",
        );
        return;
      }

      try {
        const result = await dispatch(
          promoteTranscriptThunk({ transcript, userId }),
        ).unwrap();
        if (!cancelled) {
          router.replace(
            `/transcripts/studio?session=${encodeURIComponent(result.sessionId)}`,
          );
        }
      } catch {
        // The thunk owns the user-facing error and durable diagnostic detail.
      }
    })();

    return () => {
      cancelled = true;
      if (attemptedImportRef.current === importTranscriptId) {
        attemptedImportRef.current = null;
      }
    };
  }, [dispatch, importTranscriptId, router, userId]);

  return (
    <StudioView
      config={{
        containerVariant: "page",
        showSidebar: true,
        showSettings: true,
        initialSessionId,
        defaultColumnLayout,
        defaultSidebarLayout,
      }}
    />
  );
}
