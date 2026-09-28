import { chapteringOfferVariables } from "../chapteringOffer";

describe("chapteringOfferVariables", () => {
  it("reads the loaded episode + show into offered names, native types", () => {
    expect(
      chapteringOfferVariables({
        duration_seconds: 1834.6,
        title: "Grading pallets",
        description: "How the yard grades pallets",
        episode_number: 12,
        speakers: [
          { name: "Dana", voice: "a" },
          { name: "Lee", voice: "b" },
        ],
        chapters: [
          { start_hint: "00:00", title: "Intro", summary: "Who we are" },
          { start_hint: "04:10", title: "Grades" },
        ] as never,
        show: { title: "Yard Talk" },
      }),
    ).toEqual({
      duration_seconds: 1835,
      episode_title: "Grading pallets",
      episode_description: "How the yard grades pallets",
      episode_number: 12,
      speaker_names: ["Dana", "Lee"],
      show_title: "Yard Talk",
      existing_chapters: "- 00:00 Intro — Who we are\n- 04:10 Grades",
    });
  });

  it("omits every absent fact and never emits a by-name key", () => {
    const v = chapteringOfferVariables({
      duration_seconds: null,
      title: "",
      description: null,
      episode_number: null,
      speakers: null,
      chapters: null,
      show: null,
    }) as Record<string, unknown>;
    expect(v).toEqual({});
    for (const k of ["episode_script", "duration_hint", "granularity_hint"]) {
      expect(k in v).toBe(false);
    }
  });
});
