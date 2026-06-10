// app/(core)/podcast/studio/create-f/_components/types.ts
//
// Shared draft shape for the create-f composer — the full configuration the
// user assembles before launching a run.

export interface EpisodeDraft {
  sourceKind: string;
  sourceText: string;
  language: string;
  format: string;
  hosts: string;
  length: string;
  showId: string | null;
  extraInstruction: string;
  testMode: boolean;
}

export const INITIAL_DRAFT: EpisodeDraft = {
  sourceKind: "topic",
  sourceText: "",
  language: "en-US",
  format: "educational",
  hosts: "2",
  length: "standard",
  showId: null,
  extraInstruction: "",
  testMode: true,
};
