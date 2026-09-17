/**
 * orgBootstrapTotality.test.ts — BOOT ANSWERS THE ORGANIZATION QUESTION, ALWAYS.
 *
 * THE DEFECTS THIS PINS (both found 2026-09-17, both silent):
 *
 *  1. `DeferredShellData` awaited `getSSRShellData(...)` BEFORE dispatching
 *     `bootstrapActiveOrganization()`. One failed shell fetch — a network
 *     blip, one bad preference row — skipped the dispatch entirely. Its catch
 *     set `shellDataLoaded`, so the chrome unblocked, while
 *     `orgBootstrapResolved` stayed FALSE forever. ~20 surfaces render their
 *     "choose an organization" state only on `bootstrapResolved &&
 *     !organizationId`, so every one of them sat on a permanent skeleton with
 *     no error and no picker.
 *
 *  2. `appContextPolicy.remote.fetch` returned `null` — which dispatches
 *     NOTHING — on three of its four exits: a guest identity, an aborted
 *     `whenPageIdle`, and a null `resolveActiveOrgContext`. Same outcome.
 *
 * "Nobody has looked yet" and "nobody has an organization" are different
 * facts. A screen that waits forever states NEITHER, which is what law 4
 * forbids. So every exit of the boot path answers.
 *
 * SUT: the real `bootstrapActiveOrganization` thunk, the real
 * `appContextPolicy.remote.fetch`, the real `appContextSlice` reducer and the
 * real `orgBootstrapGate`. The doubles are the network resolver
 * (`resolveActiveOrgContext`), the idle scheduler, and the auth identity —
 * external engines, never the thing being proved.
 */

import { jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

const resolveActiveOrgContext = jest.fn<
  (userId: string) => Promise<Record<string, unknown> | null>
>();
jest.mock("@/lib/organizations/resolveActiveOrgContext", () => ({
  resolveActiveOrgContext: (userId: string) => resolveActiveOrgContext(userId),
}));

const whenPageIdle = jest.fn<(signal: AbortSignal) => Promise<boolean>>();
jest.mock("@ai-matrx/kit/idle-scheduler", () => ({
  whenPageIdle: (signal: AbortSignal) => whenPageIdle(signal),
}));

const getUserId = jest.fn<() => string | null>();
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => getUserId(),
}));

jest.mock("@/lib/sync/identity", () => ({
  getIdentity: () => ({ type: "anon" as const }),
}));

import appContextReducer, {
  appContextPolicy,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
import { bootstrapActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import {
  isOrgBootstrapResolved,
  resetOrgBootstrapGate,
  whenOrgBootstrapResolved,
} from "@/lib/organizations/orgBootstrapGate";

function makeStore() {
  return configureStore({ reducer: { appContext: appContextReducer } });
}

const USER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  resetOrgBootstrapGate();
  resolveActiveOrgContext.mockReset();
  whenPageIdle.mockReset();
  getUserId.mockReset();
  getUserId.mockReturnValue(USER);
});

