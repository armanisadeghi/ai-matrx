/**
 * FORCING TESTS for the biggest hole the round-2 hostile verification found under
 * the owner's words (common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R2.md` § A-vii): THE KNOB THAT
 * GOVERNS A PERSON'S OWN GOOGLE WRITES GOVERNED NOTHING.
 *
 * `hitl.google.attended_file_write` is live and overridable by an organization
 * AND by a user, and `gate_mutating_action` wraps the agent tool dispatch table
 * only. The four browser write routes below never passed through it, so an
 * organization that set "review required" changed nothing about what a person's
 * own button did, and no screen said so. Law 6 makes a knob that governs nothing
 * the same defect as no knob at all.
 *
 * The server now judges it (aidream lane B-8) and answers, when the effective
 * mode requires review:
 *
 *     HTTP 202  { "proposed": true, "assist_id": "<uuid>", "mode": "mode_4" }
 *
 * having written NOTHING to Google and filed the change in the ONE approval
 * queue. These tests hold the client half shut: every write returns a union, and
 * every caller says "sent for approval" with the door — never "Written", never
 * "Connect Google", and never a silent success.
 */

const mockPost = jest.fn();

/** A real uuid, so `requireOrganizationContext`'s shape check passes. */
const TEST_ORGANIZATION_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
let mockOrganizationId: string | null = TEST_ORGANIZATION_ID;

jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => mockPost(...args),
}));
jest.mock("@/features/google-workspace/connection", () => ({
  GOOGLE_WORKSPACE_SETTINGS_HREF: "/settings/google",
  resolveGoogleWorkspaceConnection: async () => ({ connectionId: "c1" }),
}));
// The three writes that also birth or keep a `workbench.google_document`
// Record (registerSelectedGoogleFile, documents/create, sheets/create) resolve
// their `organization_id` through the SAME store-singleton kernel
// `organizationContextHeaders` already uses for the header — mocked here so it
// resolves to a real organization rather than throwing
// `OrganizationContextError`.
jest.mock("@/lib/redux/store-singleton", () => ({
  // The organization gate (lib/organization/organization-gate.ts) reads
  // `state.appContext.organization_id` itself, so the store answers in that shape.
  getStoreSingleton: () => ({
    getState: () => ({ appContext: { organization_id: mockOrganizationId } }),
  }),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => mockOrganizationId,
}));

// eslint-disable-next-line import/first -- after the mocks above
import {
  appendGoogleDocument,
  approvalQueueHref,
  createGoogleDocument,
  createGoogleSheet,
  registerSelectedGoogleFile,
  writeGoogleSheet,
} from "@/features/google-workspace/service";
// eslint-disable-next-line import/first -- after the mocks above
import {
  sendContentToGoogleDoc,
  sendRowsToGoogleSheet,
} from "@/features/google-workspace/export/sendToGoogle";
// eslint-disable-next-line import/first -- after the mocks above
import { readFileSync } from "node:fs";
// eslint-disable-next-line import/first -- after the mocks above
import { join } from "node:path";

/** The server's 202 body, field for field. */
function proposedReply(mode = "mode_4") {
  return {
    status: 202,
    json: async () => ({
      proposed: true,
      assist_id: "11111111-2222-3333-4444-555555555555",
      mode,
    }),
  } as unknown as Response;
}

beforeEach(() => {
  mockPost.mockReset();
});

