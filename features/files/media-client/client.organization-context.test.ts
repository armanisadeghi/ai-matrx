/**
 * The file-session mint is organization-admitted: an authenticated mint sent
 * before the app-context organization hydrates is refused at the server gate,
 * and the boot mint + every private-media retry fire exactly there (~511
 * `[AUTH][REJECT] POST /files/session` in ~35 minutes for one user on
 * 2026-08-31). The mint must therefore WAIT for hydration — never guess an
 * organization, never burn a refused request.
 */

let organizationId: string | null = null;
let orgBootstrapResolved = false;
let accessToken: string | null = "jwt-token";
let fingerprintId: string | null = null;

const subscribers = new Set<() => void>();

/** Move the app-context bootstrap forward and notify Redux subscribers. */
function hydrateOrganization(next: {
  organizationId?: string | null;
  orgBootstrapResolved?: boolean;
}) {
  if (next.organizationId !== undefined) organizationId = next.organizationId;
  if (next.orgBootstrapResolved !== undefined) {
    orgBootstrapResolved = next.orgBootstrapResolved;
  }
  for (const listener of [...subscribers]) listener();
}

jest.mock("@/lib/python-client", () => ({
  resolveBaseUrl: () => "https://server.app.matrxserver.com",
  resolveFilesBaseUrl: () => "https://files.matrxserver.com",
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({}),
    dispatch: jest.fn(),
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  }),
}));
jest.mock("@/lib/redux/slices/userSlice", () => ({
  selectAccessToken: () => accessToken,
  selectFingerprintId: () => fingerprintId,
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => organizationId,
  selectOrgBootstrapResolved: () => orgBootstrapResolved,
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));
jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { upload: jest.fn() },
}));
jest.mock("@/features/files/redux/selectors", () => ({
  selectFileById: () => undefined,
}));
jest.mock("@/features/files/redux/thunks", () => ({
  ensureCloudFileFields: jest.fn(() => async () => undefined),
}));
jest.mock("@/features/files/redux/file-hydration", () => ({
  areCloudFileFieldsLoaded: () => false,
  FILE_RENDER_FIELDS: ["fileName", "mimeType", "fileSize", "visibility"],
}));
jest.mock("@/features/files/hooks/blob-cache", () => ({
  getCached: jest.fn(() => null),
  hydrateFromIdb: jest.fn(async () => null),
  setCached: jest.fn(),
}));
jest.mock("@/features/files/upload/UploadGuardHost", () => ({
  requestUpload: jest.fn(),
}));

import { mediaFilesClient } from "./client";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

function mintOk() {
  return jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, expires_in: 7_200 }),
  }));
}

/** Let the pending mint promise chain (credentials + admission) run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("file-session mint — organization admission", () => {
  beforeEach(() => {
    organizationId = null;
    orgBootstrapResolved = false;
    accessToken = "jwt-token";
    fingerprintId = null;
    subscribers.clear();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("waits for organization hydration instead of burning a refused mint", async () => {
    const fetchMock = mintOk();
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = mediaFilesClient.ensureSession({ force: true });
    await flush();
    // Pre-hydration: nothing has been sent to the gate.
    expect(fetchMock).not.toHaveBeenCalled();

    hydrateOrganization({
      organizationId: ORGANIZATION_ID,
      orgBootstrapResolved: true,
    });
    await pending;

    // Both session bases minted, each stamped with the hydrated organization.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls as unknown as [
      string,
      RequestInit,
    ][]) {
      expect(url).toMatch(/\/files\/session$/);
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer jwt-token");
      expect(headers.get("X-Organization-Id")).toBe(ORGANIZATION_ID);
    }
  });

  it("mints immediately when the organization is already hydrated", async () => {
    organizationId = ORGANIZATION_ID;
    orgBootstrapResolved = true;
    const fetchMock = mintOk();
    global.fetch = fetchMock as unknown as typeof fetch;

    await mediaFilesClient.ensureSession({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips the mint loudly when the bootstrap resolves with no organization", async () => {
    const fetchMock = mintOk();
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = mediaFilesClient.ensureSession({ force: true });
    await flush();
    hydrateOrganization({ organizationId: null, orgBootstrapResolved: true });
    await pending;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("[files-session]"),
      expect.stringContaining("Private media stays unavailable"),
    );
  });

  it("mints for a guest immediately — the fingerprint lane carries no organization", async () => {
    accessToken = null;
    fingerprintId = "fingerprint-1";
    const fetchMock = mintOk();
    global.fetch = fetchMock as unknown as typeof fetch;

    await mediaFilesClient.ensureSession({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Organization-Id")).toBeNull();
  });
});
