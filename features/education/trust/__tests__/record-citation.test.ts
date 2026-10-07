import { citationIsOpenable, coerceTrustEnvelope, type SourceCitation } from "../types";
import { sourceRefFromCitation } from "../sourceRef";
import { recordKindOfResourceType } from "../grounding";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  cellsOfExcerpt,
  fieldLabelOfPart,
  recordCitationTarget,
  recordKindOf,
} from "../recordCitation";

const ID = "03f45e63-0ad7-4347-81af-c702460aeb2b";
const cite = (over: Partial<SourceCitation>): SourceCitation => ({
  sourceId: `${ID}:1`,
  sourceKind: "chunk",
  ...over,
});

describe("a conversation citation opens AT its message range", () => {
  it("names the messages (people count from 1) and links the range", () => {
    const t = recordCitationTarget(cite({ sourceId: `${ID}:m2-4`, url: `/chat/${ID}` }));
    expect(t).toMatchObject({ kind: "conversation", recordId: ID, label: "Messages 3–5" });
    expect(t?.messageRange).toEqual({ first: 2, last: 4 });
    expect(t?.href).toBe(`/chat/${ID}?messages=2-4`);
  });
  it("one message is 'Message N'", () => {
    expect(recordCitationTarget(cite({ sourceId: `${ID}:m0-0` }))?.label).toBe("Message 1");
  });
  it("is recognised from the part id alone (cards saved before the kind was stamped)", () => {
    expect(recordKindOf(cite({ sourceId: `${ID}:m0-0` }))).toBe("conversation");
  });
});

describe("a table citation opens AT its row", () => {
  const excerpt = "material: Batteries | weight_lbs: 331.89 | pickup_ref_link: PU-1022";
  it("names the row and filters the table to the cited cells", () => {
    const t = recordCitationTarget(cite({ recordKind: "table", sourceId: `${ID}:r12-12`, excerpt }));
    expect(t?.label).toBe("Row 12");
    expect(t?.href.startsWith(`/data/${ID}?filter=`)).toBe(true);
    const filter = JSON.parse(decodeURIComponent(t!.href.split("filter=")[1]!));
    expect(filter).toEqual({ material: "Batteries", weight_lbs: "331.89", pickup_ref_link: "PU-1022" });
  });
  it("a row line that names its row id opens that row", () => {
    const row = "11111111-2222-4333-8444-555555555555";
    const t = recordCitationTarget(cite({ recordKind: "table", sourceId: `${ID}:r2-2`, excerpt: `id: ${row} | material: Tin` }));
    expect(t?.href).toBe(`/data/${ID}?record=${row}`);
  });
  it("a row range is 'Rows a–b'", () => {
    expect(recordCitationTarget(cite({ recordKind: "table", sourceId: `${ID}:r1-40` }))?.label).toBe("Rows 1–40");
  });
  it("an old numeric part names no row — no invented label", () => {
    expect(recordCitationTarget(cite({ recordKind: "table", sourceId: `${ID}:1` }))?.label).toBeNull();
  });
  it("reads the cells of a row line", () => {
    expect(cellsOfExcerpt("a: 1 | b: two words")).toEqual({ a: "1", b: "two words" });
    expect(cellsOfExcerpt("no cells here")).toEqual({});
  });
});

describe("a pick list citation targets the cited choice", () => {
  it("opens the list page filtered to the choice and names it", () => {
    const t = recordCitationTarget(
      cite({ recordKind: "pick_list", sourceId: `${ID}:r3-3`, excerpt: "Aluminum: Light metal, recycled by weight" }),
    );
    expect(t?.label).toBe("Choice 3");
    expect(t?.href).toBe(`/pick-lists/${ID}?filter=${encodeURIComponent('{"name":"Aluminum"}')}`);
  });
});

describe("a pick list line written as cells finds the choice by its NAME, not the column word", () => {
  it("filters on the name cell's value", () => {
    const t = recordCitationTarget(
      cite({
        recordKind: "pick_list",
        sourceId: `${ID}:r1-4`,
        excerpt: "name: Delta Dental PPO | help_text: Verify frequency limits | group_name: PPO",
      }),
    );
    expect(t?.href).toBe(`/pick-lists/${ID}?filter=${encodeURIComponent('{"name":"Delta Dental PPO"}')}`);
  });
});

