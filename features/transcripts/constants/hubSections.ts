import type { HubSectionId } from "@/features/transcripts/types/hub";

export const HUB_PAGE_SIZE = 12;

export const HUB_SECTIONS: {
  id: HubSectionId;
  title: string;
}[] = [
  { id: "processor", title: "Transcripts" },
  { id: "session", title: "Sessions" },
  { id: "cleanup", title: "Cleanup" },
  { id: "unsorted", title: "Unsorted" },
];
