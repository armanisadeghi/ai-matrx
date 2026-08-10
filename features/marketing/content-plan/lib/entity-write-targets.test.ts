import {
  PLAN_ENTITY_LABEL_MAX_CHARS,
  parseCreateEntityWrite,
  parseEntityDraftWrite,
  parseOpenEntityEditorWrite,
} from "./entity-write-targets";

const SOURCE_TYPE_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_SOURCE_TYPE_ID = "22222222-2222-2222-2222-222222222222";
const context = { sourceTypeIds: [SOURCE_TYPE_ID, OTHER_SOURCE_TYPE_ID] };
const noCategories = { sourceTypeIds: [] as string[] };

describe("parseEntityDraftWrite", () => {
  it("accepts a partial draft and trims the label", () => {
    expect(parseEntityDraftWrite({ label: "  Dr. Jane Smith " }, context)).toEqual(
      { label: "Dr. Jane Smith" },
    );
  });

  it("accepts every editable key at once", () => {
    expect(
      parseEntityDraftWrite(
        {
          label: "American Heart Association",
          entity_type: "org",
          source_type_id: SOURCE_TYPE_ID,
        },
        context,
      ),
    ).toEqual({
      label: "American Heart Association",
      entity_type: "org",
      source_type_id: SOURCE_TYPE_ID,
    });
  });

  it("keeps an explicit null source_type_id (the picker's None)", () => {
    expect(parseEntityDraftWrite({ source_type_id: null }, context)).toEqual({
      source_type_id: null,
    });
  });

  it("refuses a non-object value", () => {
    expect(() => parseEntityDraftWrite("Dr. Jane Smith", context)).toThrow(
      /expected an object/,
    );
    expect(() => parseEntityDraftWrite([], context)).toThrow(/Received array/);
  });

  it("refuses an unrecognised key rather than dropping it", () => {
    expect(() =>
      parseEntityDraftWrite({ label: "X", attributes: {} }, context),
    ).toThrow(/unsupported key\(s\) "attributes"/);
  });

  it("refuses an empty draft", () => {
    expect(() => parseEntityDraftWrite({}, context)).toThrow(
      /nothing to stage/,
    );
  });

  it("refuses a blank label", () => {
    expect(() => parseEntityDraftWrite({ label: "   " }, context)).toThrow(
      /label is empty/,
    );
  });

  it("refuses an over-long label", () => {
    expect(() =>
      parseEntityDraftWrite(
        { label: "a".repeat(PLAN_ENTITY_LABEL_MAX_CHARS + 1) },
        context,
      ),
    ).toThrow(/is a name, not a description/);
  });

  it("refuses an entity_type outside the canonical vocabulary", () => {
    expect(() =>
      parseEntityDraftWrite({ entity_type: "author" }, context),
    ).toThrow(/must be one of person \| source \| media \| org/);
  });

  it("refuses a source_type_id that is not an offered category", () => {
    expect(() =>
      parseEntityDraftWrite({ source_type_id: "not-a-real-id" }, context),
    ).toThrow(/is not one of this workspace's plan_source_type category ids/);
  });

  it("refuses a source_type_id while the options are still loading", () => {
    expect(() =>
      parseEntityDraftWrite({ source_type_id: SOURCE_TYPE_ID }, noCategories),
    ).toThrow(/have not loaded yet/);
  });
});

describe("parseCreateEntityWrite", () => {
  it("builds a complete insert from the minimum payload", () => {
    expect(
      parseCreateEntityWrite({ label: "Mayo Clinic", entity_type: "org" }, context),
    ).toEqual({
      label: "Mayo Clinic",
      entity_type: "org",
      source_type_id: null,
      attributes: null,
    });
  });

  it("carries optional source type and attributes through", () => {
    expect(
      parseCreateEntityWrite(
        {
          label: "NIH",
          entity_type: "source",
          source_type_id: OTHER_SOURCE_TYPE_ID,
          attributes: { research: { description: "d", reason: "r" } },
        },
        context,
      ),
    ).toEqual({
      label: "NIH",
      entity_type: "source",
      source_type_id: OTHER_SOURCE_TYPE_ID,
      attributes: { research: { description: "d", reason: "r" } },
    });
  });

  it("requires label and entity_type", () => {
    expect(() => parseCreateEntityWrite({ entity_type: "org" }, context)).toThrow(
      /label is required/,
    );
    expect(() => parseCreateEntityWrite({ label: "NIH" }, context)).toThrow(
      /entity_type is required/,
    );
  });

  it("refuses caller-supplied site or organization", () => {
    expect(() =>
      parseCreateEntityWrite(
        { label: "NIH", entity_type: "org", site_id: "abc" },
        context,
      ),
    ).toThrow(/unsupported key\(s\) "site_id"/);
  });

  it("refuses non-object attributes", () => {
    expect(() =>
      parseCreateEntityWrite(
        { label: "NIH", entity_type: "org", attributes: "notes" },
        context,
      ),
    ).toThrow(/attributes must be a JSON object/);
  });

  it("treats explicit null attributes as absent", () => {
    expect(
      parseCreateEntityWrite(
        { label: "NIH", entity_type: "org", attributes: null },
        context,
      ).attributes,
    ).toBeNull();
  });
});

describe("parseOpenEntityEditorWrite", () => {
  const ids = ["aaa", "bbb"];

  it("returns null for a new-entity open", () => {
    expect(parseOpenEntityEditorWrite(null, ids)).toBeNull();
    expect(parseOpenEntityEditorWrite("", ids)).toBeNull();
  });

  it("returns a live entity id", () => {
    expect(parseOpenEntityEditorWrite(" bbb ", ids)).toBe("bbb");
  });

  it("refuses an id that is not on the roster", () => {
    expect(() => parseOpenEntityEditorWrite("ccc", ids)).toThrow(
      /is not a live entity on this site/,
    );
  });

  it("refuses a non-string id", () => {
    expect(() => parseOpenEntityEditorWrite(42, ids)).toThrow(
      /expected an entity UUID/,
    );
  });
});
