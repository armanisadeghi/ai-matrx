import { mapScopeToInstance } from "../scope-mapping";
import { resolveValueMappings } from "@/features/surfaces/utils/value-mapping-resolver";

describe("surface context value contract", () => {
  it.each([
    ['{"agent":{"name":"Judge"}}', "object"],
    ['[{"name":"first"}]', "array"],
  ])(
    "rejects a JSON %s container encoded as text at the legacy mapping boundary",
    (encodedValue, containerKind) => {
      expect(() =>
        mapScopeToInstance(
          { agent_json: encodedValue },
          null,
          [],
          [{ key: "agent_json" }],
        ),
      ).toThrow(
        `Context value "agent_json" is a JSON ${containerKind} encoded as text`,
      );
    },
  );

  it("rejects the same invalid value through explicit surface mappings", () => {
    expect(() =>
      resolveValueMappings(
        { serialized_agent: '{"name":"Judge"}' },
        {
          agent_json: {
            mapType: "surface_value",
            target: "serialized_agent",
          },
        },
        [],
        [{ key: "agent_json" }],
      ),
    ).toThrow('Context value "agent_json" is a JSON object encoded as text');
  });

  it("keeps native structured values structured and leaves ordinary text alone", () => {
    const native = { agent: { name: "Judge" } };
    const result = mapScopeToInstance(
      {
        agent_json: native,
        prose: "Use {curly braces} in the explanation.",
      },
      null,
      [],
      [{ key: "agent_json" }, { key: "prose" }],
    );

    expect(result.contextEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "agent_json",
          value: native,
          type: "json",
        }),
        expect.objectContaining({
          key: "prose",
          value: "Use {curly braces} in the explanation.",
          type: "text",
        }),
      ]),
    );
  });
});
