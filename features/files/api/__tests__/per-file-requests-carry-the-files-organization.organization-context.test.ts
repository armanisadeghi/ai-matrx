/**
 * GATES-TAIL (VERIFIER-21 #2): a request about ONE file carries that file's own organization,
 * read from the file, so `/files/f/<id>` opens in a session with no organization picked.
 * Red on the pre-fix files.ts (every per-file call went out with the caller's bare opts, so no
 * X-Organization-Id reached the files service and it answered 400 "Choose the organization").
 */
import {
  deleteFile,
  downloadFile,
  downloadFileWithProgress,
  getFile,
  getFileMetadata,
  patchFile,
  renameFile,
  restoreFile,
} from "../files";
import {
  __resetFileOrganizationsForTest,
  rememberFileOrganization,
} from "../fileOrganization";

jest.mock("@/lib/python-client", () => ({
  delJson: jest.fn(),
  downloadBlob: jest.fn(async () => ({ blob: new Blob(), filename: null, meta: {} })),
  downloadBlobWithProgress: jest.fn(async () => ({ blob: new Blob(), filename: null, meta: {} })),
  getJson: jest.fn(),
  patchJson: jest.fn(async () => ({ data: {}, meta: {} })),
  postJson: jest.fn(async () => ({ data: {}, meta: {} })),
  uploadWithProgress: jest.fn(),
}));
jest.mock("@/lib/api/typed-client", () => ({
  apiDelete: jest.fn(async () => ({ data: {}, meta: {} })),
  apiGet: jest.fn(async () => ({ data: { id: "f-2", organization_id: "org-of-f2" }, meta: {} })),
  apiMultipart: jest.fn(),
  apiPost: jest.fn(async () => ({ data: {}, meta: {} })),
  buildPath: jest.fn((p: string) => p),
  withQuery: jest.fn((p: string) => p),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({
      // The active selection is EMPTY — the header reads "Choose org".
      appContext: { organization_id: null },
      cloudFiles: { filesById: { "f-slice": { organizationId: "org-from-slice" } } },
    }),
  }),
}));

const pc = jest.requireMock("@/lib/python-client");
const tc = jest.requireMock("@/lib/api/typed-client");
const FILE = "503e2c1f-7b89-5908-891a-18ca0282fc04";
const ORG = "884d1ce8-0000-4000-8000-000000000001";
const lastOpts = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1]?.at(-1);

beforeEach(() => {
  jest.clearAllMocks();
  __resetFileOrganizationsForTest();
  rememberFileOrganization(FILE, ORG);
});

it("every read and write about one file names the file's organization", async () => {
  await getFileMetadata(FILE);
  expect(lastOpts(tc.apiGet)).toMatchObject({ organizationId: ORG });
  await getFile(FILE);
  expect(lastOpts(tc.apiGet)).toMatchObject({ organizationId: ORG });
  await downloadFile(FILE);
  expect(lastOpts(pc.downloadBlob)).toMatchObject({ organizationId: ORG });
  await downloadFileWithProgress(FILE, jest.fn());
  expect(lastOpts(pc.downloadBlobWithProgress)).toMatchObject({ organizationId: ORG });
  await patchFile(FILE, { visibility: "private" } as never);
  expect(lastOpts(pc.patchJson)).toMatchObject({ organizationId: ORG });
  await deleteFile(FILE);
  expect(lastOpts(tc.apiDelete)).toMatchObject({ organizationId: ORG });
  await restoreFile(FILE);
  expect(lastOpts(pc.postJson)).toMatchObject({ organizationId: ORG });
  await renameFile(FILE, { new_path: "a.txt" } as never);
  expect(lastOpts(tc.apiPost)).toMatchObject({ organizationId: ORG });
});

it("a file already in the files slice is sent in its own organization", async () => {
  await downloadFile("f-slice");
  expect(lastOpts(pc.downloadBlob)).toMatchObject({ organizationId: "org-from-slice" });
});

it("a per-file read that answers remembers the row's organization for the next request", async () => {
  await getFileMetadata("f-2");
  await downloadFile("f-2");
  expect(lastOpts(pc.downloadBlob)).toMatchObject({ organizationId: "org-of-f2" });
});

it("an organization the caller named still wins", async () => {
  await downloadFile(FILE, {}, { organizationId: "caller-org" });
  expect(lastOpts(pc.downloadBlob)).toMatchObject({ organizationId: "caller-org" });
});

it("a file nobody has told us about goes as before — nothing is guessed from the picker", async () => {
  await downloadFile("unknown-file");
  expect(lastOpts(pc.downloadBlob)?.organizationId).toBeUndefined();
});
