import { bridgeReadHealth, fidelityVerdict } from "../verdict";
import { CODING_SESSION_PROVIDER_META, providerMeta } from "../catalog";
import {
  APP_META,
  describeSource,
} from "@/features/agents/redux/conversation-history/source-registry";

describe("coding-session provider vocabulary", () => {
  it("maps storage enums to the exact conversation source_app slugs", () => {
    expect(
      Object.values(CODING_SESSION_PROVIDER_META).map((provider) => [
        provider.provider,
        provider.sourceApp,
      ]),
    ).toEqual([
      ["claude_code", "claude-code"],
      ["codex", "codex"],
      ["cursor", "cursor"],
      ["vscode", "vscode"],
    ]);
  });

  it("does not guess metadata for an unknown provider", () => {
    expect(providerMeta("other")).toBeNull();
  });

  it("registers every provider in the canonical conversation source display", () => {
    for (const provider of Object.values(CODING_SESSION_PROVIDER_META)) {
      expect(APP_META[provider.sourceApp]?.label).toBe(provider.label);
      expect(describeSource(provider.sourceApp, "code-editor")).toBe(
        `${provider.label} · Code`,
      );
    }
  });
});

describe("coding-session fidelity verdicts", () => {
  it("never describes an event mirror as native resume", () => {
    const verdict = fidelityVerdict("event_mirror");
    expect(verdict.label).toBe("Event mirror");
    expect(verdict.detail).toContain("seeded handoff");
    expect(verdict.nativeResumeClaimed).toBe(false);
  });

  it("lists the remaining native resume prerequisites", () => {
    const verdict = fidelityVerdict("native");
    expect(verdict.label).toBe("Native ledger");
    expect(verdict.detail).toContain("workspace");
    expect(verdict.detail).toContain("writer lease");
    expect(verdict.nativeResumeClaimed).toBe(false);
  });

  it("fails closed for an unknown fidelity", () => {
    expect(fidelityVerdict("mystery").tone).toBe("unknown");
  });
});

describe("coding-session storage health", () => {
  const now = Date.parse("2026-08-09T12:00:00Z");

  it("distinguishes an empty successful read from a failed read", () => {
    expect(bridgeReadHealth(null, true, now).label).toBe("Storage reachable");
    expect(bridgeReadHealth(null, false, now).label).toBe("Status unavailable");
  });

  it("reports recent and stale activity without inferring installation", () => {
    expect(bridgeReadHealth("2026-08-09T11:50:00Z", true, now).tone).toBe(
      "healthy",
    );
    expect(bridgeReadHealth("2026-08-09T08:00:00Z", true, now).tone).toBe(
      "stale",
    );
  });
});
