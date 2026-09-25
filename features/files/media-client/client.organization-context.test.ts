/**
 * The file-session mint is organization-admitted: an authenticated mint sent
 * before the app-context organization hydrates is refused at the server gate,
 * and the boot mint + every private-media retry fire exactly there (~511
 * `[AUTH][REJECT] POST /files/session` in ~35 minutes for one user on
 * 2026-08-31). The mint must therefore WAIT for hydration — never guess an
 * organization, never burn a refused request.
 *
 * The first repair wrapped the client's public `ensureSession` with that wait.
 * It guarded ONE door: the package also mints internally, from
 * `recoverLoadError` -> `session.ensure({ force: true })` on every private-
 * media retry, which never reaches a host wrapper. Production kept refusing
 * 124 mints in 15 minutes, 23 minutes after that wrapper shipped. The gate now
 * lives at the injected transport (`filesFetch`), which every package door
 * passes through — so the last block below tests the INTERNAL door, and it is
 * the one that actually regressed.
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
const fakeStore = () => ({
  getState: () => ({}),
  dispatch: jest.fn(),
  subscribe: (listener: () => void) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  },
});
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => fakeStore(),
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
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239): spread
  // the real store so a new export can never take this suite down at import.
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
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

import { mediaFilesClient, __filesFetchForTest } from "./client";
import {
  __resetFileOrganizationsForTest,
  rememberFileOrganization,
} from "@/features/files/api/fileOrganization";

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

  // ── the door the ensureSession wrapper never covered ─────────────────────

  it("binds the organization on the package's INTERNAL mint (recoverLoadError)", async () => {
    organizationId = ORGANIZATION_ID;
    orgBootstrapResolved = true;
    const fetchMock = mintOk();
    global.fetch = fetchMock as unknown as typeof fetch;

    await mediaFilesClient.recoverLoadError(
      "https://server.app.matrxserver.com/files/f1/download" as never,
      1,
    );

    const minted = (
      fetchMock.mock.calls as unknown as [string, RequestInit][]
    ).filter(([url]) => /\/files\/session$/.test(url));
    expect(minted.length).toBeGreaterThan(0);
    for (const [, init] of minted) {
      expect(new Headers(init.headers).get("X-Organization-Id")).toBe(
        ORGANIZATION_ID,
      );
    }
  });

  it("refuses the INTERNAL mint rather than burn it, when no organization resolves", async () => {
    orgBootstrapResolved = true;
    organizationId = null;
    const fetchMock = mintOk();
    global.fetch = fetchMock as unknown as typeof fetch;

    await mediaFilesClient.recoverLoadError(
      "https://server.app.matrxserver.com/files/f1/download" as never,
      1,
    );

    const minted = (
      fetchMock.mock.calls as unknown as [string, RequestInit][]
    ).filter(([url]) => /\/files\/session$/.test(url));
    expect(minted).toHaveLength(0);
  });
});

// ── GATES-TAIL (VERIFIER-21 #2): a request about ONE file goes in the FILE'S organization ──

describe("per-file requests — the file's own organization, not the picker's", () => {
  const FILE = "503e2c1f-7b89-5908-891a-18ca0282fc04";
  const FILE_ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

  beforeEach(() => {
    organizationId = null; // the header reads "Choose org"
    orgBootstrapResolved = true;
    accessToken = "jwt-token";
    fingerprintId = null;
    __resetFileOrganizationsForTest();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("sends a known file's bytes request with the file's organization, never a synthesized 400", async () => {
    rememberFileOrganization(FILE, FILE_ORG);
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await __filesFetchForTest(`https://files.matrxserver.com/files/${FILE}/download?inline=true`, {
      headers: { Authorization: "Bearer jwt-token" },
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("X-Organization-Id")).toBe(FILE_ORG);
  });

  it("the file's organization wins over a different picked one", async () => {
    organizationId = "22222222-2222-4222-8222-222222222222";
    rememberFileOrganization(FILE, FILE_ORG);
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await __filesFetchForTest(`https://files.matrxserver.com/files/${FILE}?include_urls=false`, {
      headers: { Authorization: "Bearer jwt-token" },
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("X-Organization-Id")).toBe(FILE_ORG);
  });

  it("a file nobody has told us about keeps the old refusal — nothing guessed", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    // jsdom has no Response; the transport builds one for its refusal.
    (globalThis as { Response?: unknown }).Response ??= class {
      status: number;
      constructor(_body: unknown, init: { status: number }) {
        this.status = init.status;
      }
    };
    const res = await __filesFetchForTest(`https://files.matrxserver.com/files/${FILE}/download`, {
      headers: { Authorization: "Bearer jwt-token" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });
});
