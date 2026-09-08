import {
  applyAudience,
  DEFAULT_CONVERSATION_FILTERS,
  readAudience,
} from "@/features/ai-work/conversations/types";
import { audienceLabel } from "@/features/ai-work/conversations/presentation";

describe("conversation audience buckets", () => {
  it("opens on the person's own chats", () => {
    expect(readAudience(DEFAULT_CONVERSATION_FILTERS)).toBe("chat");
  });

  it("round-trips every bucket through the ordinary filter bag", () => {
    for (const bucket of ["chat", "external", "internal"] as const) {
      expect(readAudience(applyAudience({}, bucket))).toBe(bucket);
    }
    expect(readAudience(applyAudience({}, "all"))).toBe("all");
  });

  it("reads a hand-built selection as custom, never rounding it to a preset", () => {
    expect(
      readAudience({ audience: { kind: "select", values: ["chat", "external"] } }),
    ).toBe("custom");
    expect(readAudience({ audience: { kind: "select", values: ["nope"] } })).toBe(
      "custom",
    );
  });

  it("drops the second cut when the bucket changes, keeps unrelated filters", () => {
    const next = applyAudience(
      {
        audience: { kind: "select", values: ["internal"] },
        conversation_type: { kind: "select", values: ["workflow"] },
        source_app: { kind: "select", values: ["aidream"] },
        favorite: { kind: "boolean", value: true },
      },
      "external",
    );
    expect(next.audience).toEqual({ kind: "select", values: ["external"] });
    expect(next.conversation_type).toBeUndefined();
    expect(next.source_app).toBeUndefined();
    expect(next.favorite).toEqual({ kind: "boolean", value: true });
  });

  it("names the three buckets the way Arman ruled them", () => {
    expect(audienceLabel("chat")).toBe("AI chats");
    expect(audienceLabel("external")).toBe("External app runs");
    expect(audienceLabel("internal")).toBe("Internal Matrx runs");
  });
});
