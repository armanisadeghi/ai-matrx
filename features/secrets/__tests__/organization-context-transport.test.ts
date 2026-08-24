import { setStoreSingleton } from "@/lib/redux/store-singleton";
import { fetchAuthenticators } from "../authenticator-service";
import { checkVaultDestination } from "../vault-service";
import { uploadVaultAttachment } from "@/features/files/vault/vaultAttachmentTransport";

const ACCESS_TOKEN = "test-access-token";
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: ACCESS_TOKEN } },
      }),
    },
  }),
}));

function installContext(
  organizationId: string | null,
  personalOrganizationId: string | null = null,
): void {
  setStoreSingleton({
    getState: () => ({
      appContext: {
        organization_id: organizationId,
        personal_organization_id: personalOrganizationId,
      },
    }),
  } as never);
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe("Vault and Authenticator organization transport", () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
    installContext(ORGANIZATION_ID);
  });

  test("Authenticator sends the selected organization", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ entries: [] }));

    await fetchAuthenticators();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  test("Vault JSON operations send the selected organization", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reachable: true }));

    await checkVaultDestination("https://example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  test("Vault attachment bytes send the selected organization", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "attachment-1" }));

    await uploadVaultAttachment(
      "item-1",
      new File(["bytes"], "secret.txt", { type: "text/plain" }),
      { label: "Secret", handling: "revealable" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  test("personal organization identity never substitutes for request context", async () => {
    installContext(null, ORGANIZATION_ID);

    await expect(fetchAuthenticators()).rejects.toThrow(
      "Select an organization before sending this request.",
    );
    await expect(
      checkVaultDestination("https://example.com"),
    ).rejects.toThrow("Select an organization before sending this request.");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
