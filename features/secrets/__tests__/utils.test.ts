import {
  generateVaultPassword,
  parseEnvAssignment,
} from "@/features/secrets/utils";

describe("generateVaultPassword", () => {
  test("creates a strong, unambiguous password with all basic character groups", () => {
    const password = generateVaultPassword();

    expect(password).toHaveLength(24);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[2-9]/);
    expect(password).toMatch(/[!@#$%^&*\-_=+?]/);
    expect(password).not.toMatch(/[O0Il1]/);
  });

  test("does not repeat deterministic output and rejects unsafe lengths", () => {
    expect(generateVaultPassword()).not.toBe(generateVaultPassword());
    expect(() => generateVaultPassword(3)).toThrow(RangeError);
  });
});

describe("parseEnvAssignment", () => {
  test("parses a pasted key and value", () => {
    expect(
      parseEnvAssignment("DATA_FOR_SEO_EMAIL=arman@armansadeghi.com"),
    ).toEqual({
      key: "DATA_FOR_SEO_EMAIL",
      value: "arman@armansadeghi.com",
    });
  });

  test("preserves equals signs inside the value", () => {
    expect(parseEnvAssignment("TOKEN=header.payload=signature")).toEqual({
      key: "TOKEN",
      value: "header.payload=signature",
    });
  });

  test("supports export syntax and matching outer quotes", () => {
    expect(parseEnvAssignment(' export API_TOKEN="quoted value" ')).toEqual({
      key: "API_TOKEN",
      value: "quoted value",
    });
  });

  test("does not reinterpret a normal key or invalid multiline paste", () => {
    expect(parseEnvAssignment("DATA_FOR_SEO_EMAIL")).toBeNull();
    expect(parseEnvAssignment("FIRST=one\nSECOND=two")).toBeNull();
    expect(parseEnvAssignment("INVALID-KEY=value")).toBeNull();
  });
});
