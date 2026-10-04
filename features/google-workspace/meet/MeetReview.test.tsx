import React, { StrictMode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MeetReviewBody, type MeetReviewContext } from "./MeetReview";
import type { MeetConferencePreviewPage, MeetReviewService, MeetTranscriptEntriesPreview } from "./service";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/google-workspace/GoogleAccountSelect", () => ({
  GoogleAccountSelect: ({ connections, onConnectionChange, disabled }: { connections: GoogleConnectionSummary[]; onConnectionChange: (id: string) => void; disabled: boolean }) => (
    <div>{connections.map((item) => <button key={item.id} type="button" disabled={disabled} onClick={() => onConnectionChange(item.id)}>Choose {item.account_email}</button>)}</div>
  ),
}));
jest.mock("@/lib/layout/useClippedContentGuard", () => ({ useClippedContentGuard: () => undefined }));

const connection = (id = "account-1", overrides: Partial<GoogleConnectionSummary> = {}): GoogleConnectionSummary => ({
  id, owner_type: "user", owner_user_id: "actor-1", organization_id: null, provider: "google",
  provider_subject: `subject-${id}`, account_email: `${id}@mail.invalid`, account_name: "Harbor Dental reviewer",
  scopes: [GOOGLE_SCOPE.meetingsSpaceReadonly], status: "connected", last_verified_at: null, last_error: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", metadata: {}, credential_present: true,
  credential_stable: true, health: "connected", capability_health: {}, ...overrides,
});
const conferencePage = (overrides: Partial<MeetConferencePreviewPage> = {}): MeetConferencePreviewPage => ({
  access_mode: "internal_test_read_only",
  conferences: [{
    name: "conferenceRecords/harbor-team", space_name: "spaces/harbor-dental-weekly-review",
    start_time: "2026-01-02T17:00:00Z", end_time: "2026-01-02T18:00:00Z",
    transcripts: { state: "available", names: ["conferenceRecords/harbor-team/transcripts/care-review"] },
    recordings: { state: "none", names: [] },
  }],
  next_page_token: null,
  ...overrides,
});
const transcriptPage = (overrides: Partial<MeetTranscriptEntriesPreview> = {}): MeetTranscriptEntriesPreview => ({
  access_mode: "internal_test_read_only", conference_record_name: "conferenceRecords/harbor-team",
  transcript_name: "conferenceRecords/harbor-team/transcripts/care-review",
  entries: [{ name: "conferenceRecords/harbor-team/transcripts/care-review/entries/opening", start_time: "2026-01-02T17:00:02Z", end_time: "2026-01-02T17:00:06Z", text: "<b>Review the treatment follow-up list.</b>" }],
  next_page_token: null,
  ...overrides,
});
const service = (override: Partial<MeetReviewService> = {}): MeetReviewService => ({
  previewConferences: jest.fn(async () => conferencePage()),
  previewTranscriptEntries: jest.fn(async () => transcriptPage()),
  ...override,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const mountedRoots = new Set<Root>();
function mount(instance: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.add(root);
  act(() => { root.render(instance); });
  return { host, rerender: (next: React.ReactNode) => act(() => root.render(next)) };
}
function setInput(host: HTMLElement, index: number, value: string) {
  const element = host.querySelectorAll("input")[index] as HTMLInputElement | undefined;
  if (!element) throw new Error(`Missing input ${index}`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(host: HTMLElement, label: string) {
  const found = Array.from(host.querySelectorAll("button")).find((element) => element.textContent?.includes(label)) as HTMLButtonElement | undefined;
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function context(overrides: Partial<MeetReviewContext> = {}): MeetReviewContext {
  return { organizationId: "org-harbor", actorId: "actor-1", connections: [connection()], ...overrides };
}
function selectAndBound(host: HTMLElement) {
  act(() => button(host, "Choose account-1@mail.invalid").click());
  setInput(host, 0, "2026-01-02T09:00");
  setInput(host, 1, "2026-01-02T10:00");
}

describe("MeetReviewBody", () => {
  afterEach(() => {
    for (const root of mountedRoots) act(() => root.unmount());
    mountedRoots.clear();
    document.body.innerHTML = "";
  });

  it("does not read conferences before an explicit account selection", () => {
    const transport = service();
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    setInput(view.host, 0, "2026-01-02T09:00");
    setInput(view.host, 1, "2026-01-02T10:00");
    expect(button(view.host, "Preview conferences").disabled).toBe(true);
    expect(transport.previewConferences).not.toHaveBeenCalled();
  });

  it("settles a real asynchronous conference request under StrictMode", async () => {
    const pending = deferred<MeetConferencePreviewPage>();
    const transport = service({ previewConferences: jest.fn(() => pending.promise) });
    const view = mount(<StrictMode><MeetReviewBody context={context()} service={transport} /></StrictMode>);
    selectAndBound(view.host);
    act(() => button(view.host, "Preview conferences").click());
    expect(view.host.textContent).toContain("Previewing conferences");
    await act(async () => { pending.resolve(conferencePage()); await pending.promise; });
    expect(view.host.textContent).toContain("spaces/harbor-dental-weekly-review");
    expect(view.host.textContent).not.toContain("Previewing conferences");
  });

  it("reads entries only after explicit conference and transcript choices and renders literal text", async () => {
    const transport = service();
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    selectAndBound(view.host);
    setInput(view.host, 2, " harbor-weekly ");
    await act(async () => { button(view.host, "Preview conferences").click(); });
    expect(transport.previewConferences).toHaveBeenCalledWith({ connection_id: "account-1", start_time: expect.stringMatching(/^2026-01-02T.*Z$/), end_time: expect.stringMatching(/^2026-01-02T.*Z$/), meeting_code: " harbor-weekly ", page_token: null }, "org-harbor");
    expect(transport.previewTranscriptEntries).not.toHaveBeenCalled();
    act(() => button(view.host, "spaces/harbor-dental-weekly-review").click());
    expect(transport.previewTranscriptEntries).not.toHaveBeenCalled();
    await act(async () => { button(view.host, "conferenceRecords/harbor-team/transcripts/care-review").click(); });
    expect(transport.previewTranscriptEntries).toHaveBeenCalledWith({ connection_id: "account-1", conference_record_name: "conferenceRecords/harbor-team", transcript_name: "conferenceRecords/harbor-team/transcripts/care-review", page_token: null }, "org-harbor");
    expect(view.host.textContent).toContain("<b>Review the treatment follow-up list.</b>");
    expect(view.host.querySelector("article b")).toBeNull();
  });

  it("discards a pending result when the eligible inventory identity changes", async () => {
    const pending = deferred<MeetConferencePreviewPage>();
    const transport = service({ previewConferences: jest.fn(() => pending.promise) });
    const original = connection();
    const view = mount(<MeetReviewBody context={context({ connections: [original] })} service={transport} />);
    selectAndBound(view.host);
    act(() => button(view.host, "Preview conferences").click());
    view.rerender(<MeetReviewBody context={context({ connections: [{ ...original, provider_subject: "replacement-subject" }] })} service={transport} />);
    await act(async () => { pending.resolve(conferencePage()); await pending.promise; });
    expect(view.host.textContent).not.toContain("spaces/harbor-dental-weekly-review");
    expect(view.host.textContent).toContain("Choose account-1@mail.invalid");
  });

  it("removes a selected account and its pending result when inventory eligibility is lost", async () => {
    const pending = deferred<MeetConferencePreviewPage>();
    const transport = service({ previewConferences: jest.fn(() => pending.promise) });
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    selectAndBound(view.host);
    act(() => button(view.host, "Preview conferences").click());
    view.rerender(<MeetReviewBody context={context({ connections: [connection("account-1", { scopes: [] })] })} service={transport} />);
    await act(async () => { pending.resolve(conferencePage()); await pending.promise; });
    expect(view.host.textContent).not.toContain("spaces/harbor-dental-weekly-review");
    expect(view.host.textContent).toContain("No connected account has Meet read access.");
    expect(button(view.host, "Preview conferences").disabled).toBe(true);
  });

  it("discards a pending result when the organization changes", async () => {
    const pending = deferred<MeetConferencePreviewPage>();
    const transport = service({ previewConferences: jest.fn(() => pending.promise) });
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    selectAndBound(view.host);
    act(() => button(view.host, "Preview conferences").click());
    view.rerender(<MeetReviewBody context={context({ organizationId: "org-riverside" })} service={transport} />);
    await act(async () => { pending.resolve(conferencePage()); await pending.promise; });
    expect(view.host.textContent).not.toContain("spaces/harbor-dental-weekly-review");
    expect(transport.previewConferences).toHaveBeenCalledTimes(1);
  });

  it("keeps the newer query visible when an older request settles last", async () => {
    const oldRequest = deferred<MeetConferencePreviewPage>();
    const newerPage = conferencePage({ conferences: [{
      ...conferencePage().conferences[0],
      name: "conferenceRecords/riverside-review",
      space_name: "spaces/riverside-care-review",
      transcripts: { state: "none", names: [] },
    }] });
    const transport = service({ previewConferences: jest.fn().mockImplementationOnce(() => oldRequest.promise).mockResolvedValueOnce(newerPage) });
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    selectAndBound(view.host);
    setInput(view.host, 2, "older-code");
    act(() => button(view.host, "Preview conferences").click());
    setInput(view.host, 2, "newer-code");
    await act(async () => { button(view.host, "Preview conferences").click(); });
    expect(view.host.textContent).toContain("spaces/riverside-care-review");
    await act(async () => { oldRequest.resolve(conferencePage()); await oldRequest.promise; });
    expect(view.host.textContent).toContain("spaces/riverside-care-review");
    expect(view.host.textContent).not.toContain("spaces/harbor-dental-weekly-review");
  });

  it("clears old conferences when a fresh request fails and retains an exact retry", async () => {
    const transport = service({ previewConferences: jest.fn().mockResolvedValueOnce(conferencePage()).mockRejectedValueOnce(new Error("Provider window unavailable")).mockResolvedValueOnce(conferencePage({ conferences: [] })) });
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    selectAndBound(view.host);
    await act(async () => { button(view.host, "Preview conferences").click(); });
    expect(view.host.textContent).toContain("spaces/harbor-dental-weekly-review");
    await act(async () => { button(view.host, "Preview conferences").click(); });
    expect(view.host.textContent).not.toContain("spaces/harbor-dental-weekly-review");
    expect(view.host.textContent).toContain("Provider window unavailable");
    const failedPayload = jest.mocked(transport.previewConferences).mock.calls[1];
    await act(async () => { button(view.host, "Retry conference preview").click(); });
    expect(jest.mocked(transport.previewConferences).mock.calls[2]).toEqual(failedPayload);
    expect(view.host.textContent).toContain("No conferences matched this source window.");
  });

  it("retries failed conference pagination with the frozen source payload", async () => {
    const transport = service({ previewConferences: jest.fn().mockResolvedValueOnce(conferencePage({ next_page_token: "page-two" })).mockRejectedValueOnce(new Error("Page read failed")).mockResolvedValueOnce(conferencePage({ conferences: [] })) });
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    selectAndBound(view.host);
    setInput(view.host, 2, "frozen-code");
    await act(async () => { button(view.host, "Preview conferences").click(); });
    await act(async () => { button(view.host, "Next conferences").click(); });
    expect(view.host.textContent).not.toContain("spaces/harbor-dental-weekly-review");
    const failedPayload = jest.mocked(transport.previewConferences).mock.calls[1];
    expect(failedPayload[0]).toMatchObject({ meeting_code: "frozen-code", page_token: "page-two" });
    await act(async () => { button(view.host, "Retry conference preview").click(); });
    expect(jest.mocked(transport.previewConferences).mock.calls[2]).toEqual(failedPayload);
  });

  it("guards duplicate conference preview clicks synchronously", async () => {
    const pending = deferred<MeetConferencePreviewPage>();
    const transport = service({ previewConferences: jest.fn(() => pending.promise) });
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    selectAndBound(view.host);
    const preview = button(view.host, "Preview conferences");
    act(() => { preview.click(); preview.click(); });
    expect(transport.previewConferences).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(conferencePage()); await pending.promise; });
  });

  it("guards duplicate transcript entry clicks synchronously", async () => {
    const pending = deferred<MeetTranscriptEntriesPreview>();
    const transport = service({ previewTranscriptEntries: jest.fn(() => pending.promise) });
    const view = mount(<MeetReviewBody context={context()} service={transport} />);
    selectAndBound(view.host);
    await act(async () => { button(view.host, "Preview conferences").click(); });
    act(() => button(view.host, "spaces/harbor-dental-weekly-review").click());
    const transcript = button(view.host, "conferenceRecords/harbor-team/transcripts/care-review");
    act(() => { transcript.click(); transcript.click(); });
    expect(transport.previewTranscriptEntries).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(transcriptPage()); await pending.promise; });
  });
});
