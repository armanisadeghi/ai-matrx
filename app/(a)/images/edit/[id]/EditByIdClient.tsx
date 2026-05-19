"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileName } from "@/features/files/redux/selectors";
import { fileHandler } from "@/features/files/handler/handler";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { Button } from "@/components/ui/button";
import type { ImageSource } from "@/features/image-studio/modes/shared/types";

const EditModeShell = dynamic(
  () =>
    import("@/features/image-studio/modes/edit/EditModeShell").then((m) => ({
      default: m.EditModeShell,
    })),
  { ssr: false },
);

interface Props {
  cloudFileId: string;
  folder?: string;
}

/**
 * Filerobot uses `crossOrigin="Anonymous"` on every image fetch, which
 * fails fast if either (a) the S3 bucket's CORS policy is missing the
 * requesting origin or (b) the signed URL is past its 1-hour TTL after
 * a long session. We pre-verify the URL with the same crossOrigin profile
 * BEFORE mounting Filerobot so failures surface in our own shell as a
 * clean retry affordance — not as Filerobot's bottom-anchored popup.
 *
 * The retry path re-resolves the URL through the handler so any updated
 * signed URL (e.g. after a backend rotation) is picked up automatically.
 */
type LoadState =
  | { kind: "testing" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

export default function EditByIdClient({ cloudFileId, folder }: Props) {
  const baseUrl = useFileSrc({ kind: "file_id", fileId: cloudFileId });
  const fileName = useAppSelector((s) => selectFileName(s, cloudFileId));
  const [state, setState] = useState<LoadState>({ kind: "testing" });
  const [attempt, setAttempt] = useState(0);
  const lastTestedRef = useRef<string | null>(null);

  // Probe the image with crossOrigin="Anonymous" — exactly what Filerobot
  // does. If the probe succeeds we're guaranteed Filerobot will too;
  // if it fails we fall back to a refreshed URL once before surfacing
  // an error.
  useEffect(() => {
    if (!baseUrl) {
      setState({ kind: "testing" });
      return;
    }
    let cancelled = false;
    setState({ kind: "testing" });

    const probe = async (url: string, isRetry: boolean) => {
      const ok = await testImageLoad(url);
      if (cancelled) return;
      if (ok) {
        lastTestedRef.current = url;
        setState({ kind: "ready", url });
        return;
      }
      if (isRetry) {
        setState({
          kind: "error",
          message:
            "Couldn't load this image. The signed URL may have expired, or the S3 bucket isn't returning CORS headers for this origin.",
        });
        return;
      }
      // First failure → ask the handler for a fresh-resolve and retry.
      try {
        const refreshed = await fileHandler.resolve({
          kind: "file_id",
          fileId: cloudFileId,
        });
        const nextUrl = refreshed.url;
        if (!cancelled && nextUrl && nextUrl !== url) {
          await probe(nextUrl, true);
        } else if (!cancelled) {
          // Same URL came back — at least try once more in case the failure
          // was transient.
          await probe(url, true);
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Couldn't refresh the file URL.",
        });
      }
    };

    void probe(baseUrl, false);
    return () => {
      cancelled = true;
    };
  }, [baseUrl, cloudFileId, attempt]);

  const handleRetry = useCallback(() => {
    setAttempt((a) => a + 1);
  }, []);

  if (state.kind === "error") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <p className="text-sm font-medium">Couldn't load this image</p>
          <p className="text-xs text-muted-foreground">{state.message}</p>
          <Button size="sm" variant="outline" onClick={handleRetry} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind !== "ready") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading image…
        </div>
      </div>
    );
  }

  const source: ImageSource = {
    kind: "url",
    url: state.url,
    suggestedFilename: fileName ?? "image",
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-background">
      <EditModeShell
        source={source}
        cloudFileId={cloudFileId}
        defaultFolder={folder ?? "Images/Edited"}
        presentation="page"
      />
    </div>
  );
}

function testImageLoad(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    // Bail out at 12s so a hanging request doesn't lock the page.
    setTimeout(() => done(false), 12_000);
    img.src = url;
  });
}
