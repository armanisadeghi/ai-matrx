import {
  looksLikeContact,
  parseContactSelection,
} from "./parseContactSelection";

describe("parseContactSelection", () => {
  it("reads a full email signature", () => {
    const p = parseContactSelection(
      [
        "Best,",
        "Jane Cole",
        "VP of Engineering, Acme Robotics",
        "jane.cole@acmerobotics.com | (310) 555-0142",
      ].join("\n"),
    );
    expect(p.kind).toBe("person");
    expect(p.name).toBe("Jane Cole");
    expect(p.firstName).toBe("Jane");
    expect(p.lastName).toBe("Cole");
    expect(p.email).toBe("jane.cole@acmerobotics.com");
    expect(p.phone).toBe("+13105550142");
    expect(p.headline).toContain("VP of Engineering");
    // A person never carries a company identity key.
    expect(p.domain).toBe("");
  });

  it("treats a company footer with no person as an organization", () => {
    const p = parseContactSelection(
      "Acme Robotics, Inc.\nwww.acmerobotics.com\nhello@acmerobotics.com",
    );
    expect(p.kind).toBe("organization");
    expect(p.name).toBe("Acme Robotics, Inc.");
    expect(p.domain).toBe("acmerobotics.com");
  });

  it("keeps a person who works at a company as ONE person record", () => {
    const p = parseContactSelection("Jane Cole\nAcme Robotics, Inc.");
    expect(p.kind).toBe("person");
    expect(p.name).toBe("Jane Cole");
  });

  it("derives a name from a dotted email when the text has none", () => {
    const p = parseContactSelection("reach me at jane.cole@acmerobotics.com");
    expect(p.name).toBe("Jane Cole");
    expect(p.email).toBe("jane.cole@acmerobotics.com");
  });

  it("does not invent a name from an opaque email local part", () => {
    const p = parseContactSelection("info@acmerobotics.com");
    expect(p.name).toBe("");
    expect(p.email).toBe("info@acmerobotics.com");
  });

  it("never takes a free-mail host as a company domain", () => {
    const p = parseContactSelection("Acme Group\nacme.team@gmail.com");
    expect(p.kind).toBe("organization");
    expect(p.domain).toBe("");
  });

  it("drops an unparseable phone rather than storing garbage", () => {
    const p = parseContactSelection("Jane Cole\ncall 12345");
    expect(p.phone).toBe("");
  });

  it("offers nothing on prose", () => {
    expect(looksLikeContact("we should follow up on this next week")).toBe(
      false,
    );
    expect(looksLikeContact("")).toBe(false);
  });

  it("offers on a bare name, a bare email, or a bare phone", () => {
    expect(looksLikeContact("Jane Cole")).toBe(true);
    expect(looksLikeContact("jane@acme.com")).toBe(true);
    expect(looksLikeContact("(310) 555-0142")).toBe(true);
  });
});
