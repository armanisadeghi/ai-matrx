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

  it("round-trips a custom-data (merge_field) binding in all three shapes", () => {
    const definitions = [
      {
        name: "model_picks",
        defaultValue: null,
        binding: {
          kind: "merge_field",
          source: "record",
          semantic_type: "collection",
          table_id: "table-1",
          match: { status: "active" },
          limit: 40,
          transform: {
            name: "list",
            template: "- {purpose}: {model.name} (`{model.id}`)",
            join: "\n",
            max: 40,
          },
          missing: "absent",
          override_policy: "shown_locked",
        },
      },
      {
        name: "one_pick",
        defaultValue: null,
        binding: {
          kind: "merge_field",
          source: "record",
          semantic_type: "reference",
          table_id: "table-1",
          record_id: "record-1",
          transform: { name: "list", template: "{purpose}" },
          missing: "block",
          override_policy: "shown_locked",
        },
      },
      {
        name: "one_value",
        defaultValue: null,
        binding: {
          kind: "merge_field",
          source: "record",
          semantic_type: "value",
          table_id: "table-1",
          record_id: "record-1",
          field_key: "purpose",
          missing: "absent",
          override_policy: "shown_locked",
        },
      },
    ];
    expect(parseAgentVariableDefinitions(definitions)).toEqual(definitions);
  });

  it("keeps an in-progress custom-data binding (no table chosen yet) readable", () => {
    const definitions = [
      {
        name: "draft",
        defaultValue: null,
        binding: {
          kind: "merge_field",
          source: "record",
          semantic_type: "collection",
          table_id: "",
          missing: "absent",
          override_policy: "shown_locked",
        },
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
      "unknown binding kind",
      [{ name: "x", binding: { kind: "mystery", table_id: "t" } }],
    ],
    [
      "merge_field binding with an unknown shape",
      [
        {
          name: "x",
          binding: {
            kind: "merge_field",
            source: "record",
            semantic_type: "everything",
            table_id: "t",
          },
        },
      ],
    ],
    [
      "merge_field binding with an unknown missing policy",
      [
        {
          name: "x",
          binding: {
            kind: "merge_field",
            source: "record",
            semantic_type: "collection",
            table_id: "t",
            missing: "guess",
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

describe("parseAgentMessages — the decision modality's Questions part", () => {
  const QUESTIONS = [
    {
      name: "is_defect",
      type: "noul",
      instructions: "Is this a defect rather than a request?",
      criteria: { true: "existing behaviour is wrong", false: "new behaviour is wanted" },
      suggested_threshold: 0.7,
    },
  ];

  // THE BREAK THIS CATCHES: the reader's part allowlist stops recognising
  // `decision_questions`. Before 2026-09-20 it did not recognise it at all, so
  // saving a decision agent worked and the NEXT LOAD threw, dropping EVERY
  // message in the agent — the builder came back empty over an intact row.
  it("keeps a whole decision message instead of dropping the agent's messages", () => {
    const messages = [
      { role: "system", content: [{ type: "text", text: "You triage feedback." }] },
      {
        role: "user",
        content: [
          { type: "text", text: '{"id":"2f6af047","reported_type":"bug"}' },
          { __kind: "decision_questions", type: "decision_questions", questions: QUESTIONS },
        ],
      },
    ];

    expect(parseAgentMessages(messages)).toEqual(messages);
  });

  // THE SECOND BREAK: a part written with only `__kind`. Every message-part
  // reader dispatches on `type` (aidream's reconstruct_content defaults a
  // missing one to "text"), so such a row reaches the provider as an empty
  // text block and the decision is refused as missing. The reader repairs it.
  it("repairs a part stored with only the kind marker, and keeps the marker", () => {
    const parsed = parseAgentMessages([
      {
        role: "user",
        content: [{ __kind: "decision_questions", questions: QUESTIONS }],
      },
    ]);

    expect(parsed[0].content[0]).toEqual({
      __kind: "decision_questions",
      type: "decision_questions",
      questions: QUESTIONS,
    });
  });
});
