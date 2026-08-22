/**
 * Reassemble the sliced `render_block` frames of a workflow run's ephemeral
 * `node_stream` channel.
 *
 * A canonical render block is a FULL snapshot of one block — content, data
 * and metadata — and routinely exceeds the 8000-byte pg_notify cap the
 * workflow wire runs on. The server therefore slices one event across
 * consecutive frames sharing a `frame_id`, ordered by `frame_index`, and
 * `publish_ephemeral` silently DROPS anything oversize — so a frame set that
 * never completes is a real possibility, and half a JSON document must never
 * reach a renderer.
 *
 * The rules, all of them defensive by contract (a malformed frame degrades
 * that block to "no live typed rendering" and never breaks the run view):
 *   - a set completes only when all `frame_count` slices are present;
 *   - a completed or unparseable set is dropped from the buffer immediately;
 *   - abandoned sets are evicted oldest-first at `MAX_OPEN_FRAME_SETS`, so a
 *     dropped tail frame cannot leak memory for the life of a run page.
 *
 * Producer: `aidream/services/runtime/workflow_events.py`
 * (`ProgressTrackingEmitter._publish_render_block`).
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import type { NodeStreamEvent } from "../types";

/** Frame sets held open at once before the oldest is abandoned. */
export const MAX_OPEN_FRAME_SETS = 32;

interface OpenSet {
  count: number;
  slices: Map<number, string>;
}

export class RenderBlockFrameAssembler {
  private open = new Map<string, OpenSet>();

  /**
   * Feed one `kind: "render_block"` frame. Returns the completed block when
   * this frame closed its set, otherwise null.
   */
  push(event: NodeStreamEvent): RenderBlockPayload | null {
    const frameId = event.frame_id;
    if (!frameId) return null;
    const count = event.frame_count ?? 1;
    const index = event.frame_index ?? 0;
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index)) {
      return null;
    }

    let set = this.open.get(frameId);
    if (!set) {
      if (this.open.size >= MAX_OPEN_FRAME_SETS) {
        // Insertion order — the oldest incomplete set is the abandoned one.
        const oldest = this.open.keys().next();
        if (!oldest.done) this.open.delete(oldest.value);
      }
      set = { count, slices: new Map() };
      this.open.set(frameId, set);
    }
    set.slices.set(index, event.delta);
    if (set.slices.size < set.count) return null;

    this.open.delete(frameId);
    let body = "";
    for (let i = 0; i < set.count; i++) {
      const slice = set.slices.get(i);
      if (slice === undefined) return null;
      body += slice;
    }
    return parseRenderBlock(body);
  }

  /** Open (incomplete) frame sets — diagnostics and tests. */
  get openCount(): number {
    return this.open.size;
  }
}

function parseRenderBlock(body: string): RenderBlockPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const candidate = parsed as Partial<RenderBlockPayload>;
  if (typeof candidate.blockId !== "string" || candidate.blockId.length === 0) {
    return null;
  }
  if (typeof candidate.type !== "string") return null;
  return parsed as RenderBlockPayload;
}
