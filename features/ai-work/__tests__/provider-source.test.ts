import {
  isProviderSourceApp,
  PROVIDER_SOURCE_APPS,
} from "../lib/providerSource";

describe("provider source gate", () => {
  it("accepts only the four coding-provider provenance values", () => {
    expect(PROVIDER_SOURCE_APPS).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "vscode",
    ]);
    for (const sourceApp of PROVIDER_SOURCE_APPS) {
      expect(isProviderSourceApp(sourceApp)).toBe(true);
    }
  });

  it("rejects normal AI Matrx and lookalike provenance", () => {
    expect(isProviderSourceApp("matrx-frontend")).toBe(false);
    expect(isProviderSourceApp("claude_code")).toBe(false);
    expect(isProviderSourceApp("chatgpt")).toBe(false);
    expect(isProviderSourceApp("claude-ai")).toBe(false);
  });
});
