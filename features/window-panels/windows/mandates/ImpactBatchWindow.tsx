"use client";

/**
 * ImpactBatchWindow — Agent Change Impact's batch panel (I5), floating over
 * whatever surface made the change.
 *
 * 🚨 A PANEL WRAPS THE CANONICAL COMPONENT (features/window-panels/FEATURE.md):
 * the whole body is `ImpactBatchPanel` — the same component the
 * deprecated-models bulk replace embeds in its confirm step. This file is the
 * SHELL only: the window chrome, the scope it restores from, and its title.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ImpactBatchPanel } from "@/features/mandates/admin/ImpactBatchPanel";
import type {
  ImpactBatchWindowDelta,
  ImpactBatchWindowMode,
} from "@/features/overlays/openers/impactBatchWindow";

export interface ImpactBatchWindowProps {
  isOpen?: boolean;
  onClose?: () => void;
  agentIds: string[];
  mode: ImpactBatchWindowMode;
  delta?: ImpactBatchWindowDelta | null;
  batchLabel?: string;
  sourceSentence?: string;
  preselectedRungIds?: string[];
  surfaceName?: string;
}

export default function ImpactBatchWindow(props: ImpactBatchWindowProps) {
  if (props.isOpen === false) return null;
  return <ImpactBatchWindowInner {...props} />;
}

function ImpactBatchWindowInner({
  onClose,
  agentIds,
  mode,
  delta,
  batchLabel,
  sourceSentence,
  preselectedRungIds,
  surfaceName,
}: ImpactBatchWindowProps) {
  const label = batchLabel ?? (mode === "dry_run" ? "Preview" : "Batch");
  const collectData = (): Record<string, unknown> => ({
    agentIds,
    mode,
    delta: delta ?? null,
    batchLabel: batchLabel ?? null,
    sourceSentence: sourceSentence ?? null,
    preselectedRungIds: preselectedRungIds ?? null,
    surfaceName: surfaceName ?? null,
  });
  return (
    <WindowPanel
      title={mode === "dry_run" ? "Change impact — preview" : "Change impact"}
      id="impact-batch-window"
      minWidth={520}
      minHeight={360}
      width={1080}
      height={680}
      position="center"
      onClose={onClose}
      overlayId="impactBatchWindow"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <ImpactBatchPanel
        agentIds={agentIds}
        mode={mode}
        delta={delta ?? null}
        batchLabel={label}
        sourceSentence={sourceSentence ?? null}
        preselectedRungIds={preselectedRungIds}
        surfaceName={surfaceName ?? null}
      />
    </WindowPanel>
  );
}
