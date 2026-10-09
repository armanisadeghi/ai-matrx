const eqCalls: Array<[string, unknown]> = [];

function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const method of ["select", "is", "or", "contains", "order", "limit", "range"]) {
    b[method] = () => b;
  }
  b.eq = (column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return b;
  };
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ from: () => builder() }) }),
}));
jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "me-1",
  getUserId: () => "me-1",
}));

import { fetchMessageTemplates } from "../services/message-templates-service";

beforeEach(() => {
  eqCalls.length = 0;
  window.history.pushState({}, "", "/");
});

describe("the message template list", () => {
  it("is the caller's own on a user page", async () => {
    await fetchMessageTemplates();
    expect(eqCalls).toContainEqual(["created_by", "me-1"]);
  });
  it("is EVERY template on the admin seat (no created_by filter)", async () => {
    window.history.pushState({}, "", "/administration/utilities/message-templates");
    await fetchMessageTemplates();
    expect(eqCalls.some(([column]) => column === "created_by")).toBe(false);
  });
});
