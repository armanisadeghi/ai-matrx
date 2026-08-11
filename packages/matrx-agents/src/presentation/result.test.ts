import { describe, expect, it } from "vitest";

import { projectAgentResultForDisplay } from "./result";

describe("projectAgentResultForDisplay", () => {
  it("drops Anthropic thinking blocks and signatures while keeping the answer", () => {
    const value = {
      final_text: "The public answer",
      messages: [
        {
          role: "assistant",
          content: [
            {
              id: null,
              type: "thinking",
              thinking: "Private chain of thought",
              provider: "anthropic",
              signature: "s".repeat(900),
            },
            { type: "text", text: "The public answer" },
          ],
        },
      ],
    };

    expect(projectAgentResultForDisplay(value)).toEqual({
      final_text: "The public answer",
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "The public answer" }],
        },
      ],
    });
    expect(value.messages[0]?.content[0]?.thinking).toBe(
      "Private chain of thought",
    );
    expect(value.messages[0]?.content[0]?.signature).toHaveLength(900);
  });

  it("drops OpenAI reasoning and redacted-thinking blocks recursively", () => {
    expect(
      projectAgentResultForDisplay({
        nested: {
          parts: [
            { type: "reasoning", encrypted_content: "opaque" },
            { type: "redacted_thinking", data: "opaque" },
            { type: "text", text: "Visible" },
          ],
        },
      }),
    ).toEqual({
      nested: { parts: [{ type: "text", text: "Visible" }] },
    });
  });

  it("removes provider signature material outside a reasoning block", () => {
    expect(
      projectAgentResultForDisplay({
        provider: "google",
        signature: "opaque",
        signature_encoding: "base64",
        metadata: {
          thoughtSignature: "opaque",
          google_thought_signature: "opaque",
        },
        answer: "Visible",
      }),
    ).toEqual({
      provider: "google",
      metadata: {},
      answer: "Visible",
    });
  });

  it("does not erase ordinary domain fields or clone an unchanged value", () => {
    const value = {
      thinking: "A user-authored field",
      signature: "Signed by Ada",
      nested: [{ type: "note", text: "Keep me" }],
    };

    expect(projectAgentResultForDisplay(value)).toBe(value);
  });

  it("projects a private root block to no displayable value", () => {
    expect(
      projectAgentResultForDisplay({
        type: "thinking",
        text: "Private",
        signature: "opaque",
      }),
    ).toBeNull();
  });
});
