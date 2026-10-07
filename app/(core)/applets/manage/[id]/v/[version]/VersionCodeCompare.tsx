"use client";

// Client island for the applet version snapshot page (a Server Component):
// opens the canonical diff window comparing this version's code with the
// current app code. Snapshot = baseline (old), current = new.

import { GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";

export function VersionCodeCompare({
  snapshotCode,
  currentCode,
  language,
  snapshotVersion,
}: {
  snapshotCode: string;
  currentCode: string;
  language: string;
  snapshotVersion: number;
}) {
  const openDiff = useOpenDiffViewerWindow();
  if (!snapshotCode || !currentCode || snapshotCode === currentCode) {
    return null;
  }
  return (
    <Button
      icon={<GitCompareArrows />}
      variant="outline"
      onClick={() =>
        openDiff({
          original: snapshotCode,
          modified: currentCode,
          originalLabel: `v${snapshotVersion}`,
          modifiedLabel: "Current",
          title: "Version code diff",
          engine: "monaco",
          language,
          defaultView: "split",
        })
      }
    >
      Compare with current
    </Button>
  );
}
