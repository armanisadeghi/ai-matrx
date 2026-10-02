/**
 * Content-plan DEEPEN live stream → page_brief kind — pinned with REAL bytes.
 *
 * The chunk texts below are the verbatim `{"e":"c","t":…}` payloads captured
 * from a production POST /content-plan/nodes/{id}/deepen run on 2026-08-13
 * (aidream ce8211b7c: llm_to_pydantic wire_kind="page_brief" + on_delta).
 * The server streams the model's strict-JSON output as ordinary chunks with a
 * leading __kind — this test proves the FE side of that contract: the
 * accumulator opens a bare-JSON region, resolves the page_brief kind, and the
 * finalized block carries a complete metadata.__ir envelope. If either repo
 * drifts (server stops tagging, or the accumulator stops kind-routing bare
 * JSON), this fails with the real traffic shape, not a synthetic one.
 */
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

const PROD_CHUNKS: string[] = [
  "{\"",
  "__kind\":\"page_brief\",\"brief\":[\"Opening section: concise founder/origin story — who",
  " started the practice, when, and the core motivation (e.g., gap in the market, personal experience, mission-",
  "driven reason); keep it human and specific to build immediate trust.\",\"Credentials",
  " & expertise block: list practitioner qualifications, licences, professional memberships, and years of experience; this is the primary E",
  "-E-A-T signal for a services site — be explicit rather than vague.\",\"Philosophy /",
  " approach section: articulate the guiding methodology or values that differentiate this practice from competitors; use first-person or direct",
  " language to make it feel authentic rather than boilerplate.\",\"Team or solo-",
  "practitioner snapshot: if a team exists, include short bios with photos alt-",
  "text guidance and individual credentials; if solo, deepen the founder narrative with a personal anecdote that",
  " illustrates the 'why'.\",\"Social proof anchor: reference any awards, press mentions, notable client",
  " outcomes (anonymised where needed), or volume metrics (e.g., '500+ clients served",
  "') to substantiate claims without fabricating specifics.\",\"Service philosophy tie-in: briefly preview the core service categories",
  " and explain how the about-page values connect to them; include an internal link target to /services",
  " (or equivalent pillar page) to pass link equity.\",\"Location and community connection: name the geographic",
  " area served, any local community involvement, or professional networks — reinforces local E-E-A-T and helps with",
  " geo-targeted discovery.\",\"Clear CTA at page close: direct visitors toward a logical",
  " next step (book a consultation, view services, contact); internal links should point to /contact and the primary services pil",
  "lar route.\",\"Schema guidance: recommend LocalBusiness or Person schema markup with name, founder",
  ", foundingDate, areaServed, and sameAs (professional profile URLs) to support rich results.\",\"Tone direction: convers",
  "ational but authoritative — avoid jargon; write for a first-time visitor who knows nothing about the brand; target ~400-600 words total",
  " for scannability.\"],\"sources\":[],\"primary_keyword_phrase\":null}"
];

function runStream(): Map<string, RenderBlockPayload> {
  const blocks = new Map<string, RenderBlockPayload>();
  const upsert = (payload: { requestId: string; block: RenderBlockPayload }) => ({
    type: "test/upsert",
    payload,
  });
  const dispatch = (action: unknown) => {
    const a = action as { type: string; payload?: { block: RenderBlockPayload } };
    if (a?.payload?.block) blocks.set(a.payload.block.blockId, a.payload.block);
    return action;
  };
  const acc = new StreamBlockAccumulator("req-deepen", upsert as never);
  for (const chunk of PROD_CHUNKS) acc.ingest(chunk, dispatch);
  acc.finalize(dispatch);
  return blocks;
}

describe("deepen live stream (real prod bytes) → page_brief", () => {
  it("kind-resolves the bare-JSON region and finalizes a complete envelope", () => {
    const blocks = runStream();
    const withIr = [...blocks.values()].filter(
      (b) => (b.metadata as Record<string, unknown> | undefined)?.__ir,
    );
    expect(withIr.length).toBeGreaterThan(0);
    const ir = (withIr[0].metadata as { __ir: { root: { kind: string; status: string; value: Record<string, unknown> } } }).__ir;
    expect(ir.root.kind).toBe("page_brief");
    expect(ir.root.status).toBe("complete");
    const brief = ir.root.value.brief as string[];
    expect(Array.isArray(brief)).toBe(true);
    expect(brief.length).toBeGreaterThanOrEqual(6);
  });
});
