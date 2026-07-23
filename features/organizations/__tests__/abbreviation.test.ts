import {
  generateOrganizationAbbreviation,
  validateOrganizationAbbreviation,
} from "@/features/organizations/types";

describe("organization abbreviations", () => {
  it.each([
    ["All Green Recycling", false, "AGR"],
    ["Pearlman Brown, and Wax, LLP", false, "PBW"],
    ["Castellano & Reyes, LLP", false, "CR"],
    ["AI Matrx", false, "AIM"],
    ["Titanium", false, "TIT"],
    ["X", false, "XX"],
    ["Anything", true, "ME"],
  ])("derives %s (personal=%s) as %s", (name, isPersonal, expected) => {
    expect(generateOrganizationAbbreviation(name, isPersonal)).toBe(expected);
  });

  it.each(["ME", "CR", "AGR"])("accepts %s", (value) => {
    expect(validateOrganizationAbbreviation(value).valid).toBe(true);
  });

  it.each(["M", "FOUR", "aI", "A1", ""])("rejects %s", (value) => {
    expect(validateOrganizationAbbreviation(value).valid).toBe(false);
  });
});
