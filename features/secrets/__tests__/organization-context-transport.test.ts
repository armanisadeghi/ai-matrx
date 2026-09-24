import { setStoreSingleton } from "@/lib/redux/store-singleton";
import { fetchAuthenticators } from "../authenticator-service";
import {
  checkVaultDestination,
  createVaultItem,
  previewVaultLoginCsv,
  restoreVaultItem,
  revealVaultField,
  VaultRecentAuthRequiredError,
} from "../vault-service";
import { VaultImportTransportError } from "../vault-service";
import { uploadVaultAttachment } from "@/features/files/vault/vaultAttachmentTransport";

const ACCESS_TOKEN = "test-access-token";
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const mockGetSession = jest.fn(async () => ({
  data: { session: { access_token: ACCESS_TOKEN } },
}));
const mockGetClaims = jest.fn<
  Promise<{
    data: {
      claims: {
        sub: string;
        email: string;
        app_metadata: {};
        user_metadata: {};
      };
    };
    error: null;
  }>,
  [string?]
>(async () => ({
  data: {
    claims: {
      sub: "user-1",
      email: "admin@admin.com",
      app_metadata: {},
      user_metadata: {},
    },
  },
  error: null,
}));

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      getClaims: mockGetClaims,
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

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => "",
  } as Response;
}

