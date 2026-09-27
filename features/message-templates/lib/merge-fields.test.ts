import {
  mergeFieldLabel,
  mergeFieldsIn,
  mergeFieldToken,
  previewParts,
} from "./merge-fields";

describe("merge fields in plain words", () => {
  it("names known and unknown fields", () => {
    expect(mergeFieldLabel("reply.body")).toBe("Reply body");
    expect(mergeFieldLabel("party.first_name")).toBe("Recipient first name");
    expect(mergeFieldLabel("case.pitch_angle")).toBe("Story pitch angle");
    expect(mergeFieldLabel("order_total")).toBe("Order total");
  });

  it("lists distinct fields across subject and body, in order", () => {
    expect(
      mergeFieldsIn("Re: {{reply.subject}}", "Hi {{party.first_name}}, {{ reply.body }} {{reply.subject}}").map(
        (f) => f.path,
      ),
    ).toEqual(["reply.subject", "party.first_name", "reply.body"]);
  });

  it("ignores malformed expressions the server would refuse", () => {
    expect(mergeFieldsIn("{{ not valid! }} {{1abc}}")).toEqual([]);
  });

  it("splits text into runs and fields for the preview", () => {
    const parts = previewParts("Hi {{party.first_name}},\n{{x.y}}");
    expect(parts.map((p) => (p.kind === "text" ? p.text : p.field.example))).toEqual([
      "Hi ",
      "Jordan",
      ",\n",
      "[X y]",
    ]);
  });

  it("builds the token", () => {
    expect(mergeFieldToken("party.first_name")).toBe("{{party.first_name}}");
  });
});
