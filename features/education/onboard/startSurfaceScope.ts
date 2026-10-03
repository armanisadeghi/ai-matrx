// features/education/onboard/startSurfaceScope.ts
//
// Builds the `matrx-user/education-start` scope from what StartHero already
// holds in render state (the picked Sources, the form's useState values and
// useKitGeneration).
// Synchronous and fetch-free: the Surface Context window polls getScope every
// 400 ms. Run values are omitted until the build has produced them.

import { createEducationStartScope } from "@/features/surfaces/manifests/education-start.manifest";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import type { CoverageDepth } from "@/features/education/convert/coverage";
import type { TargetKind } from "@/features/education/convert/types";
import { kitHref } from "@/features/education/kits/kitService";
import type { SourceCardModel } from "@ai-matrx/agents/sources/runtime";
import { sourceKindNoun } from "@/features/resource-manager/source-input/sourceKinds";
import type { UseKitGeneration } from "./useKitGeneration";

export function buildEducationStartScope(input: {
  sources: readonly SourceCardModel[];
  selected: ReadonlySet<TargetKind>;
  options: { kind: TargetKind; label: string; available: boolean }[];
  depth: CoverageDepth;
  count: string;
  focus: string;
  canBuild: boolean;
  kit: Pick<
    UseKitGeneration,
    "phase" | "error" | "ingestProgress" | "kitTitle" | "source" | "targets"
  >;
}): SurfaceScopePayload {
  const { kit } = input;
  const requested = Number.parseInt(input.count, 10);
  const started = kit.phase !== "idle" && kit.targets.length > 0;
  const anchor = kit.source?.ref?.fileId;

  return createEducationStartScope({
    kit_request_draft: {
      sources: input.sources.map((c) => ({
        name: c.draft.label,
        kind: sourceKindNoun(c.draft),
        status: c.status,
        resource_type: c.draft.ref?.resource_type ?? null,
        resource_id: c.draft.ref?.resource_id ?? null,
        error: c.error ?? null,
      })),
      outputs: input.options.filter((o) => input.selected.has(o.kind)).map((o) => o.kind),
      depth: input.depth,
      count: Number.isFinite(requested) && requested > 0 ? requested : null,
      focus: input.focus,
    },
    output_options: input.options.map((o) => ({
      ...o,
      selected: input.selected.has(o.kind),
    })),
    available_outputs: input.options.filter((o) => o.available).map((o) => o.kind),
    can_build: input.canBuild,
    kit_phase: kit.phase,
    ...(kit.phase === "error" && kit.error ? { kit_error: kit.error } : {}),
    ...(kit.ingestProgress
      ? {
          ingest_progress: {
            phase: kit.ingestProgress.phase,
            message: kit.ingestProgress.message,
            ratio: kit.ingestProgress.ratio ?? null,
            detail: kit.ingestProgress.detail ?? null,
          },
        }
      : {}),
    ...(kit.kitTitle
      ? { kit_title: { title: kit.kitTitle.title, named: kit.kitTitle.named } }
      : {}),
    ...(kit.source
      ? {
          source_summary: {
            title: kit.source.title,
            source_count: kit.source.meta.sourceCount,
            pages: kit.source.meta.pages ?? null,
            chars: kit.source.meta.chars,
            truncated: !!kit.source.meta.truncated,
            extraction_method: kit.source.meta.extractionMethod ?? null,
            file_id: kit.source.ref.fileId ?? null,
          },
        }
      : {}),
    ...(started
      ? {
          kit_outputs: kit.targets.map((t) => ({
            kind: t.targetKind,
            label: t.label,
            status: t.status,
            title: t.title ?? null,
            href: t.href ?? null,
            artifact_id: t.artifactId ?? null,
            still_generating: !!t.stillGenerating,
            error: t.error ?? null,
            progress: t.coverage ?? null,
          })),
        }
      : {}),
    ...(kit.phase === "done" && anchor ? { kit_href: kitHref("file", anchor) } : {}),
  });
}
