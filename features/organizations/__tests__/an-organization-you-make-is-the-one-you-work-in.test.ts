// features/organizations/__tests__/an-organization-you-make-is-the-one-you-work-in.test.ts
//
// G5 (a) — AN ORGANIZATION YOU MAKE IS THE ONE YOU WORK IN (lane MAKE-HOME, found in lane 5's dry
// run, 2026-10-02). A person made "Cedar Ridge Physical Therapy" and landed back on the data home
// with no active organization, so "New table" was gone and nothing said why. Making an
// organization is the person's own explicit choice (Notion, Slack and Linear all put you in the
// workspace you just made), so the one act that creates it also makes it active — never a
// default picked for her, which is the only thing the no-preselected-organization law forbids.
//
// TWO HALVES, both red before the fix:
//   1. every client call of the creating door (`custom` RPC `org_create`) sits in a file that also
//      calls `makeCreatedOrganizationActive` — a NEW creating path cannot forget it;
//   2. the service's own create, answered by the door, dispatches the new organization as active.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "../../..");

const dispatched: unknown[] = [];
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ dispatch: (action: unknown) => dispatched.push(action), getState: () => ({}) }),
}));
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string) =>
      fn === "check_org_slug_available"
        ? { data: true, error: null }
        : fn === "org_create"
          ? {
              data: { id: "0a54df90-eab8-4d07-ab29-81a45fb41e04", name: "Cedar Ridge Physical Therapy", slug: "cedar-ridge-pt" },
              error: null,
            }
          : { data: null, error: { message: `untaught ${fn}` } },
  },
}));

it("every file that calls the creating door also makes the new organization active", () => {
  const hits = execFileSync("git", ["grep", "-l", '"org_create"', "--", "*.ts", "*.tsx"], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    // The generated types name the door; a script probing access as a test seat makes no one's org.
    .filter((f) => !f.startsWith("types/") && !f.startsWith("scripts/") && !f.includes("__tests__"));
  expect(hits.length).toBeGreaterThan(0);
  const forgetful = hits.filter((f) => !readFileSync(path.join(REPO, f), "utf8").includes("makeCreatedOrganizationActive("));
  expect(forgetful).toEqual([]);
});

it("making an organization makes it the active one", async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
  const { createOrganization } = require("../service") as typeof import("../service");
  const made = await createOrganization({
    name: "Cedar Ridge Physical Therapy",
    abbreviation: "CRP",
    slug: "cedar-ridge-pt",
  } as Parameters<typeof createOrganization>[0]);
  expect(made.error ?? null).toBeNull();
  expect(made.success).toBe(true);
  expect(JSON.stringify(dispatched)).toContain("0a54df90-eab8-4d07-ab29-81a45fb41e04");
  expect(JSON.stringify(dispatched)).toContain("setOrganization");
});
