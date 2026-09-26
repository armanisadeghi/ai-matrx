import {
  generateOrganizationAbbreviation,
  validateOrganizationAbbreviation,
} from "@/features/organizations/types";

describe("organization abbreviations", () => {
  it.each<[string, string]>([
    ["All Green Recycling", "AGR"],
    ["Pearlman Brown, and Wax, LLP", "PBW"],
    ["Castellano & Reyes, LLP", "CR"],
    ["AI Matrx", "AIM"],
    ["Titanium", "TIT"],
    ["X", "XX"],
    // Every organization abbreviates from its own name, never a
    // viewer-relative constant (Arman, 2026-09-11).
    ["Arman's Org", "ASO"],
    ["admin's Workspace", "ASW"],
  ])("derives %s as %s", (name, expected) => {
    expect(generateOrganizationAbbreviation(name)).toBe(expected);
  });

  it.each(["ME", "CR", "AGR"])("accepts %s", (value) => {
    expect(validateOrganizationAbbreviation(value).valid).toBe(true);
  });

  it.each(["M", "FOUR", "aI", "A1", ""])("rejects %s", (value) => {
    expect(validateOrganizationAbbreviation(value).valid).toBe(false);
  });
});
