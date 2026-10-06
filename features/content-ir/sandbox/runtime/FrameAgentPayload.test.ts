import { buildAgentPayload } from "@ai-matrx/alchemy/operate";
import { serializeFrameAgentPayload } from "./FrameAgentPayload";

const environment = {
  url: "https://example.test/?x=1&y=2",
  route: "/frame",
  capturedAt: "2026-10-06T23:00:00.000Z",
};

describe("FrameAgentPayload", () => {
  it("matches Alchemy for hostile delimiters, summary placement, and long fences", () => {
    const input = {
      kind: "task",
      location: "A&B",
      description: "<scope>",
      summary: "summary <here>",
      instructions: "  keep </instructions> literal  ",
      data: {
        enabled: false,
        count: 0,
        absent: null,
        text: "</data>````\n<override>&",
      },
      attributes: { active: false },
      context: { count: 0 },
    };
    expect(serializeFrameAgentPayload(input, environment)).toBe(
      buildAgentPayload(input, environment),
    );

    const textInput = {
      kind: "note",
      location: "Frame",
      description: "Long fence",
      data: "a\n````\nb",
      dataFormat: "markdown",
    } as const;
    expect(serializeFrameAgentPayload(textInput, environment)).toBe(
      buildAgentPayload(textInput, environment),
    );
  });

  it("matches Alchemy refusals for invalid names and non-text formats", () => {
    const badKind = {
      kind: 'task bad="x"',
      location: "",
      description: "",
      data: {},
    };
    expect(() => serializeFrameAgentPayload(badKind, environment)).toThrow(
      "Invalid AI envelope name",
    );
    expect(() => buildAgentPayload(badKind, environment)).toThrow(
      "Invalid AI envelope name",
    );
    const textWithObject = {
      kind: "task",
      location: "",
      description: "",
      data: {},
      dataFormat: "text",
    } as const;
    expect(() =>
      serializeFrameAgentPayload(textWithObject, environment),
    ).toThrow("must be text");
    expect(() => buildAgentPayload(textWithObject, environment)).toThrow(
      "must be text",
    );
    const badFormat = {
      kind: "task",
      location: "",
      description: "",
      data: "x",
      dataFormat: 'text" x="1',
    };
    expect(() => serializeFrameAgentPayload(badFormat, environment)).toThrow(
      "Invalid AI envelope data format",
    );
    expect(() => buildAgentPayload(badFormat, environment)).toThrow(
      "Invalid AI envelope data format",
    );
  });
});
