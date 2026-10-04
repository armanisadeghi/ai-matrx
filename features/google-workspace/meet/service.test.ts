import { eligibleMeetConnections } from "./MeetReview";
import {
  googleMeetReviewService,
  validateConferencePage,
  validateTranscriptPage,
  type MeetConferencePreviewPage,
  type MeetConferencePreviewRequest,
  type MeetTranscriptEntriesPreview,
  type MeetTranscriptEntriesRequest,
} from "./service";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";

const postGoogleBackend = jest.fn();
jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => postGoogleBackend(...args),
}));

const connection = (overrides: Partial<GoogleConnectionSummary> = {}): GoogleConnectionSummary => ({
  id: "connection-harbor", owner_type: "user", owner_user_id: "actor-harbor", organization_id: null,
  provider: "google", provider_subject: "subject-harbor", account_email: "reviewer@mail.invalid", account_name: "Harbor Dental reviewer",
  scopes: [GOOGLE_SCOPE.meetingsSpaceReadonly], status: "connected", last_verified_at: null, last_error: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", metadata: {}, credential_present: true,
  credential_stable: true, health: "connected", capability_health: {}, ...overrides,
});
const conferenceResponse = {
  access_mode: "internal_test_read_only",
  conferences: [{
    name: "conferenceRecords/harbor-weekly", space_name: "spaces/harbor-dental-review",
    start_time: "2026-01-02T17:00:00Z", end_time: "2026-01-02T18:00:00+00:00",
    transcripts: { state: "available", names: ["conferenceRecords/harbor-weekly/transcripts/care-review"] },
    recordings: { state: "available", names: ["conferenceRecords/harbor-weekly/recordings/care-review"] },
  }],
  next_page_token: "conference-page-two",
} satisfies MeetConferencePreviewPage;
const transcriptResponse = {
  access_mode: "internal_test_read_only",
  conference_record_name: "conferenceRecords/harbor-weekly",
  transcript_name: "conferenceRecords/harbor-weekly/transcripts/care-review",
  entries: [{
    name: "conferenceRecords/harbor-weekly/transcripts/care-review/entries/opening",
    start_time: "2026-01-02T17:00:01.250Z", end_time: null, text: "",
  }],
  next_page_token: null,
} satisfies MeetTranscriptEntriesPreview;
const conferenceRequest = {
  connection_id: "connection-harbor", start_time: "2026-01-02T17:00:00Z", end_time: "2026-01-02T18:00:00Z",
  meeting_code: "harbor-weekly", page_token: "conference-page-two",
} satisfies MeetConferencePreviewRequest;
const transcriptRequest = {
  connection_id: "connection-harbor", conference_record_name: "conferenceRecords/harbor-weekly",
  transcript_name: "conferenceRecords/harbor-weekly/transcripts/care-review", page_token: "entry-page-two",
} satisfies MeetTranscriptEntriesRequest;

describe("Meet reviewer provider boundary", () => {
  beforeEach(() => postGoogleBackend.mockReset());

  it("offers only the current actor's connected personal account with the exact Meet scope", () => {
    expect(eligibleMeetConnections([
      connection(),
      connection({ id: "foreign", owner_user_id: "actor-riverside" }),
      connection({ id: "organization", owner_type: "organization", owner_user_id: null, organization_id: "org-harbor" }),
      connection({ id: "missing-scope", scopes: ["openid"] }),
      connection({ id: "reauth", health: "needs_reauth" }),
    ], "actor-harbor").map((item) => item.id)).toEqual(["connection-harbor"]);
  });

  it("sends the canonical conference request unchanged with explicit organization context", async () => {
    postGoogleBackend.mockResolvedValue({ json: async () => conferenceResponse });
    await expect(googleMeetReviewService.previewConferences(conferenceRequest, "org-harbor")).resolves.toEqual(conferenceResponse);
    expect(postGoogleBackend).toHaveBeenCalledWith(
      "/google-integrations/meet/conferences/preview",
      conferenceRequest,
      "Unable to preview Meet conferences.",
      "org-harbor",
    );
  });

  it("sends the canonical transcript request unchanged with explicit organization context", async () => {
    postGoogleBackend.mockResolvedValue({ json: async () => transcriptResponse });
    await expect(googleMeetReviewService.previewTranscriptEntries(transcriptRequest, "org-harbor")).resolves.toEqual(transcriptResponse);
    expect(postGoogleBackend).toHaveBeenCalledWith(
      "/google-integrations/meet/transcripts/entries/preview",
      transcriptRequest,
      "Unable to preview Meet transcript entries.",
      "org-harbor",
    );
  });

  it.each([
    [{ ...conferenceResponse, access_mode: "write" }, "internal read-only"],
    [{ ...conferenceResponse, conferences: [{ ...conferenceResponse.conferences[0], name: "conference/harbor-weekly" }] }, "invalid record"],
    [{ ...conferenceResponse, conferences: [{ ...conferenceResponse.conferences[0], space_name: "room/harbor" }] }, "invalid record"],
    [{ ...conferenceResponse, conferences: [{ ...conferenceResponse.conferences[0], start_time: "2026-01-02 17:00:00" }] }, "invalid record"],
    [{ ...conferenceResponse, conferences: [{ ...conferenceResponse.conferences[0], transcripts: { state: "ready", names: [] } }] }, "invalid record"],
    [{ ...conferenceResponse, conferences: [{ ...conferenceResponse.conferences[0], recordings: { state: "available", names: ["conferenceRecords/other/recordings/care-review"] } }] }, "invalid record"],
  ])("rejects malformed conference wire data %#", (payload, message) => {
    expect(() => validateConferencePage(payload)).toThrow(message);
  });

  it("preserves empty literal transcript text for the exact selected provider parent", () => {
    expect(validateTranscriptPage(transcriptResponse, transcriptRequest).entries[0]?.text).toBe("");
  });

  it.each([
    [{ ...transcriptResponse, access_mode: undefined }, transcriptRequest, "internal read-only"],
    [{ ...transcriptResponse, conference_record_name: "conferenceRecords/other" }, transcriptRequest, "did not match"],
    [{ ...transcriptResponse, transcript_name: "conferenceRecords/harbor-weekly/transcripts/other" }, transcriptRequest, "did not match"],
    [{ ...transcriptResponse, entries: [{ ...transcriptResponse.entries[0], name: "conferenceRecords/other/transcripts/care-review/entries/opening" }] }, transcriptRequest, "invalid entry"],
    [{ ...transcriptResponse, entries: [{ ...transcriptResponse.entries[0], start_time: "January 2, 2026" }] }, transcriptRequest, "invalid entry"],
    [{ ...transcriptResponse, entries: [{ ...transcriptResponse.entries[0], text: { html: "unsafe" } }] }, transcriptRequest, "invalid entry"],
    [transcriptResponse, { ...transcriptRequest, transcript_name: "transcripts/orphan" }, "valid provider parent"],
  ])("rejects malformed transcript wire data %#", (payload, expected, message) => {
    expect(() => validateTranscriptPage(payload, expected)).toThrow(message);
  });
});
