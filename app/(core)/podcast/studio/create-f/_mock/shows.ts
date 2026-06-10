// app/(core)/podcast/studio/create-f/_mock/shows.ts
//
// Static mock shows for the create-f demo (no backend). Adapted from create-a's
// shows mock, enriched with the presentation fields this variant's destination
// picker shows (episode count + accent so each show reads as a real channel).

export interface MockShow {
  id: string;
  title: string;
  episodeCount: number;
  /** A semantic-token tint key used for the show's avatar chip. */
  tint: "primary" | "sky" | "violet" | "emerald" | "amber";
}

export const MOCK_SHOWS: MockShow[] = [
  { id: "show-1", title: "The Deep Dive", episodeCount: 42, tint: "primary" },
  { id: "show-2", title: "Morning Briefing", episodeCount: 118, tint: "sky" },
  { id: "show-3", title: "Founders & Functions", episodeCount: 9, tint: "violet" },
];
