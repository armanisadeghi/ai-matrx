import {
  generateVaultPassword,
  parseEnvAssignment,
  safeVaultLoginUrl,
} from "@/features/secrets/utils";
import { recommendedHandlingForFieldKey } from "@/features/secrets/credential-identity";
import { normalizeVaultHandling } from "@/features/secrets/types";

describe("normalizeVaultHandling", () => {
  test("materializes the server default and preserves every supported level", () => {
    expect(normalizeVaultHandling(undefined)).toBe("revealable");
    expect(normalizeVaultHandling("visible")).toBe("visible");
    expect(normalizeVaultHandling("revealable")).toBe("revealable");
    expect(normalizeVaultHandling("sealed")).toBe("sealed");
  });

  test("rejects invalid stored protection data loudly", () => {
    expect(() => normalizeVaultHandling("encrypted-ish")).toThrow(
      "Invalid Vault protection value",
    );
  });
});

describe("recommendedHandlingForFieldKey", () => {
  test.each(["username", "email", "account_id", "client_id"])(
    "defaults %s to visible",
    (fieldKey) => {
      expect(recommendedHandlingForFieldKey(fieldKey)).toBe("visible");
    },
  );

  test.each(["password", "api_key", "token", "custom_value"])(
    "defaults %s to revealable",
    (fieldKey) => {
      expect(recommendedHandlingForFieldKey(fieldKey)).toBe("revealable");
    },
  );
});

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

describe("safeVaultLoginUrl", () => {
  test("accepts only absolute HTTP(S) destinations", () => {
    expect(safeVaultLoginUrl("https://example.com/login")).toBe(
      "https://example.com/login",
    );
    expect(safeVaultLoginUrl("http://localhost:3000/sign-in")).toBe(
      "http://localhost:3000/sign-in",
    );
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "example.com/login",
    "/relative/login",
    "not a url",
  ])("refuses unsafe or ambiguous destination %s", (value) => {
    expect(safeVaultLoginUrl(value)).toBeNull();
  });
});
