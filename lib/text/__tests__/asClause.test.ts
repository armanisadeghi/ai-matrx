import { asClause } from "../asClause";

describe("asClause", () => {
  it("drops the message's own closing punctuation so the sentence around it supplies one", () => {
    expect(`Could not read: ${asClause("The service is busy, try again.")}. Dropping works.`).toBe(
      "Could not read: The service is busy, try again. Dropping works.",
    );
    expect(asClause("Refused!  ")).toBe("Refused");
    expect(asClause("Still waiting...")).toBe("Still waiting");
    expect(asClause("No punctuation")).toBe("No punctuation");
    expect(asClause(null)).toBe("");
    expect(asClause(404)).toBe("404");
  });
});
