import {
  parseAgentMessages,
  parseAgentVariableDefinitions,
} from "../parse-messages-variables";

describe("parseAgentMessages", () => {
  it("round-trips valid authored text and media messages", () => {
    const messages = [
      {
        role: "system",
        content: [{ type: "text", text: "You are helpful.", id: "prompt" }],
        host_trace: { source: "builder" },
      },
      {
        role: "user",
        content: [
          {
            type: "media",
            kind: "image",
            file_id: "file-1",
            metadata: { alt: "reference" },
          },
        ],
      },
    ];

    expect(parseAgentMessages(messages)).toEqual(messages);
  });

  it("maps a null or missing JSONB value to the established empty list", () => {
    expect(parseAgentMessages(null)).toEqual([]);
    expect(parseAgentMessages(undefined)).toEqual([]);
  });

  it.each([
    ["non-array", {}],
    ["non-object entry", ["bad"]],
    ["runtime-only role", [{ role: "tool", content: [] }]],
    ["missing content", [{ role: "user" }]],
    [
      "malformed text block",
      [{ role: "user", content: [{ type: "text", text: 42 }] }],
    ],
    [
      "runtime-only content block",
      [{ role: "assistant", content: [{ type: "thinking", text: "hidden" }] }],
    ],
  ])("rejects %s", (_label, value) => {
    expect(() => parseAgentMessages(value)).toThrow(TypeError);
  });
});

describe("parseAgentVariableDefinitions", () => {
  it("round-trips valid optional and opaque schema fields", () => {
    const definitions = [
      {
        name: "document",
        defaultValue: { file_id: "file-1" },
        helpText: "Choose a document",
        required: true,
        customComponent: {
          type: "document",
          structured_list: {
            listId: "list-1",
            groupName: "Primary",
            multiple: false,
            catalog_revision: 3,
          },
          assignment: { random: false, strategy_note: "explicit" },
          resource_context: {
            promote: [
              {
                representation: "markdown",
                max_chars: 4_000,
                renderer: "canonical",
              },
            ],
            exclude: ["raw"],
            policy_revision: 2,
          },
          stash: {
            options: ["One", "Two"],
            toggleValues: ["No", "Yes"],
            editor_hint: "preserve",
          },
          host_extension: { source: "builder" },
        },
        binding: {
          contextItemId: "item-1",
          scopeTypeId: "scope-type-1",
          itemKey: "document",
          onMissing: "error",
          resolver_revision: 4,
        },
        audit_note: "opaque and valid",
      },
    ];

    expect(parseAgentVariableDefinitions(definitions)).toEqual(definitions);
  });

  it("applies the generated default when defaultValue is omitted", () => {
    expect(parseAgentVariableDefinitions([{ name: "topic" }])).toEqual([
      { name: "topic", defaultValue: null },
    ]);
  });

  it("preserves an explicit null defaultValue", () => {
    expect(
      parseAgentVariableDefinitions([{ name: "topic", defaultValue: null }]),
    ).toEqual([{ name: "topic", defaultValue: null }]);
  });

  it("keeps a null variable-definitions JSONB value as null", () => {
    expect(parseAgentVariableDefinitions(null)).toBeNull();
    expect(parseAgentVariableDefinitions(undefined)).toBeNull();
  });

  it.each([
    ["non-array", {}],
    ["non-object entry", ["bad"]],
    ["missing name", [{ defaultValue: "x" }]],
    ["invalid required", [{ name: "x", required: "yes" }]],
    [
      "unknown component type",
      [{ name: "x", customComponent: { type: "mystery" } }],
    ],
    [
      "malformed toggle labels",
      [
        {
          name: "x",
          customComponent: { type: "toggle", toggleValues: ["Only one"] },
        },
      ],
    ],
    [
      "malformed structured-list binding",
      [
        {
          name: "x",
          customComponent: {
            type: "select",
            structured_list: { listId: 7 },
          },
        },
      ],
    ],
    [
      "unknown binding behavior",
      [
        {
          name: "x",
          binding: {
            contextItemId: "item",
            scopeTypeId: "scope",
            itemKey: "x",
            onMissing: "guess",
          },
        },
      ],
    ],
    [
      "malformed resource promotion",
      [
        {
          name: "x",
          customComponent: {
            type: "document",
            resource_context: { promote: [{ representation: 9 }] },
          },
        },
      ],
    ],
  ])("rejects %s", (_label, value) => {
    expect(() => parseAgentVariableDefinitions(value)).toThrow(TypeError);
  });
});
