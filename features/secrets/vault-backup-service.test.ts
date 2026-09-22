import { withClaims } from "@/test-utils/supabase-auth";
import {
  MAX_BACKUP_UPLOAD_BYTES,
  previewVaultBackup,
  readBackupFile,
  restoreRunForPreview,
  startNewRestoreRun,
  VaultBackupTransportError,
  type VaultBackupRestorePreview,
} from "./vault-backup-service";

const ACCESS_TOKEN = "test-access-token";
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
let selectedOrganization = ORGANIZATION_ID;
const getSession = jest.fn(async () => ({
  data: { session: { access_token: ACCESS_TOKEN } },
}));
const getUser = jest.fn(async () => ({
  data: { user: { id: ACTOR_ID } },
  error: null,
}));

jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: () => "http://selected-localhost:8000",
}));
jest.mock("@/lib/organizations/activeOrg", () => ({
  requireSelectedOrgId: () => selectedOrganization,
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: withClaims({ getSession, getUser }) }),
}));

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const actor = { userId: ACTOR_ID, organizationId: ORGANIZATION_ID };
const restorePreview: VaultBackupRestorePreview = {
  envelope_digest: "a".repeat(64),
  actor_id: ACTOR_ID,
  organization_id: ORGANIZATION_ID,
  quarantined: true,
  records: [],
  omissions: [],
  record_count: 0,
  field_count: 0,
  attachment_count: 0,
  attachment_bytes: 0,
};

describe("vault backup transport", () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    selectedOrganization = ORGANIZATION_ID;
    sessionStorage.clear();
    fetchMock.mockReset();
    getSession.mockClear();
    getUser.mockClear();
    global.fetch = fetchMock as typeof fetch;
  });

  test("uses the selected backend and freezes actor and organization around the request", async () => {
    fetchMock.mockResolvedValue(
      response({
        revision: "b".repeat(64),
        records: [],
        omissions: [],
        record_count: 0,
        field_count: 0,
        attachment_count: 0,
        attachment_bytes: 0,
      }),
    );
    await previewVaultBackup(["item-1"], actor);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://selected-localhost:8000/api/vault/backups/preview",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ item_ids: ["item-1"] }),
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "X-Organization-Id": ORGANIZATION_ID,
        }),
      }),
    );
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  test("maps fresh-auth refusal without reading server prose", async () => {
    fetchMock.mockResolvedValue(
      response({ detail: { code: "recent_auth_required" } }, 401),
    );
    await expect(previewVaultBackup(["item-1"], actor)).rejects.toMatchObject({
      code: "recent_auth_required",
    });
  });

  test("refuses an actor-context change before transport", async () => {
    selectedOrganization = "33333333-3333-4333-8333-333333333333";
    await expect(previewVaultBackup(["item-1"], actor)).rejects.toBeInstanceOf(
      VaultBackupTransportError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects an oversized upload before constructing a FileReader", () => {
    const original = global.FileReader;
    const reader = jest.fn();
    Object.defineProperty(global, "FileReader", {
      configurable: true,
      value: reader,
    });
    expect(() =>
      readBackupFile({ size: MAX_BACKUP_UPLOAD_BYTES + 1 } as File),
    ).toThrow(VaultBackupTransportError);
    expect(reader).not.toHaveBeenCalled();
    Object.defineProperty(global, "FileReader", {
      configurable: true,
      value: original,
    });
  });

  test("persists only the restore binding and reuses it until a confirmed new run", () => {
    const first = "44444444-4444-4444-8444-444444444444";
    const second = "55555555-5555-4555-8555-555555555555";
    const random = jest
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    expect(restoreRunForPreview(restorePreview)).toBe(first);
    expect(restoreRunForPreview(restorePreview)).toBe(first);
    expect(startNewRestoreRun(restorePreview)).toBe(second);
    const stored = JSON.parse(
      sessionStorage.getItem("matrx:vault-backup-restore:v1") ?? "{}",
    );
    expect(Object.keys(stored).sort()).toEqual([
      "actorId",
      "digest",
      "organizationId",
      "runId",
    ]);
    expect(JSON.stringify(stored)).not.toContain("passphrase");
    random.mockRestore();
  });
});
