import {
  parseAddress,
  parseContactPoint,
  parseEmployment,
  parseIdentityFields,
  parseInteraction,
} from "./crmRecordSurfaceWrite";

describe("CRM record surface write validation", () => {
  it("builds a partial identity patch without clearing omitted fields", () => {
    expect(
      parseIdentityFields({
        display_name: "  Jinesh Shah  ",
        headline: null,
      }),
    ).toEqual({ display_name: "Jinesh Shah", headline: null });
  });

  it("refuses unknown identity fields and an empty display name", () => {
    expect(() => parseIdentityFields({ organization_id: "wrong" })).toThrow(
      /does not accept: organization_id/,
    );
    expect(() => parseIdentityFields({ display_name: "  " })).toThrow(
      /cannot be empty/,
    );
  });

  it("normalizes an approved contact-point shape", () => {
    expect(
      parseContactPoint({
        channel: "email",
        value: "  person@example.com ",
        purpose: "work",
        make_primary: true,
      }),
    ).toEqual({
      channel: "email",
      value: "person@example.com",
      purpose: "work",
      makePrimary: true,
    });
  });

  it("requires an address location and validates the country code", () => {
    expect(() => parseAddress({ purpose: "office" })).toThrow(
      /requires at least line1 or locality/,
    );
    expect(() =>
      parseAddress({
        purpose: "office",
        locality: "Los Angeles",
        country_code: "usa",
      }),
    ).toThrow(/two-letter code/);
  });

  it("takes exactly one side of the stint", () => {
    expect(() => parseEmployment({ title: "CTO" })).toThrow(/exactly one/);
    expect(
      parseEmployment({ person_party_id: "3f8a3b52-2b8e-4b7a-9d3a-1f0c2d4e5a6b" })
        .personPartyId,
    ).toBe("3f8a3b52-2b8e-4b7a-9d3a-1f0c2d4e5a6b");
  });

  it("requires a real employer id and a date-only start date", () => {
    expect(() =>
      parseEmployment({ employer_party_id: "Acme", start_date: "August" }),
    ).toThrow(/expects a UUID/);
  });

  it("preserves multiline interaction bodies", () => {
    expect(
      parseInteraction({
        channel: "email",
        direction: "outbound",
        subject: "Follow-up",
        body: "First paragraph\n\nSecond paragraph",
      }).body,
    ).toBe("First paragraph\n\nSecond paragraph");
  });

  it("refuses interactions with no authored content", () => {
    expect(() =>
      parseInteraction({ channel: "call", direction: "outbound" }),
    ).toThrow(/requires a subject or body/);
  });
});