describe("Vault and Authenticator organization transport", () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    mockGetSession.mockClear();
    mockGetClaims.mockClear();
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

  test("export verifies the exact bearer token it sends", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        profile: "matrx_login_csv_v1",
        revision: "a".repeat(64),
        items: [],
      }),
    );
    await previewVaultLoginCsv(
      { profile: "matrx_login_csv_v1", item_ids: ["item-1"] },
      { userId: "user-1", organizationId: ORGANIZATION_ID },
    );
    expect(mockGetClaims).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(
      mockGetClaims.mock.calls.every((args) => args[0] === ACCESS_TOKEN),
    ).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  test("restore sends the frozen actor and recognizes only the root fresh-auth envelope", async () => {
    fetchMock.mockResolvedValueOnce({
      ...errorResponse(403),
      json: async () => ({ code: "recent_auth_required" }),
    } as Response);
    await expect(
      restoreVaultItem("item-1", "00000000-0000-4000-8000-000000000001", {
        userId: "user-1",
        organizationId: ORGANIZATION_ID,
      }),
    ).rejects.toMatchObject({ code: "recent_auth_required" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        deletion_id: "00000000-0000-4000-8000-000000000001",
      }),
      headers: expect.objectContaining({
        "X-Organization-Id": ORGANIZATION_ID,
      }),
    });
  });

  test("restore refuses a source-route nested error envelope", async () => {
    fetchMock.mockResolvedValueOnce({
      ...errorResponse(403),
      json: async () => ({ detail: { code: "recent_auth_required" } }),
    } as Response);
    await expect(
      restoreVaultItem("item-1", "00000000-0000-4000-8000-000000000001", {
        userId: "user-1",
        organizationId: ORGANIZATION_ID,
      }),
    ).rejects.toMatchObject({ code: "request_rejected" });
  });

  test("restore names a native compatibility 503 instead of a generic retry", async () => {
    fetchMock.mockResolvedValueOnce({
      ...errorResponse(503),
      json: async () => ({ detail: { code: "native_passkeys_unavailable" } }),
    } as Response);
    await expect(
      restoreVaultItem("item-1", "00000000-0000-4000-8000-000000000001", {
        userId: "user-1",
        organizationId: ORGANIZATION_ID,
      }),
    ).rejects.toMatchObject({ code: "native_recovery_unavailable" });
  });

  test("restore accepts the exact native passkey result count", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        restored_fields: 1,
        restored_attachments: 0,
        restored_native_passkeys: 1,
        already_restored: false,
        notice: "sharing_and_automatic_use_off",
      }),
    );
    await expect(
      restoreVaultItem("item-1", "00000000-0000-4000-8000-000000000001", {
        userId: "user-1",
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toMatchObject({ restored_native_passkeys: 1 });
  });

  test("restore rejects a malformed success payload at ingress", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ restored_fields: 1 }));
    await expect(
      restoreVaultItem("item-1", "00000000-0000-4000-8000-000000000001", {
        userId: "user-1",
        organizationId: ORGANIZATION_ID,
      }),
    ).rejects.toMatchObject({ code: "request_rejected" });
  });

  test.each([
    [
      { code: "recent_auth_required", error: "unauthorized" },
      "recent_auth_required",
    ],
    [{ detail: { code: "recent_auth_required" } }, "request_rejected"],
    [{ detail: "recent_auth_required" }, "request_rejected"],
    [{}, "request_rejected"],
  ])(
    "export classifies only the structured recent-auth response: %j",
    async (body, code) => {
      fetchMock.mockResolvedValueOnce({
        ...errorResponse(401),
        json: async () => body,
      } as Response);
      await expect(
        previewVaultLoginCsv(
          { profile: "matrx_login_csv_v1", item_ids: ["item-1"] },
          { userId: "user-1", organizationId: ORGANIZATION_ID },
        ),
      ).rejects.toMatchObject({ code });
    },
  );

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

  test("reveal distinguishes expired recent auth from an unrelated 401", async () => {
    fetchMock.mockResolvedValueOnce({
      ...errorResponse(401),
      json: async () => ({ detail: { code: "recent_auth_required" } }),
    } as Response);
    await expect(
      revealVaultField("item-1", "password"),
    ).rejects.toBeInstanceOf(VaultRecentAuthRequiredError);
    fetchMock.mockResolvedValueOnce({
      ...errorResponse(401),
      json: async () => ({
        detail:
          "authentication within the last 900s is required — re-authenticate and retry",
      }),
    } as Response);
    await expect(revealVaultField("item-1", "password")).rejects.toBeInstanceOf(
      VaultRecentAuthRequiredError,
    );
    fetchMock.mockResolvedValueOnce({
      ...errorResponse(401),
      json: async () => ({ detail: "invalid bearer token" }),
    } as Response);
    await expect(revealVaultField("item-1", "password")).rejects.toThrow(
      "Vault request failed (401)",
    );
  });

  test("import mutation rechecks the frozen actor before sending", async () => {
    mockGetClaims.mockResolvedValueOnce({
      data: {
        claims: {
          sub: "different-user",
          email: "admin@admin.com",
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    });
    await expect(
      createVaultItem(
        { display_name: "Imported", source: "system_import" },
        {
          idempotencyKey: "00000000-0000-4000-8000-000000000001",
          expectedActor: { userId: "user-1", organizationId: ORGANIZATION_ID },
        },
      ),
    ).rejects.toMatchObject({
      code: "context_changed",
      constructor: VaultImportTransportError,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("import retry uses the Vault API Idempotency-Key header", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "item-1", fields: [], attachments: [] }),
    );
    await createVaultItem(
      { display_name: "Imported", source: "system_import" },
      {
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        expectedActor: { userId: "user-1", organizationId: ORGANIZATION_ID },
      },
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "idempotency-key": "00000000-0000-4000-8000-000000000001",
    });
  });

  test.each([408, 429, 500, 502, 503, 504])(
    "ambiguous import response %i keeps the frozen idempotency command retryable",
    async (status) => {
      fetchMock.mockResolvedValueOnce(errorResponse(status));
      await expect(
        createVaultItem(
          { display_name: "Imported", source: "system_import" },
          {
            idempotencyKey: "00000000-0000-4000-8000-000000000001",
            expectedActor: {
              userId: "user-1",
              organizationId: ORGANIZATION_ID,
            },
          },
        ),
      ).rejects.toMatchObject({ code: "retryable" });
    },
  );

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
    await expect(checkVaultDestination("https://example.com")).rejects.toThrow(
      "Select an organization before sending this request.",
    );
    await expect(
      uploadVaultAttachment(
        "item-1",
        new File(["bytes"], "secret.txt", { type: "text/plain" }),
        { label: "Secret", handling: "revealable" },
      ),
    ).rejects.toThrow("Select an organization before sending this request.");

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("malformed organization identity fails before auth or network I/O", async () => {
    installContext("not-an-organization-uuid");

    await expect(fetchAuthenticators()).rejects.toThrow(
      "The selected organization ID is invalid.",
    );
    await expect(checkVaultDestination("https://example.com")).rejects.toThrow(
      "The selected organization ID is invalid.",
    );
    await expect(
      uploadVaultAttachment(
        "item-1",
        new File(["bytes"], "secret.txt", { type: "text/plain" }),
        { label: "Secret", handling: "revealable" },
      ),
    ).rejects.toThrow("The selected organization ID is invalid.");

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
