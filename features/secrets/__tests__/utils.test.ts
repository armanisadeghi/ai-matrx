import { parseEnvAssignment } from "@/features/secrets/utils";

describe("parseEnvAssignment", () => {
  test("parses a pasted key and value", () => {
    expect(parseEnvAssignment("DATA_FOR_SEO_EMAIL=arman@armansadeghi.com")).toEqual({
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
