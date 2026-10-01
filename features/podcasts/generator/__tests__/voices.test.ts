import type { Voice } from "../voiceCatalog";
import { buildCast, castToSend, resolveSpeaker, voicesForProvider } from "../voices";

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

// Break named (2026-10-01): a pasted finished script (Maya/Daniel) was sent
// with the server's PREVIEW cast (Zara/Leo) the person never chose, and GATE 2
// refused it — "Requested speaker(s) ['Zara', 'Leo'] never speak in the script".
describe("castToSend", () => {
  const preview = {
    provider: "google" as const,
    speakers: [
      { name: "Zara", voice: "Kore", gender: "female" as const },
      { name: "Leo", voice: "Orus", gender: "male" as const },
    ],
  };

  it("lets a finished script's own speakers be the cast when no host was edited", () => {
    expect(
      castToSend({ hostCount: 2, drafts: {}, voices, preview, sourceIsFinishedScript: true }),
    ).toBeUndefined();
  });

  it("sends the person's own edits even for a finished script", () => {
    const cast = castToSend({
      hostCount: 2,
      drafts: { 0: { name: "Maya" }, 1: { name: "Daniel" } },
      voices,
      preview,
      sourceIsFinishedScript: true,
    });
    expect(cast?.map((s) => s.name)).toEqual(["Maya", "Daniel"]);
  });

  it("keeps the previewed cast for a source the script writer will voice", () => {
    const cast = castToSend({ hostCount: 2, drafts: {}, voices, preview, sourceIsFinishedScript: false });
    expect(cast?.map((s) => s.name)).toEqual(["Zara", "Leo"]);
  });

  it("sends nothing when the preview is unavailable", () => {
    expect(
      castToSend({ hostCount: 2, drafts: {}, voices, preview: null, sourceIsFinishedScript: false }),
    ).toBeUndefined();
  });
});
