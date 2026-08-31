import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { parseReferenceFence } from "@/features/matrx-envelope/referenceFence";

describe("reference fence authoring", () => {
  it("minifies the canonical envelope onto one JSON line", () => {
    const fence = buildRecordReferenceFence({
      type: "agent",
      id: "0461e567-5ba4-4ed0-b4a9-5ead599ee3c0",
      label: "Dev Instruction Generator",
    });

    expect(fence).toBe(
      '```matrx\n{"__kind":"directive_v1_reference_agent","items":[{"id":"0461e567-5ba4-4ed0-b4a9-5ead599ee3c0","label":"Dev Instruction Generator"}]}\n```',
    );
    expect(parseReferenceFence(fence)?.items).toEqual([
      {
        id: "0461e567-5ba4-4ed0-b4a9-5ead599ee3c0",
        label: "Dev Instruction Generator",
      },
    ]);
  });
});
