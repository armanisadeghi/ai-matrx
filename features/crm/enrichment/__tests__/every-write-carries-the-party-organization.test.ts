/**
 * Every enrichment WRITE carries the PARTY's organization explicitly.
 *
 * Root cause this pins (2026-10-06): the journalist card's "Check against a
 * pitch" → "Check fit" sent no request. The textarea updated state fine and the
 * button was enabled; `deriveJournalistBeat` relied on the globally SELECTED
 * organization, and with none selected the shared client refused before any
 * fetch with "Select an organization before sending this request". The same
 * omission sat on every other POST in this service.
 */

const apiPost = jest.fn(async () => ({ data: {}, meta: {} }));
jest.mock("@/lib/api/typed-client", () => ({
  apiPost: (...args: unknown[]) => apiPost(...(args as [])),
  apiGet: jest.fn(async () => ({ data: null, meta: {} })),
  buildPath: (path: string, params: Record<string, string>) =>
    path.replace(/\{(\w+)\}/g, (_m, key: string) => params[key]),
}));

import {
  checkJournalistActivity,
  confirmCandidate,
  deriveJournalistBeat,
  findContacts,
  rejectCandidate,
  verifyAddress,
} from "../service";

const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

function lastOptions(): unknown {
  const call = apiPost.mock.calls.at(-1) as unknown[] | undefined;
  return call?.[2];
}

beforeEach(() => apiPost.mockClear());

test("the pitch fit check and the beat derivation name the party's organization", async () => {
  await deriveJournalistBeat("p1", ORG, "Subject: a pitch");
  expect(lastOptions()).toEqual({ organizationId: ORG });
  await deriveJournalistBeat("p1", ORG);
  expect(lastOptions()).toEqual({ organizationId: ORG });
  await checkJournalistActivity("p1", ORG);
  expect(lastOptions()).toEqual({ organizationId: ORG });
});

test("contact discovery, confirm, reject and verify name it too", async () => {
  await findContacts("p1", ORG, { usePaidProviders: false });
  expect(lastOptions()).toEqual({ organizationId: ORG });
  await confirmCandidate("p1", ORG, "c1", { acceptRoleAddress: false, acceptUnverified: false });
  expect(lastOptions()).toEqual({ organizationId: ORG });
  await rejectCandidate("p1", ORG, "c1", "wrong person");
  expect(lastOptions()).toEqual({ organizationId: ORG });
  await verifyAddress("p1", ORG, "m1");
  expect(lastOptions()).toEqual({ organizationId: ORG });
});
