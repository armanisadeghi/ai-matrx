import { readFileSync } from "fs";
import { join } from "path";
import { flashcardMandateRefs } from "../data/mandate-disclosure";
import { FC_MANDATES } from "../data/mandates";

describe("Flashcards mandate disclosure", () => {
  it("maps the topic generator to its canonical mandate", () => {
    expect(flashcardMandateRefs(["generateCards"])).toEqual([
      expect.objectContaining({
        mandateKey: FC_MANDATES.generateCards,
        surfaceName: "matrx-user/education-flashcards",
      }),
    ]);
  });

  it.each([
    ["components/create/CreateFromTopic.tsx", "generateCards"],
    ["components/create/CreateFromSource.tsx", "generateFromSource"],
    ["components/set-detail/AddMoreCardsButton.tsx", "generateFromSource"],
    ["components/set-detail/EnhanceSetDialog.tsx", "enrichCard"],
    ["components/set-detail/EnhanceSetDialog.tsx", "expandCard"],
    ["components/study/StudyDeck.tsx", "helpLive"],
    ["components/study/StudyDeck.tsx", "reviewBatch"],
    ["components/study/StudyDeck.tsx", "microCoach"],
    ["components/study/TestSurface.tsx", "makeQuizItems"],
    ["components/study/WriteSurface.tsx", "gradeTypedAnswer"],
    ["components/study/CardDetailLayers.tsx", "enrichCard"],
    ["components/study/CardAudioHelp.tsx", "spokenFrontTts"],
    ["fast-fire/voice-test/SingleCardVoiceTest.tsx", "gradeSpoken"],
    ["components/set-detail/SetDetailView.tsx", "enrichCard"],
    ["components/set-detail/AudioOverviewSection.tsx", "spokenFrontTts"],
    ["components/set-detail/AudioOverviewSection.tsx", "enrichCard"],
    ["components/set-detail/AudioOverviewSection.tsx", "helperTts"],
  ])("registers %s for %s", (relativePath, key) => {
    const source = readFileSync(
      join(process.cwd(), "features/flashcards", relativePath),
      "utf8",
    );
    expect(source).toMatch(/useFlashcardMandates|useDeclaredSurfaceMandates/);
    expect(source).toContain(`\"${key}\"`);
  });

  it("registers the lazy voice tutor only when its panel mounts", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/flashcards/components/study/VoiceTutorPanel.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("useDeclaredSurfaceMandates");
    expect(source).toContain("EDUCATION_VOICE_TUTOR_MANDATE");
  });

  it("registers the memory-hint job at its reusable action boundary", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/education/memory/components/MemoryAidButton.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("useDeclaredSurfaceMandates");
    expect(source).toContain("EDU_MEMORY_MANDATES.memoryHint");
  });

  it("keeps every disclosure key canonical and unique", () => {
    const keys = Object.keys(FC_MANDATES) as (keyof typeof FC_MANDATES)[];
    const refs = flashcardMandateRefs(keys);
    expect(refs.map((ref) => ref.mandateKey)).toEqual(
      keys.map((key) => FC_MANDATES[key]),
    );
    expect(new Set(refs.map((ref) => ref.mandateKey)).size).toBe(refs.length);
  });
});
