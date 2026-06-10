// app/(core)/podcast/studio/create-a/_mock/shows.ts
//
// Static mock shows for the demo create page (no backend call). The real page
// loads these via useMyPodcasts; here we just need a few to populate the
// "Add to show" picker.

export interface MockShow {
  id: string;
  title: string;
}

export const MOCK_SHOWS: MockShow[] = [
  { id: "show-1", title: "The Deep Dive" },
  { id: "show-2", title: "Morning Briefing" },
  { id: "show-3", title: "Founders & Functions" },
];
