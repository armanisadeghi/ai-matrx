// features/education/onboard/startSurfaceScope.ts
//
// Builds the `matrx-user/education-start` scope from what StartHero already
// holds in render state (the form's useState values and useKitGeneration).
// Synchronous and fetch-free: the Surface Context window polls getScope every
// 400 ms. Run values are omitted until the build has produced them.

import { createEducationStartScope } from "@/features/surfaces/manifests/education-start.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { CoverageDepth } from "@/features/education/convert/coverage";
import type { TargetKind } from "@/features/education/convert/types";
import { kitHref } from "@/features/education/kits/kitService";
import { describeIngestSupport } from "./formatSupport";
import type { UseKitGeneration } from "./useKitGeneration";
import type { StoredFileInput } from "./types";

export function buildEducationStartScope(input: {
  mode: string;
  file: File | null;
  stored: StoredFileInput | null;
  pasteText: string;
  url: string;
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
  const fileSupport = input.file ? describeIngestSupport(input.file) : null;
  const started = kit.phase !== "idle" && kit.targets.length > 0;
  const anchor = kit.source?.ref?.fileId;

  return createEducationStartScope({
    kit_request_draft: {
      input_mode: input.mode,
      paste_text: input.pasteText,
      url: input.url,
      file_id: input.stored?.fileId ?? null,
      outputs: input.options.filter((o) => input.selected.has(o.kind)).map((o) => o.kind),
      depth: input.depth,
      count: Number.isFinite(requested) && requested > 0 ? requested : null,
      focus: input.focus,
    },
    output_options: input.options.map((o) => ({
      ...o,
      selected: input.selected.has(o.kind),
    })),
    can_build: input.canBuild,
    kit_phase: kit.phase,
    ...(input.file && fileSupport
      ? {
          chosen_file: {
            name: input.file.name,
            size_bytes: input.file.size,
            supported: fileSupport.supported,
            note: fileSupport.note,
          },
        }
      : {}),
    ...(input.stored
      ? {
          stored_file: {
            file_id: input.stored.fileId,
            file_name: input.stored.fileName,
            mime_type: input.stored.mimeType,
            supported: describeIngestSupport({
              name: input.stored.fileName,
              type: input.stored.mimeType,
            }).supported,
          },
        }
      : {}),
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
            input_kind: kit.source.meta.inputKind,
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
