/** @jest-environment node */

/**
 * The CMS 0041 archive gate: correct before AND after the column exists.
 * Route-level delete behaviour is in `app/api/cms/cmsDeletesArchive.test.ts`.
 */

import {
  __resetArchiveProbeForTests,
  archiveLive,
  archiveNotLiveResponse,
  isLive,
  onlyLive,
} from "./cmsArchive";

type ProbeResult = { error: { code?: string; message: string } | null };

function probeDb(result: () => ProbeResult) {
  const probes: string[] = [];
  const db = {
    from: (table: string) => ({
      select: (column: string) => ({
        limit: async () => {
          probes.push(`${table}.${column}`);
          return result();
        },
      }),
    }),
  };
  return { db: db as never, probes };
}

beforeEach(() => __resetArchiveProbeForTests());

it("reports the column absent before 0041 and caches the answer", async () => {
  const { db, probes } = probeDb(() => ({
    error: { code: "42703", message: "column client_pages.deleted_at does not exist" },
  }));
  expect(await archiveLive(db, "client_pages")).toBe(false);
  expect(await archiveLive(db, "client_pages")).toBe(false);
  expect(probes).toEqual(["client_pages.deleted_at"]);
});

it("reports the column present after 0041 and never probes again", async () => {
  const { db, probes } = probeDb(() => ({ error: null }));
  expect(await archiveLive(db, "client_sites")).toBe(true);
  expect(await archiveLive(db, "client_sites")).toBe(true);
  expect(probes).toEqual(["client_sites.deleted_at"]);
});

it("throws on any other probe error instead of guessing", async () => {
  const { db } = probeDb(() => ({ error: { code: "57014", message: "statement timeout" } }));
  await expect(archiveLive(db, "html_pages")).rejects.toThrow("statement timeout");
});

it("onlyLive adds deleted_at IS NULL only when the column exists", () => {
  const calls: Array<[string, null]> = [];
  const query = { is: (column: string, value: null) => (calls.push([column, value]), query) };
  onlyLive(query, false);
  expect(calls).toEqual([]);
  onlyLive(query, true);
  expect(calls).toEqual([["deleted_at", null]]);
});

it("treats a pre-0041 row (no key) as live and a stamped row as archived", () => {
  expect(isLive({ id: "a" })).toBe(true);
  expect(isLive({ id: "a", deleted_at: null })).toBe(true);
  expect(isLive({ id: "a", deleted_at: "2026-09-27T10:00:00Z" })).toBe(false);
  expect(isLive(null)).toBe(false);
});

it("refuses loudly, retryable, saying nothing was deleted", async () => {
  const response = archiveNotLiveResponse("a page");
  const body = (await response.json()) as { code: string; error: string; retryable: boolean };
  expect(response.status).toBe(503);
  expect(body.code).toBe("cms_archive_not_live");
  expect(body.retryable).toBe(true);
  expect(body.error).toContain("Nothing was deleted");
});
