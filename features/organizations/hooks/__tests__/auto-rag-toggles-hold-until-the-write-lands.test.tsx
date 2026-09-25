/**
 * @jest-environment jsdom
 *
 * GATES-TAIL-2. The organization's (and the person's) auto knowledge-graph switches flipped
 * BEFORE the write answered and, on a refusal, snapped back beside the database's own line
 * ("permission denied for table organization_preferences"). Rule: pending, never optimistic —
 * the value does not change until the write lands, and a refusal is said in words.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const rpc = jest.fn();
const fromChain = {
  select: jest.fn(),
  eq: jest.fn(),
  maybeSingle: jest.fn(),
  update: jest.fn(),
  insert: jest.fn(),
};
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    schema: () => ({ from: () => fromChain }),
  },
}));
jest.mock("@/lib/organizations/personalOrg", () => ({ ensureOrgId: async () => "org-1" }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));

import { useOrgAutoRagPreference } from "../useOrgAutoRagPreference";
import { useAutoRagPreference } from "@/features/kg-suggestions/hooks/useAutoRagPreference";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount<T>(useHook: () => T): { current: () => T; unmount: () => void } {
  let latest!: T;
  function Probe() {
    latest = useHook();
    return null;
  }
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<Probe />));
  return { current: () => latest, unmount: () => act(() => root.unmount()) };
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const RAW = /permission denied for|organization_preferences|user_preferences|42501/;

beforeEach(() => {
  jest.resetAllMocks();
  fromChain.select.mockReturnValue(fromChain);
  fromChain.eq.mockReturnValue(fromChain);
  fromChain.update.mockReturnValue(fromChain);
  fromChain.maybeSingle.mockResolvedValue({ data: { auto_rag_enabled: true }, error: null });
});

describe("the organization's auto knowledge-graph switch", () => {
  it("keeps its value while the write is in flight, and shows it pending", async () => {
    let answer!: (v: unknown) => void;
    rpc.mockImplementation(() => new Promise((r) => { answer = r; }));
    const h = mount(() => useOrgAutoRagPreference("org-1"));
    await flush();
    expect(h.current().enabled).toBe(true);

    let done!: Promise<void>;
    act(() => { done = h.current().setEnabled(false); });
    await flush();
    expect(h.current().enabled).toBe(true); // not flipped yet
    expect(h.current().saving).toBe(true);
    expect(h.current().pendingField).toBe("enabled");

    await act(async () => { answer({ error: null }); await done; });
    expect(h.current().enabled).toBe(false);
    expect(h.current().pendingField).toBeNull();
    h.unmount();
  });

  it("a refusal leaves it as it was and says so in words, never the database's line", async () => {
    rpc.mockResolvedValue({
      error: { code: "42501", message: "permission denied for table organization_preferences" },
    });
    const h = mount(() => useOrgAutoRagPreference("org-1"));
    await flush();
    await act(async () => { await h.current().setEnabled(false).catch(() => undefined); });
    expect(h.current().enabled).toBe(true);
    expect(h.current().error).toBeTruthy();
    expect(h.current().error).not.toMatch(RAW);
    expect(h.current().error).toMatch(/permission/i);
    h.unmount();
  });
});

describe("the person's auto knowledge-graph switch", () => {
  it("keeps its value while the write is in flight", async () => {
    let answer!: (v: unknown) => void;
    fromChain.select.mockImplementation((cols: string) =>
      cols === "user_id" ? new Promise((r) => { answer = r; }) : fromChain,
    );
    const h = mount(() => useAutoRagPreference());
    await flush();
    expect(h.current().enabled).toBe(true);

    let done!: Promise<void>;
    act(() => { done = h.current().setEnabled(false); });
    await flush();
    expect(h.current().enabled).toBe(true);
    expect(h.current().saving).toBe(true);

    await act(async () => { answer({ data: [{ user_id: "user-1" }], error: null }); await done; });
    expect(h.current().enabled).toBe(false);
    h.unmount();
  });

  it("a refusal is said in words", async () => {
    fromChain.select.mockImplementation((cols: string) =>
      cols === "user_id"
        ? Promise.resolve({ data: null, error: { code: "42501", message: "permission denied for table user_preferences" } })
        : fromChain,
    );
    const h = mount(() => useAutoRagPreference());
    await flush();
    await act(async () => { await h.current().setEnabled(false).catch(() => undefined); });
    expect(h.current().enabled).toBe(true);
    expect(h.current().error).not.toMatch(RAW);
    h.unmount();
  });
});
