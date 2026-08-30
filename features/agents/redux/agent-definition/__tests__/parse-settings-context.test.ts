import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  parseAgentContextPolicies,
  parseAgentSettings,
} from "../parse-settings-context";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));

const context = { agentId: "agent-123", relation: "agent.definition" };

beforeEach(() => {
  jest.mocked(captureError).mockClear();
});

describe("parseAgentSettings", () => {
  it("preserves nested JSON and forward-compatible provider settings", () => {
    const raw = {
      temperature: 0.4,
      future_provider_option: {
        enabled: true,
        thresholds: [1, 2, null],
      },
    };

    expect(parseAgentSettings(raw, context)).toEqual(raw);
    expect(captureError).not.toHaveBeenCalled();
  });

  it.each([null, undefined])(
    "normalizes %s to an empty settings object",
    (raw) => {
      expect(parseAgentSettings(raw, context)).toEqual({});
      expect(captureError).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["an array", []],
    ["a primitive", "temperature=0.4"],
    ["a non-JSON nested value", { temperature: undefined }],
    ["a non-finite number", { temperature: Number.NaN }],
  ])("rejects %s loudly", (_label, raw) => {
    expect(parseAgentSettings(raw, context)).toEqual({});
    expect(captureError).toHaveBeenCalledTimes(1);
  });
});

describe("parseAgentContextPolicies", () => {
  it("preserves a complete valid policy and JSON-safe extension fields", () => {
    const raw = [
      {
        key: "project_context",
        type: "project",
        label: "Project",
        description: "The active project",
        max_inline_chars: 1200,
        summary_agent_id: "summary-agent",
        mutable: true,
        persist: "auto",
        source: {
          kind: "ctx_item",
          id: "item-id",
          field: "value",
          extra: { revision: 3 },
          scope_type_id: "scope-type-id",
          item_key: "project_context",
          on_missing: "error",
          future_source_option: ["kept"],
        },
        future_policy_option: { enabled: true },
      },
    ];

    expect(parseAgentContextPolicies(raw, context)).toEqual(raw);
    expect(captureError).not.toHaveBeenCalled();
  });

  it("accepts omitted optionals and removes nullable API defaults", () => {
    expect(
      parseAgentContextPolicies(
        [
          {
            key: "selection",
            type: "text",
            label: null,
            description: null,
            max_inline_chars: null,
            summary_agent_id: null,
            mutable: null,
            persist: null,
            source: null,
          },
          { key: "payload", type: "json" },
        ],
        context,
      ),
    ).toEqual([
      { key: "selection", type: "text" },
      { key: "payload", type: "json" },
    ]);
    expect(captureError).not.toHaveBeenCalled();
  });

  it.each([null, undefined])("normalizes %s to an empty policy list", (raw) => {
    expect(parseAgentContextPolicies(raw, context)).toEqual([]);
    expect(captureError).not.toHaveBeenCalled();
  });

  it.each([
    ["missing key", { type: "text" }],
    ["empty key", { key: "", type: "text" }],
    ["invalid type", { key: "source", type: "document" }],
    ["invalid label", { key: "source", type: "text", label: 3 }],
    [
      "invalid description",
      { key: "source", type: "text", description: false },
    ],
    [
      "negative inline limit",
      { key: "source", type: "text", max_inline_chars: -1 },
    ],
    [
      "fractional inline limit",
      { key: "source", type: "text", max_inline_chars: 1.5 },
    ],
    [
      "invalid summary agent",
      { key: "source", type: "text", summary_agent_id: 2 },
    ],
    ["invalid mutable flag", { key: "source", type: "text", mutable: "yes" }],
    [
      "invalid persistence mode",
      { key: "source", type: "text", persist: "server" },
    ],
    ["missing auto source", { key: "source", type: "text", persist: "auto" }],
    [
      "invalid source kind",
      { key: "source", type: "text", source: { kind: 3 } },
    ],
    [
      "invalid source id",
      { key: "source", type: "text", source: { kind: "ctx_item", id: 3 } },
    ],
    [
      "invalid source extra",
      { key: "source", type: "text", source: { kind: "ctx_item", extra: [] } },
    ],
  ])("excludes a policy with %s and reports it loudly", (_label, entry) => {
    expect(parseAgentContextPolicies([entry], context)).toEqual([]);
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("keeps valid siblings when one persisted policy is malformed", () => {
    expect(
      parseAgentContextPolicies(
        [
          { key: "selection", type: "text" },
          { key: "broken", type: 4 },
          { key: "record", type: "db_ref", max_inline_chars: 0 },
        ],
        context,
      ),
    ).toEqual([
      { key: "selection", type: "text" },
      { key: "record", type: "db_ref", max_inline_chars: 0 },
    ]);
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-array policy field loudly", () => {
    expect(parseAgentContextPolicies({ key: "selection" }, context)).toEqual(
      [],
    );
    expect(captureError).toHaveBeenCalledTimes(1);
  });
});