describe("every direct Google write can come back as a proposal", () => {
  it("documents/create", async () => {
    mockPost.mockResolvedValue(proposedReply());
    const outcome = await createGoogleDocument("c1", "T", "body");
    expect(outcome).toEqual({
      proposed: true,
      assistId: "11111111-2222-3333-4444-555555555555",
      mode: "mode_4",
    });
    // 🚨 EVERY WRITE CARRIES AN EXPLICIT organization_id — never a request the
    // server (or a database trigger) is left to pick one for.
    expect(mockPost.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ organization_id: TEST_ORGANIZATION_ID }),
    );
  });

  it("sheets/create", async () => {
    mockPost.mockResolvedValue(proposedReply("mode_5"));
    const outcome = await createGoogleSheet("c1", "T", [["a"]]);
    expect(outcome.proposed).toBe(true);
    expect(mockPost.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ organization_id: TEST_ORGANIZATION_ID }),
    );
  });

  it("documents/append", async () => {
    mockPost.mockResolvedValue(proposedReply());
    const outcome = await appendGoogleDocument("c1", "doc-1", "more");
    expect(outcome.proposed).toBe(true);
  });

  it("sheets/write", async () => {
    mockPost.mockResolvedValue(proposedReply());
    const outcome = await writeGoogleSheet("c1", "sheet-1", "A1:B2", [["a"]]);
    expect(outcome.proposed).toBe(true);
  });

  it("still returns the written file on an ordinary 200", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      json: async () => ({
        id: "r1",
        connection_id: "c1",
        resource_type: "google_document",
        file_id: "doc-1",
        name: "Q3 retro",
        mime_type: "application/vnd.google-apps.document",
        web_view_link: "https://docs.google.com/document/d/doc-1",
      }),
    } as unknown as Response);
    const outcome = await createGoogleDocument("c1", "Q3 retro", "body");
    expect(outcome.proposed).toBe(false);
    if (!outcome.proposed) expect(outcome.result.name).toBe("Q3 retro");
  });

  /**
   * 🚨 F-74 — the parser keeps the Record the registration wrote (aidream F-57,
   * R29), instead of dropping it on the floor. Red on HEAD: `SelectedGoogleFile`
   * carried no `recordId`/`recordSyncStatus` fields at all, so a caller holding
   * this answer had nothing to hand `useOpenGoogleDocumentRecord`.
   */
  it("keeps the record the registration wrote — recordId and its sync status", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      json: async () => ({
        id: "r1",
        connection_id: "c1",
        resource_type: "google_document",
        file_id: "doc-1",
        name: "Q3 retro",
        mime_type: "application/vnd.google-apps.document",
        web_view_link: "https://docs.google.com/document/d/doc-1",
        record_id: "record-1",
        record_sync_status: "available",
        record_sync_status_reason: null,
        record_absent_reason: null,
      }),
    } as unknown as Response);
    const outcome = await createGoogleDocument("c1", "Q3 retro", "body");
    expect(outcome.proposed).toBe(false);
    if (outcome.proposed) throw new Error("unreachable");
    expect(outcome.result.recordId).toBe("record-1");
    expect(outcome.result.recordSyncStatus).toBe("available");
    expect(outcome.result.recordAbsentReason).toBeNull();
  });

  /**
   * 🚨 F-74 — a call site with no organization in reach fails loudly, BEFORE any
   * network call: it never sends the request without one (Law: every write
   * carries an explicit `organization_id`; no resolver picks one).
   */
  it("registerSelectedGoogleFile refuses to send with no organization in reach — no request is sent", async () => {
    mockOrganizationId = null;
    mockPost.mockClear();
    await expect(
      registerSelectedGoogleFile("c1", "file-1"),
    ).rejects.toThrow(/select an organization/i);
    expect(mockPost).not.toHaveBeenCalled();
    mockOrganizationId = TEST_ORGANIZATION_ID;
  });

  it("REFUSES a 202 that does not say which approval, rather than reporting success", async () => {
    mockPost.mockResolvedValue({
      status: 202,
      json: async () => ({ proposed: true }),
    } as unknown as Response);
    await expect(createGoogleDocument("c1", "T", "x")).rejects.toThrow(
      /did not say which one/i,
    );
  });
});

describe("the two export callers say it was sent for approval, with the door", () => {
  it("sendContentToGoogleDoc", async () => {
    mockPost.mockResolvedValue(proposedReply());
    const result = await sendContentToGoogleDoc("hello", "Notes");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("proposed");
    if (result.reason !== "proposed") throw new Error("unreachable");
    expect(result.message).toContain("Sent for approval");
    expect(result.queueHref).toBe(
      approvalQueueHref("11111111-2222-3333-4444-555555555555"),
    );
    // The two lies this replaces: "Created …" and "Connect Google".
    expect(result.message).not.toMatch(/created|connect/i);
  });

  it("sendRowsToGoogleSheet", async () => {
    mockPost.mockResolvedValue(proposedReply());
    const result = await sendRowsToGoogleSheet([{ a: 1 }], "Rows");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("proposed");
    if (result.reason !== "proposed") throw new Error("unreachable");
    expect(result.queueHref).toContain("/approvals?item=");
  });
});

/**
 * The review workspace's own 202 branch. It is asserted STATICALLY and says so:
 * mounting that component needs the whole Google connection inventory, the Drive
 * picker and Redux, and a mock deep enough to host it would prove less than the
 * two things this reads — that both of its write calls check `outcome.proposed`
 * before any success toast, and that the success toasts are reached only after.
 */
describe("the review workspace checks before it claims a write happened", () => {
  const source = readFileSync(
    join(__dirname, "GoogleWorkspaceReviewWorkspace.tsx"),
    "utf8",
  );

  it("branches on the proposal for its write", () => {
    // ONE write, since F-58: the Doc append left this bench for the Record's own
    // Detail composer (the only place that previews the exact block and stamps
    // the dated heading), so the Sheets range write is all that remains here.
    // Every write that IS here still checks the 202 before it claims anything.
    const branches = source.match(/if \(outcome\.proposed\)/g) ?? [];
    expect(branches).toHaveLength(1);
    expect(source).toContain("sentForApproval(outcome.assistId)");
    // And the bespoke Doc append never comes back.
    expect(source).not.toContain("appendGoogleDocument");
  });

  it("says it was sent for approval, and opens the queue row", () => {
    expect(source).toContain("SENT_FOR_APPROVAL_MESSAGE");
    expect(source).toContain("approvalQueueHref(assistId)");
  });

  it("never reads a write result without going through the union", () => {
    // Inside `writeSelectedRange` only. The READ path above it
    // (`readSelectedRange`) is untouched and still reads `result.values` /
    // `result.range` — narrowing to the write body is what makes this assertion
    // mean anything.
    const start = source.indexOf("const writeSelectedRange = ");
    const end = source.indexOf("const sendEmail = ");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const writeBody = source.slice(start, end);
    // `result.values` / `result.range` were the pre-fix reads; everything now
    // comes off `outcome.result`, after the branch.
    expect(writeBody).not.toMatch(/(?<!outcome\.)\bresult\.(text|values|range)\b/);
    expect(writeBody).toContain("outcome.result.values");
    expect(writeBody).toContain("outcome.result.range");
  });
});
