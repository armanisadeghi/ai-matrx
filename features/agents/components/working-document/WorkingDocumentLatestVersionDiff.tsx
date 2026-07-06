"use client";

/**
 * WorkingDocumentLatestVersionDiff — the reload-safe fallback for the drawer's
 * agent-diff view. When there is no LIVE agent patch in this session's tool
 * lifecycle (a fresh turn, or the page was reloaded), the "what changed" view
 * falls back to the durable DB history: the document's previous version →
 * current content. So the user can always see the last edit, even after reload.
 *
 * Uses the same single-pane reader (`AnimatedDiffReveal`, non-animated) as the
 * live view for a consistent look. Empty/first-version docs show a gentle hint.
 */

import { useEffect, useState } from "react";
import { GitCompare, Loader2 } from "lucide-react";

import { AnimatedDiffReveal } from "@/components/diff/text/AnimatedDiffReveal";
import { useWorkingDocumentVersions } from "./useWorkingDocumentVersions";

interface WorkingDocumentLatestVersionDiffProps {
  documentId: string | null;
  /** The document's current live content (the diff's "after"). */
  currentContent: string;
}

export function WorkingDocumentLatestVersionDiff({
  documentId,
  currentContent,
}: WorkingDocumentLatestVersionDiffProps) {
  const { versions, loading, error, getContent } =
    useWorkingDocumentVersions(documentId);

  const [before, setBefore] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Versions are newest-first (index 0 = current), so the previous version is
  // index 1. Diff it against the live content.
  const previousVersion = versions.length >= 2 ? versions[1].version : null;

  useEffect(() => {
    if (previousVersion == null) {
      setBefore(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    getContent(previousVersion)
      .then((content) => {
        if (!cancelled) setBefore(content ?? "");
      })
      .catch(() => {
        if (!cancelled) setBefore(null);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previousVersion, getContent]);

  if (loading || resolving) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading changes…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-6 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (before !== null) {
    return (
      <div className="h-full min-h-0 overflow-auto bg-background px-4 py-3">
        <AnimatedDiffReveal
          before={before}
          after={currentContent}
          reveal={{ active: false, replayKey: `wd-latest-${previousVersion}` }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-6 text-center">
      <GitCompare className="h-7 w-7 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        No recent agent edits to show. Open version history to review earlier
        changes.
      </p>
    </div>
  );
}

export default WorkingDocumentLatestVersionDiff;
