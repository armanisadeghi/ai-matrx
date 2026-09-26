/**
 * THE ONE ROSTER READ (RC-B6 round 2: the task page fired ~60 identical
 * `get_organization_members_with_users` requests in 7 s). Many readers of the
 * same organization at once make one request; a failure is never cached; a
 * roster change forgets the answer.
 */
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));
jest.mock("@ai-matrx/data", () => ({ pgErrorToError: (e: { message: string }) => new Error(e.message) }));

import {
  MEMBER_ROWS_TTL_MS,
  forgetOrganizationMemberRows,
  readOrganizationMemberRows,
} from "../orgMemberRows";

const ROW = { user_id: "u1", user_email: "dana@example.com" };

beforeEach(() => {
  rpc.mockReset();
  forgetOrganizationMemberRows();
});

it("sixty readers of one roster make one request", async () => {
  rpc.mockResolvedValue({ data: [ROW], error: null });
  const reads = Array.from({ length: 60 }, () => readOrganizationMemberRows("org-a"));
  await Promise.all(reads);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it("a fresh answer is reused, a stale one refetched", async () => {
  rpc.mockResolvedValue({ data: [ROW], error: null });
  await readOrganizationMemberRows("org-a", { now: 1_000 });
  await readOrganizationMemberRows("org-a", { now: 1_000 + MEMBER_ROWS_TTL_MS - 1 });
  expect(rpc).toHaveBeenCalledTimes(1);
  await readOrganizationMemberRows("org-a", { now: 1_000 + MEMBER_ROWS_TTL_MS + 1 });
  expect(rpc).toHaveBeenCalledTimes(2);
});

it("a failure is never cached", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
  await expect(readOrganizationMemberRows("org-b")).rejects.toThrow("boom");
  rpc.mockResolvedValueOnce({ data: [ROW], error: null });
  await expect(readOrganizationMemberRows("org-b")).resolves.toEqual([ROW]);
  expect(rpc).toHaveBeenCalledTimes(2);
});

it("an explicit refresh re-reads a settled roster", async () => {
  rpc.mockResolvedValue({ data: [ROW], error: null });
  await readOrganizationMemberRows("org-d");
  await readOrganizationMemberRows("org-d", { fresh: true });
  expect(rpc).toHaveBeenCalledTimes(2);
});

it("a roster change forgets the answer", async () => {
  rpc.mockResolvedValue({ data: [ROW], error: null });
  await readOrganizationMemberRows("org-c");
  forgetOrganizationMemberRows("org-c");
  await readOrganizationMemberRows("org-c");
  expect(rpc).toHaveBeenCalledTimes(2);
});

it("no caller reads the roster around the one read", () => {
  const { execSync } = jest.requireActual<typeof import("child_process")>("child_process");
  const out = execSync(
    'git grep -n "\"get_organization_members_with_users\"" -- "*.ts" "*.tsx" ":!work" ":!types" || true',
    { cwd: `${__dirname}/../../../..`, encoding: "utf8" },
  );
  const offenders = out
    .split("\n")
    .filter(Boolean)
    .filter((line) => !line.startsWith("features/organizations/service/orgMemberRows.ts:"))
    .filter((line) => !line.includes("__tests__/"))
    // Type positions and prose name the function; only a CALL is an offender.
    .filter((line) => !/DbRpcRow<|Functions\[|:\s*\/\/|:\s*\*/.test(line));
  expect(offenders).toEqual([]);
});
