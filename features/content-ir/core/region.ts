/**
 * ContentRegion — the handshake between a host detector and this library.
 *
 * Boundary rule (the answer to the single-root problem): the HOST detector
 * (StreamBlockAccumulator on streams, content-splitter-v2 on DB loads) finds
 * where a structured region begins and ends inside prose; the kind parser
 * owns everything INSIDE the region. A fresh parser is created per region, so
 * "one root object" is true within a region by construction, and multiple
 * blocks per message are just multiple regions.
 *
 * Through Phase 6 the host's fence-close / brace-count logic remains the
 * region-end oracle (bit-level parity with today). In Phase 7 the parser's
 * own frame stack becomes the oracle and the mirrored counters are deleted.
 */

export type RegionFormat = "json";

export type RegionSourceKind = "fence" | "bare";

export interface ContentRegionInit {
  regionId: string;
  format: RegionFormat;
  sourceKind: RegionSourceKind;
}

/** How a region ended. Truncation is a normal outcome, never stream-fatal. */
export type RegionEndReason = "closed" | "truncated" | "aborted";
