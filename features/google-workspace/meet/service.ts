import type { components } from "@ai-matrx/agents/generated/api-types";
import { postGoogleBackend } from "@/features/marketing/google/service";

/** Published Google Meet contracts: never shadow these shapes locally. */
export type MeetConferencePreviewRequest =
  components["schemas"]["MeetConferencePreviewRequest"];
export type MeetConferencePreviewPage =
  components["schemas"]["MeetConferencePreviewPage"];
export type MeetTranscriptEntriesRequest =
  components["schemas"]["MeetTranscriptEntriesRequest"];
export type MeetTranscriptEntriesPreview =
  components["schemas"]["MeetTranscriptEntriesPreview"];

export interface MeetReviewService {
  previewConferences(
    request: MeetConferencePreviewRequest,
    organizationId: string,
  ): Promise<MeetConferencePreviewPage>;
  previewTranscriptEntries(
    request: MeetTranscriptEntriesRequest,
    organizationId: string,
  ): Promise<MeetTranscriptEntriesPreview>;
}

const conferencePath = "/google-integrations/meet/conferences/preview";
const transcriptPath = "/google-integrations/meet/transcripts/entries/preview";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string";
}
function nonempty(value: unknown): value is string {
  return text(value) && value.length > 0;
}
function instant(value: unknown): value is string {
  return (
    nonempty(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    !Number.isNaN(Date.parse(value))
  );
}
function names(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(nonempty));
}
function state(value: unknown): value is "available" | "incomplete" | "none" {
  return value === "available" || value === "incomplete" || value === "none";
}

/** Refuse malformed provider data before it can be presented as current evidence. */
export function validateConferencePage(
  value: unknown,
): MeetConferencePreviewPage {
  if (
    !record(value) ||
    value.access_mode !== "internal_test_read_only" ||
    !Array.isArray(value.conferences)
  ) {
    throw new Error(
      "The Meet conference preview was not an internal read-only result.",
    );
  }
  for (const conference of value.conferences) {
    if (
      !record(conference) ||
      !nonempty(conference.name) ||
      !/^conferenceRecords\/[^/]+$/.test(conference.name) ||
      !nonempty(conference.space_name) ||
      !/^spaces\/[^/]+$/.test(conference.space_name) ||
      (conference.start_time != null && !instant(conference.start_time)) ||
      (conference.end_time != null && !instant(conference.end_time)) ||
      !record(conference.transcripts) ||
      !state(conference.transcripts.state) ||
      !names(conference.transcripts.names) ||
      !record(conference.recordings) ||
      !state(conference.recordings.state) ||
      !names(conference.recordings.names) ||
      (Array.isArray(conference.transcripts.names) &&
        !conference.transcripts.names.every(
          (name) =>
            /^conferenceRecords\/[^/]+\/transcripts\/[^/]+$/.test(name) &&
            name.startsWith(`${conference.name}/transcripts/`),
        )) ||
      (Array.isArray(conference.recordings.names) &&
        !conference.recordings.names.every(
          (name) =>
            /^conferenceRecords\/[^/]+\/recordings\/[^/]+$/.test(name) &&
            name.startsWith(`${conference.name}/recordings/`),
        ))
    ) {
      throw new Error(
        "The Meet conference preview included an invalid record.",
      );
    }
  }
  if (value.next_page_token != null && !nonempty(value.next_page_token))
    throw new Error("The Meet conference page token was invalid.");
  return value as MeetConferencePreviewPage;
}

export function validateTranscriptPage(
  value: unknown,
  expected: Pick<
    MeetTranscriptEntriesRequest,
    "conference_record_name" | "transcript_name"
  >,
): MeetTranscriptEntriesPreview {
  const conferenceName = expected.conference_record_name;
  const transcriptName = expected.transcript_name;
  if (
    !/^conferenceRecords\/[^/]+$/.test(conferenceName) ||
    !/^conferenceRecords\/[^/]+\/transcripts\/[^/]+$/.test(transcriptName) ||
    !transcriptName.startsWith(`${conferenceName}/transcripts/`)
  ) {
    throw new Error(
      "The selected Meet transcript did not have a valid provider parent.",
    );
  }
  if (!record(value) || value.access_mode !== "internal_test_read_only") {
    throw new Error(
      "The Meet transcript preview was not an internal read-only result.",
    );
  }
  if (
    value.conference_record_name !== conferenceName ||
    value.transcript_name !== transcriptName ||
    !Array.isArray(value.entries)
  ) {
    throw new Error(
      "The Meet transcript preview did not match the selected transcript.",
    );
  }
  for (const entry of value.entries) {
    if (
      !record(entry) ||
      !nonempty(entry.name) ||
      !entry.name.startsWith(`${transcriptName}/entries/`) ||
      entry.name.split("/").length !== transcriptName.split("/").length + 2 ||
      !text(entry.text) ||
      (entry.start_time != null && !instant(entry.start_time)) ||
      (entry.end_time != null && !instant(entry.end_time))
    ) {
      throw new Error("The Meet transcript preview included an invalid entry.");
    }
  }
  if (value.next_page_token != null && !nonempty(value.next_page_token))
    throw new Error("The Meet transcript page token was invalid.");
  return value as MeetTranscriptEntriesPreview;
}

export const googleMeetReviewService: MeetReviewService = {
  async previewConferences(request, organizationId) {
    const response = await postGoogleBackend(
      conferencePath,
      request,
      "Unable to preview Meet conferences.",
      organizationId,
    );
    return validateConferencePage(await response.json());
  },
  async previewTranscriptEntries(request, organizationId) {
    const response = await postGoogleBackend(
      transcriptPath,
      request,
      "Unable to preview Meet transcript entries.",
      organizationId,
    );
    return validateTranscriptPage(await response.json(), request);
  },
};
