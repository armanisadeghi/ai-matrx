/**
 * ONE EXPLICIT ORGANIZATION PER IMPORT CALL (Bugbot finding 1 on e718a50c).
 *
 * Every `/google-import/*` call carries the organization it writes into in its
 * BODY. The transport, separately, stamps `X-Organization-Id` — and unless the
 * caller passes `organizationId` in the request options it takes that header
 * from the Redux selection. Those are not the same org: the People list can be
 * scoped to another organization, and a personal account falls back to its own.
 * The mismatch is either a throw before the request or a header/body
 * disagreement the server refuses.
 *
 * So every call in `service.ts` must pass the panel's organization through the
 * options too. Removing `organizationId: args.organizationId` from any of the
 * five calls turns the matching case below red.
 */



const getJson = jest.fn();
const postJson = jest.fn();

jest.mock("@/lib/python-client", () => ({
  getJson: (...args: unknown[]) => getJson(...args),
  postJson: (...args: unknown[]) => postJson(...args),
}));

const ORG = "3f8b1c02-1111-4d7e-9a6b-000000000001";

describe("the Google import client names its organization on every call", () => {
  beforeEach(() => {
    getJson.mockReset().mockResolvedValue({ data: [] });
    postJson.mockReset().mockResolvedValue({ data: {} });
  });

  it("sends the field map request with the panel's organization", async () => {
    const { fetchContactFieldSpecs } = await import("../import/service");
    await fetchContactFieldSpecs(ORG);

    const [, options] = getJson.mock.calls[0] as [string, { organizationId?: string }];
    expect(options.organizationId).toBe(ORG);
  });

  it.each([
    [
      "contacts/search",
      async () => {
        const { searchGoogleContacts } = await import("../import/service");
        await searchGoogleContacts({ organizationId: ORG });
      },
    ],
    [
      "contacts/import",
      async () => {
        const { importGoogleContacts } = await import("../import/service");
        await importGoogleContacts({
          organizationId: ORG,
          contacts: [{ externalId: "people/c1" }],
          dryRun: true,
        });
      },
    ],
    [
      "tasks/list",
      async () => {
        const { listGoogleTasks } = await import("../import/service");
        await listGoogleTasks({ organizationId: ORG });
      },
    ],
    [
      "tasks/import",
      async () => {
        const { importGoogleTasks } = await import("../import/service");
        await importGoogleTasks({
          organizationId: ORG,
          taskListId: "list-1",
          taskIds: ["t1"],
          dryRun: false,
        });
      },
    ],
  ])("agrees with its own body on %s", async (_name, call) => {
    await call();

    const [, body, options] = postJson.mock.calls[0] as [
      string,
      { organization_id: string },
      { organizationId?: string },
    ];
    expect(body.organization_id).toBe(ORG);
    // The header the transport will stamp, and the body, are ONE org.
    expect(options.organizationId).toBe(body.organization_id);
  });
});
