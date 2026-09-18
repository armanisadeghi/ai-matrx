/**
 * map_topic_proposal_v1 / map_topic_node_v1 — the compiled kind (Lane G, R12).
 *
 * Three legs, on the REAL machinery:
 *   1. STRUCTURAL — the documented proposal passes `validateStructuralLeg`
 *      against the emitted JSON Schema the real converter produces from the
 *      compiled floor (the live rows are the schema of record; the floor must
 *      at least accept what map-author.ts documents).
 *   2. RENDER — the complete-only bridge hands the component the value
 *      VERBATIM: `__kind` present on the root AND on every node (the marker
 *      law), the topics list untouched, and a `map_id` the payload carried.
 *   3. REGISTRATION — the kind is in SYSTEM_KIND_DEFINITIONS with the render
 *      key the dispatch table resolves, in the `shape` bucket.
 *
 * Watched failing first: with `KIND_KEY` stripped in the bridge, leg 2's
 * every-node check fails; with the dispatch entry removed, leg 3 fails.
 */

import {
  envelopeFromCompleteValue,
  KIND_KEY,
  kindSchemaToJsonSchema,
  validateStructuralLeg,
  type KindSchema,
} from "@ai-matrx/content-ir";

import {
  BLOCK_DISPATCH_CLASSIFICATION,
  resolveBlockDispatch,
} from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";
import { DOCUMENTED_PROPOSAL } from "@/features/marketing/seo/topical-map/proposals/__fixtures__/mapTopicProposalDocumented";

import {
  MAP_TOPIC_NODE_KIND,
  MAP_TOPIC_PROPOSAL_BLOCK_TYPE,
  MAP_TOPIC_PROPOSAL_KIND,
  mapTopicNodeKindSchema,
  mapTopicProposalKindSchema,
  mapTopicProposalMarkdownFromValue,
  mapTopicProposalServerDataFromEnvelope,
} from "../kinds/map-topic-proposal";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";

const SCHEMAS: Record<string, KindSchema> = {
  [MAP_TOPIC_PROPOSAL_KIND]: mapTopicProposalKindSchema,
  [MAP_TOPIC_NODE_KIND]: mapTopicNodeKindSchema,
};
const resolve = (kind: string): KindSchema | undefined => SCHEMAS[kind];

describe("map_topic_proposal_v1 — structural leg", () => {
  it("the documented proposal passes the converter-emitted schema", () => {
    const exported = kindSchemaToJsonSchema(MAP_TOPIC_PROPOSAL_KIND, resolve, {
      strict: true,
      injectKind: false,
    });
    expect(exported).not.toBeNull();
    expect(exported?.unresolved).toEqual([]);
    const result = validateStructuralLeg(
      DOCUMENTED_PROPOSAL as unknown as Record<string, unknown>,
      exported!.schema as Record<string, unknown>,
    );
    expect(result.detail).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});

describe("map_topic_proposal_v1 — render leg (the bridge)", () => {
  it("hands the component the value verbatim, markers on the root and every node", () => {
    const envelope = envelopeFromCompleteValue(
      { ...DOCUMENTED_PROPOSAL, map_id: "ff2010ec-f53d-4d8b-81d9-094c4ca73397" },
      MAP_TOPIC_PROPOSAL_KIND,
    );
    const serverData = mapTopicProposalServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();
    expect(serverData!.map_id).toBe("ff2010ec-f53d-4d8b-81d9-094c4ca73397");
    const proposal = serverData!.proposal;
    expect(proposal[KIND_KEY]).toBe(MAP_TOPIC_PROPOSAL_KIND);
    const topics = proposal.topics as Record<string, unknown>[];
    expect(topics).toHaveLength(DOCUMENTED_PROPOSAL.topics.length);
    for (const node of topics) expect(node[KIND_KEY]).toBe(MAP_TOPIC_NODE_KIND);
    expect(topics.map((t) => t.slug)).toEqual(DOCUMENTED_PROPOSAL.topics.map((t) => t.slug));
  });

  it("declines a payload with no topics list, accepts an EMPTY one", () => {
    expect(
      mapTopicProposalServerDataFromEnvelope(
        envelopeFromCompleteValue({ [KIND_KEY]: MAP_TOPIC_PROPOSAL_KIND, summary: "x" }, MAP_TOPIC_PROPOSAL_KIND),
      ),
    ).toBeUndefined();
    const empty = mapTopicProposalServerDataFromEnvelope(
      envelopeFromCompleteValue(
        { [KIND_KEY]: MAP_TOPIC_PROPOSAL_KIND, summary: "", source_kind: "data", topics: [], coverage_notes: "n" },
        MAP_TOPIC_PROPOSAL_KIND,
      ),
    );
    expect(empty?.proposal.topics).toEqual([]);
    expect(empty?.map_id).toBeNull();
  });

  it("renders markdown as an indented outline in tree order", () => {
    const md = mapTopicProposalMarkdownFromValue(DOCUMENTED_PROPOSAL as unknown as Record<string, unknown>);
    expect(md).toContain("# Proposed topical map");
    expect(md.indexOf("**Metals**")).toBeLessThan(md.indexOf("**Copper**"));
    expect(md).toContain("    - **Copper** `metals-copper` (proposed)");
    expect(md).toContain("## Still to settle");
  });
});

describe("map_topic_proposal_v1 — registration", () => {
  it("is compiled in with the render key the dispatch table resolves as a shape", () => {
    const def = SYSTEM_KIND_DEFINITIONS.find((d) => d.kind === MAP_TOPIC_PROPOSAL_KIND);
    expect(def?.legacyBlockType).toBe(MAP_TOPIC_PROPOSAL_BLOCK_TYPE);
    expect(SYSTEM_KIND_DEFINITIONS.some((d) => d.kind === MAP_TOPIC_NODE_KIND)).toBe(true);
    expect(resolveBlockDispatch(MAP_TOPIC_PROPOSAL_BLOCK_TYPE)).not.toBeNull();
    expect(BLOCK_DISPATCH_CLASSIFICATION.shape).toContain(MAP_TOPIC_PROPOSAL_BLOCK_TYPE);
  });
});
