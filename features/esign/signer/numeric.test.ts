import { looksNotNumeric } from "./model";
describe("looksNotNumeric", () => {
  it("offers on letters, stays quiet on numbers and empty", () => {
    expect(looksNotNumeric("number", "abc")).toBe(true);
    expect(looksNotNumeric("number", "12x3")).toBe(true);
    expect(looksNotNumeric("number", "1,234.50")).toBe(false);
    expect(looksNotNumeric("number", "-7")).toBe(false);
    expect(looksNotNumeric("number", "")).toBe(false);
    expect(looksNotNumeric("text", "abc")).toBe(false);
  });
});

import { valueOffer } from "./model";
import type { FieldDefinitionV2 } from "@/features/esign/contract/fieldModel";

describe("valueOffer", () => {
  const num = { kind: "number", number: { min: 1, max: 10 } } as unknown as FieldDefinitionV2;
  const email = { kind: "email" } as unknown as FieldDefinitionV2;
  it("offers, in words that say the value is still usable", () => {
    expect(valueOffer(num, "abc12x3")).toBe("This does not look like a number. You can still use it.");
    expect(valueOffer(num, "0")).toMatch(/Usually at least 1\. You can still use it\./);
    expect(valueOffer(num, "11")).toMatch(/Usually at most 10/);
    expect(valueOffer(email, "nope")).toMatch(/does not look like an email/);
  });
  it("stays quiet on good, empty and null values", () => {
    expect(valueOffer(num, "5")).toBeNull();
    expect(valueOffer(num, "1,0")).toBeNull();
    expect(valueOffer(num, "")).toBeNull();
    expect(valueOffer(num, null)).toBeNull();
    expect(valueOffer(email, "a@b.co")).toBeNull();
  });
});