describe("bootstrapActiveOrganization always answers", () => {
  it("marks the bootstrap resolved when the resolver THROWS", async () => {
    // This is the thunk-level twin of "the shell fetch threw": the bootstrap
    // runs, everything inside it fails, and the question is still answered.
    resolveActiveOrgContext.mockRejectedValue(new Error("network down"));
    const store = makeStore();
    expect(selectOrgBootstrapResolved(store.getState())).toBe(false);

    await store.dispatch(
      bootstrapActiveOrganization(USER) as never,
    );

    expect(selectOrgBootstrapResolved(store.getState())).toBe(true);
    expect(isOrgBootstrapResolved()).toBe(true);
  });

  it("marks it resolved when the resolver returns nothing", async () => {
    resolveActiveOrgContext.mockResolvedValue(null);
    const store = makeStore();
    await store.dispatch(bootstrapActiveOrganization(USER) as never);
    expect(selectOrgBootstrapResolved(store.getState())).toBe(true);
  });

  it("runs on an explicit user id, before setUser has reached Redux", async () => {
    // The ordering fix depends on this: the shell island holds the
    // authenticated user several awaits before it dispatches `setUser`.
    getUserId.mockReturnValue(null);
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: "org-1",
      organization_name: "Acme",
      personal_organization_id: null,
    });
    const store = makeStore();
    await store.dispatch(bootstrapActiveOrganization(USER) as never);
    expect(resolveActiveOrgContext).toHaveBeenCalledWith(USER);
    expect(store.getState().appContext.organization_id).toBe("org-1");
  });

  it("still answers when there is no user at all", async () => {
    getUserId.mockReturnValue(null);
    const store = makeStore();
    await store.dispatch(bootstrapActiveOrganization() as never);
    expect(resolveActiveOrgContext).not.toHaveBeenCalled();
    expect(selectOrgBootstrapResolved(store.getState())).toBe(true);
  });
});

describe("appContextPolicy.remote.fetch answers on every exit", () => {
  const authIdentity = { type: "auth" as const, userId: USER };

  async function runFetch(signal: AbortSignal, identity: unknown) {
    const fetcher = appContextPolicy.config.remote?.fetch;
    if (!fetcher) throw new Error("appContextPolicy has no remote fetch");
    return (await fetcher({
      identity,
      signal,
      reason: "cold-boot",
    } as never)) as Record<string, unknown> | null;
  }

  it("answers for a guest, who will never have one", async () => {
    const result = await runFetch(new AbortController().signal, {
      type: "anon",
    });
    expect(result?.orgBootstrapResolved).toBe(true);
    expect(isOrgBootstrapResolved()).toBe(true);
  });

  it("answers when the idle gate ABORTS", async () => {
    whenPageIdle.mockResolvedValue(false);
    const result = await runFetch(new AbortController().signal, authIdentity);
    expect(result?.orgBootstrapResolved).toBe(true);
    expect(resolveActiveOrgContext).not.toHaveBeenCalled();
    expect(isOrgBootstrapResolved()).toBe(true);
  });

  it("answers when the resolver returns null", async () => {
    whenPageIdle.mockResolvedValue(true);
    resolveActiveOrgContext.mockResolvedValue(null);
    const result = await runFetch(new AbortController().signal, authIdentity);
    expect(result?.orgBootstrapResolved).toBe(true);
    expect(isOrgBootstrapResolved()).toBe(true);
  });

  it("answers when the request is aborted mid-resolve", async () => {
    whenPageIdle.mockResolvedValue(true);
    const controller = new AbortController();
    resolveActiveOrgContext.mockImplementation(async () => {
      controller.abort();
      return { organization_id: "org-1", organization_name: "Acme" };
    });
    const result = await runFetch(controller.signal, authIdentity);
    expect(result?.orgBootstrapResolved).toBe(true);
  });

  it("answers, and carries the organization, on the happy path", async () => {
    whenPageIdle.mockResolvedValue(true);
    resolveActiveOrgContext.mockResolvedValue({
      organization_id: "org-1",
      organization_name: "Acme",
    });
    const result = await runFetch(new AbortController().signal, authIdentity);
    expect(result).toMatchObject({
      organization_id: "org-1",
      orgBootstrapResolved: true,
    });
  });
});

describe("the gate is what a non-React writer waits on", () => {
  it("settles every waiter once, and never hangs", async () => {
    let settled = false;
    const waiter = whenOrgBootstrapResolved(50).then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    resolveActiveOrgContext.mockResolvedValue(null);
    await makeStore().dispatch(bootstrapActiveOrganization(USER) as never);
    await waiter;
    expect(settled).toBe(true);
  });

  it("gives up after its bound rather than hanging a write forever", async () => {
    const started = Date.now();
    await whenOrgBootstrapResolved(20);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(isOrgBootstrapResolved()).toBe(false);
  });
});
