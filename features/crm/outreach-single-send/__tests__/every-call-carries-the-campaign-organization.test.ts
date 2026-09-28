/**
 * Every outreach single-send call carries the CAMPAIGN's organization explicitly.
 *
 * Root cause this pins (2026-09-28): the draft/approve/send/revise/reject calls
 * relied on the globally SELECTED organization. With none selected (a fresh
 * session, a deep link) the shared client refused every one with "Select an
 * organization before sending this request" — although the dialog already
 * holds the campaign row and its `organization_id`. The record's own
 * organization is the right one to send, and passing it is how the shared
 * client expects an authoritatively-resolved organization (`opts.organizationId`).
 */

const apiPost = jest.fn(async () => ({ data: {}, meta: {} }));
const postJson = jest.fn(async () => ({ data: {}, meta: {} }));
jest.mock("@/lib/api/typed-client", () => ({
  apiPost: (...args: unknown[]) => apiPost(...(args as [])),
  buildPath: (path: string, params: Record<string, string>) =>
    path.replace(/\{(\w+)\}/g, (_m, key: string) => params[key]),
}));
jest.mock("@/lib/python-client", () => ({
  postJson: (...args: unknown[]) => postJson(...(args as [])),
}));

import {
  approveOutreachDraft,
  approveOutreachDrafts,
  createOutreachDraft,
  rejectOutreachDraft,
  reviseOutreachPersonalization,
  sendOutreachDraft,
} from "../service";

const ORG = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";

beforeEach(() => {
  apiPost.mockClear();
  postJson.mockClear();
});

function lastOptions(mock: jest.Mock): unknown {
  const call = mock.mock.calls.at(-1) as unknown[] | undefined;
  return call?.[2];
}

test("create, approve and send name the campaign's organization", async () => {
  await createOutreachDraft({ organizationId: ORG, outreachListId: "l", memberId: "m", templateId: "t" });
  expect(lastOptions(apiPost)).toEqual({ organizationId: ORG });
  await approveOutreachDraft("d1", ORG);
  expect(lastOptions(apiPost)).toEqual({ organizationId: ORG });
  await sendOutreachDraft("d1", ORG);
  expect(lastOptions(apiPost)).toEqual({ organizationId: ORG });
});

test("batch approve, revise and reject name it too", async () => {
  await approveOutreachDrafts(["d1"], ORG);
  expect(lastOptions(postJson)).toEqual({ organizationId: ORG });
  await reviseOutreachPersonalization("d1", { line: "x" }, ORG);
  expect(lastOptions(postJson)).toEqual({ organizationId: ORG });
  await rejectOutreachDraft("d1", ORG, "no");
  expect(lastOptions(postJson)).toEqual({ organizationId: ORG });
});
