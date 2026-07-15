import type { Voice } from "../voiceCatalog";
import { buildCast, resolveSpeaker, voicesForProvider } from "../voices";

function voice(
  provider: Voice["provider"],
  providerVoiceId: string,
  gender: Voice["gender"],
): Voice {
  return {
    id: `${provider}-${providerVoiceId}`,
    provider,
    provider_voice_id: providerVoiceId,
    name: providerVoiceId,
    voice_type: "builtin",
    gender,
    accent: null,
    age: null,
    language: null,
    languages: [],
    tags: [],
    quality_score: null,
    description: null,
    style: null,
    sample_url: null,
    preview_url: null,
    enabled: true,
    is_verified: true,
    sort_order: 0,
  };
}

const voices: Voice[] = [
  voice("google", "Orus", "male"),
  voice("google", "Kore", "female"),
  voice("elevenlabs", "eleven-a", "female"),
];

describe("podcast cast helpers", () => {
  it("filters the catalog using the server-selected provider", () => {
    expect(voicesForProvider(voices, "elevenlabs")).toHaveLength(1);
    expect(voicesForProvider(voices, "elevenlabs")[0]?.provider_voice_id).toBe(
      "eleven-a",
    );
  });

  it("preserves the exact server default when no user edit exists", () => {
    const serverDefault = { name: "Alex", voice: "Orus", gender: "male" as const };
    expect(resolveSpeaker(undefined, serverDefault, voices)).toEqual(serverDefault);
  });

  it("applies valid user edits without recomputing the server policy", () => {
    const defaults = [
      { name: "Alex", voice: "Orus", gender: "male" as const },
      { name: "Sarah", voice: "Kore", gender: "female" as const },
    ];

    expect(
      buildCast(2, { 0: { name: "Jordan", voice: "Kore" } }, voices, "google", defaults),
    ).toEqual([
      { name: "Jordan", voice: "Kore", gender: "female" },
      defaults[1],
    ]);
  });

  it("rejects a preview whose size disagrees with host_count", () => {
    expect(() => buildCast(2, {}, voices, "google", [])).toThrow(
      "Server cast preview returned 0 speakers for 2 hosts.",
    );
  });
});
