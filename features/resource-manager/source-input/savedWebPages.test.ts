/**
 * Use existing → Websites reads the person's saved web-page Sources through the Sources lanes.
 *
 * 2026-09-30: the All scope read the "orgs" lane (`created_by <> me`), so a person's own saved web
 * pages never appeared under All — the active organization is never a list filter, and All
 * includes her own items. And a count that hit the statement timeout during the picker's opening
 * burst was dropped to a dash with no second try.
 */

type Call = [string, ...unknown[]];

const calls: Call[] = [];
const replies: { count: number | null; error: { code?: string; message: string } | null; status: number }[] = [];

function chain(): unknown {
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === "then") {
        const reply = replies.shift() ?? { count: 0, error: null, status: 200 };
        return (resolve: (v: unknown) => void) => resolve(reply);
      }
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
        return proxy;
      };
    },
  });
  return proxy;
}

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => chain() } }));

import { countSavedSources, savedSourcesLane } from "./savedWebPages";

beforeEach(() => {
  calls.length = 0;
  replies.length = 0;
});

describe("savedSourcesLane", () => {
  it("All is the all lane — the person's own Sources included", () => {
    expect(savedSourcesLane({ kind: "all" })).toEqual({ kind: "all", organizationId: null });
  });
  it("an organization filters the all lane, never other people's only", () => {
    expect(savedSourcesLane({ kind: "organization", organizationId: "org-1" })).toEqual({
      kind: "all",
      organizationId: "org-1",
    });
  });
  it("Mine stays mine, with its organization filter", () => {
    expect(savedSourcesLane({ kind: "mine", organizationId: "org-1" })).toEqual({
      kind: "mine",
      organizationId: "org-1",
    });
  });
});

describe("countSavedSources", () => {
  it("All never excludes the person's own rows", async () => {
    replies.push({ count: 369, error: null, status: 200 });
    await expect(countSavedSources("web_page", { kind: "all" }, "user-1", 0)).resolves.toBe(369);
    expect(calls.some(([m, col]) => m === "neq" && col === "created_by")).toBe(false);
    expect(calls.some(([m, col]) => m === "eq" && col === "created_by")).toBe(false);
  });

  it("a statement timeout is tried again, and the count arrives", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    replies.push({ count: null, error: { code: "57014", message: "" }, status: 500 });
    replies.push({ count: 12, error: null, status: 200 });
    await expect(countSavedSources("web_page", { kind: "all" }, "user-1", 0)).resolves.toBe(12);
  });

  it("a refusal is not retried: a dash, said in the console with its status", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    replies.push({ count: null, error: { code: "42501", message: "" }, status: 401 });
    replies.push({ count: 12, error: null, status: 200 });
    await expect(countSavedSources("web_page", { kind: "all" }, "user-1", 0)).resolves.toBeNull();
    expect(String(log.mock.calls[0]?.[0])).toContain("HTTP 401");
  });
});
