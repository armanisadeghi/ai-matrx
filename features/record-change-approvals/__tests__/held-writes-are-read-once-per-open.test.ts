/**
 * T5.3 — THE HELD-WRITES QUEUE IS READ ONCE PER TABLE OPEN. The table page draws its header twice
 * while it opens (the fallback, then its own) and each header asked `custom.work_inbox`. THE BREAK:
 * two mounts asking at once make two reads. Use case: Cedar Ridge Physical Therapy's front desk
 * opens "Front desk callback log" while nothing waits on it.
 */
const rpc = jest.fn(async () => ({ data: [], error: null }));
jest.mock("@ai-matrx/records-ui", () => ({ recordsDataSource: () => ({ rpc }) }));
jest.mock("@/utils/supabase/client", () => {
  const client = { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn() } };
  return { createClient: () => client, supabase: client };
});

import { forgetHeldWritesOnTable, heldWritesOnTable } from "../HeldWritesOnTable";

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const TABLE = "0f1a0f28-bc54-4e39-ad14-699072ed08f8";

// PAGE-BUNDLE-2: the second header mounts a moment AFTER the first read lands, so the answer is
// shared for a few seconds after it lands too; a decision, or time, makes the next ask read again.
it("two headers share one queue read, at once or a moment apart; a decision or time reads again", async () => {
  const [a, b] = await Promise.all([heldWritesOnTable(ORG, TABLE), heldWritesOnTable(ORG, TABLE)]);
  expect(a).toEqual({ state: "none" });
  expect(b).toEqual({ state: "none" });
  expect(rpc).toHaveBeenCalledTimes(1);
  await heldWritesOnTable(ORG, TABLE);
  expect(rpc).toHaveBeenCalledTimes(1);
  forgetHeldWritesOnTable();
  await heldWritesOnTable(ORG, TABLE);
  expect(rpc).toHaveBeenCalledTimes(2);
  const realNow = Date.now;
  const later = realNow() + 6_000;
  Date.now = () => later;
  try {
    await heldWritesOnTable(ORG, TABLE);
    expect(rpc).toHaveBeenCalledTimes(3);
  } finally {
    Date.now = realNow;
  }
});
