import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { readArtifactPointerId } from "./artifactId";

/**
 * resolveArtifactData — turn a canvas `content.data` value into REAL content.
 *
 * A materialized artifact keeps only `{ artifactId }` in the canvas slice (the
 * body lives in the `canvas_items` row), and the in-app renderers resolve that
 * pointer by id. Anything that COPIES `content.data` somewhere the pointer can
 * no longer be resolved — a published snapshot, an export — must resolve it
 * first, or it ships an empty page.
 *
 * Returns `data` unchanged when it is already real content. Throws when the
 * pointer cannot be resolved: a share that would publish nothing must fail
 * loudly, never silently succeed.
 */
export async function resolveArtifactData(data: unknown): Promise<unknown> {
  const artifactId = readArtifactPointerId(data);
  if (!artifactId) return data;

  const row = await canvasArtifactService.getById(artifactId);
  const content = row?.content;
  if (!content || typeof content !== "object" || !("data" in content)) {
    throw new Error(
      "Could not load this artifact's content — nothing to publish.",
    );
  }

  const resolved = (content as { data?: unknown }).data;
  if (resolved === undefined || resolved === null || resolved === "") {
    throw new Error(
      "Could not load this artifact's content — nothing to publish.",
    );
  }
  return resolved;
}
