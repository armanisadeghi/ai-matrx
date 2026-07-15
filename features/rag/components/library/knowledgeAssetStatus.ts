import type {
  DeriveEstimate,
  DeriveKind,
  DerivationRollup,
  DerivationRun,
} from "@/features/rag/api/derivations";
import type { OpState } from "@/features/rag/hooks/useKnowledgeAssetRunner";
import type { PageVerificationSummary } from "@/features/rag/hooks/usePageVerificationSummary";

export interface RepresentationState {
  started: boolean;
  complete: boolean;
  resumable: boolean;
}

/** Resolve card actions from durable output plus the latest persisted run.
 * Partial/failed/cancelled work always prefers Resume; Rebuild is reserved for
 * a representation that is known complete. */
export function getRepresentationState({
  kind,
  rollup,
  op,
  estimate,
  verification,
  latestRun,
}: {
  kind: DeriveKind;
  rollup: DerivationRollup | undefined;
  op: OpState;
  estimate: DeriveEstimate | undefined;
  verification?: PageVerificationSummary;
  latestRun: DerivationRun | undefined;
}): RepresentationState {
  const persisted =
    kind === "page_verification"
      ? (verification?.verified ?? 0)
      : (rollup?.chunk_count ?? 0);
  const completedScope =
    kind === "page_verification"
      ? (verification?.verified ?? 0)
      : (rollup?.completed_items ?? persisted);
  const runProgress = Math.max(
    op.current,
    op.chunksWritten,
    latestRun?.current ?? 0,
    latestRun?.chunks_written ?? 0,
  );
  const started = persisted > 0 || runProgress > 0;
  const interrupted =
    op.status === "failed" ||
    op.status === "cancelled" ||
    latestRun?.status === "failed" ||
    latestRun?.status === "cancelled";

  let complete = false;
  if (!interrupted && estimate && estimate.items > 0) {
    if (kind === "page_verification") {
      complete = completedScope >= estimate.items;
    } else if (
      kind === "table_row" ||
      kind === "page_image_caption" ||
      kind === "section_summary" ||
      kind === "synthetic_qa"
    ) {
      complete = completedScope >= estimate.items;
    }
  }
  if (!interrupted && !complete && (!estimate || estimate.items === 0)) {
    complete = op.status === "completed" || latestRun?.status === "completed";
  }
  // Multi-granularity has two fixed lanes rather than item-keyed output.
  if (!interrupted && kind === "multigranularity") {
    complete =
      completedScope >= 2 ||
      op.status === "completed" ||
      latestRun?.status === "completed";
  }

  return {
    started,
    complete,
    resumable: started && !complete && op.status !== "running",
  };
}