describe("a saved result citation opens AT its field", () => {
  it("names the field and carries it to the page", () => {
    const t = recordCitationTarget(cite({ recordKind: "saved_result", sourceId: `${ID}:cards-3` }));
    expect(t?.label).toBe("Card 3");
    expect(t?.href).toBe(`/shapes/instances/${ID}?field=cards-3`);
    expect(fieldLabelOfPart("summary")).toBe("Summary");
    expect(fieldLabelOfPart("1")).toBeNull();
  });
});

describe("a document citation opens the route of ITS OWN kind", () => {
  it("a markdown document opens through /documents/<id>, the door that sends it to its own editor by format", () => {
    expect(recordCitationTarget(cite({ recordKind: "document", sourceId: `${ID}:2` }))?.href).toBe(
      `/documents/${ID}`,
    );
  });
  it("a cloud document opens at /documents/<id>", () => {
    const t = recordCitationTarget(cite({ recordKind: "udt_document", sourceId: `${ID}:2` }));
    expect(t?.kind).toBe("udt_document");
    expect(t?.href).toBe(`/documents/${ID}`);
  });
  it("the Source's resource type names which kind it is", () => {
    expect(recordKindOfResourceType("document")).toBe("document");
    expect(recordKindOfResourceType("udt_document")).toBe("udt_document");
  });
  it("the persisted cloud kind survives coercion", () => {
    const env = coerceTrustEnvelope({
      confidence: "grounded",
      citations: [{ sourceId: `${ID}:1`, recordKind: "udt_document" }],
    });
    expect(env?.citations[0]?.recordKind).toBe("udt_document");
  });
  it("the entity registry agrees: both kinds enter through /documents/<id> (it resolves the content-store format)", () => {
    expect(tryGetEntityInfo("document")?.hrefFor?.(ID)).toBe(`/documents/${ID}`);
    expect(tryGetEntityInfo("udt_document")?.hrefFor?.(ID)).toBe(`/documents/${ID}`);
  });
});

describe("what was broken before", () => {
  it("a record citation with no ids was not openable and had no source ref", () => {
    const c = cite({ sourceId: `${ID}:1` });
    expect(citationIsOpenable(c)).toBe(false);
    expect(sourceRefFromCitation(c)).toBeNull();
    expect(recordCitationTarget(c)).toBeNull();
  });
  it("the persisted record kind survives coercion", () => {
    const env = coerceTrustEnvelope({
      confidence: "grounded",
      citations: [{ sourceId: `${ID}:r1-1`, recordKind: "table" }],
    });
    expect(env?.citations[0]?.recordKind).toBe("table");
  });
});

describe("a citation whose part id is not a part of its stamped record", () => {
  // Live 2026-10-05 (deck cd7320db…): the agent cited `87e4f307…:1` — a chunk
  // id that names no conversation — on a card grounded in the conversation
  // e8efddf6…; the window looked up 87e4f307 and said "We couldn't find this
  // conversation". The stamped link names the real record.
  const CONV = "e8efddf6-6b73-415e-ae12-bda960db065f";
  const OTHER = "87e4f307-126e-425a-b8d6-1dfd2c8826fe";
  it("opens the record its stamped link names, whole", () => {
    const t = recordCitationTarget(
      cite({ recordKind: "conversation", sourceId: `${OTHER}:1`, url: `/chat/${CONV}` }),
    );
    expect(t).toMatchObject({ kind: "conversation", recordId: CONV, part: "", messageRange: null, label: null });
    expect(t?.href).toBe(`/chat/${CONV}`);
  });
  it("keeps the part when it IS a part of the stamped record", () => {
    const t = recordCitationTarget(
      cite({ recordKind: "conversation", sourceId: `${CONV}:m0-1`, url: `/chat/${CONV}` }),
    );
    expect(t).toMatchObject({ recordId: CONV, label: "Messages 1–2" });
  });
  it("a saved result with no usable part opens the result without a field", () => {
    const t = recordCitationTarget(
      cite({ recordKind: "saved_result", sourceId: `${OTHER}:summary`, url: `/shapes/instances/${CONV}` }),
    );
    expect(t?.href).toBe(`/shapes/instances/${CONV}`);
  });
});
