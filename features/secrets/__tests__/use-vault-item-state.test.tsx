import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

const getBulk = jest.fn();
const setFavorite = jest.fn();
const touch = jest.fn();
jest.mock("@/features/scopes/service/favoritesService", () => ({
  favoritesService: { getBulk, setFavorite, touch },
}));

import { useVaultItemState } from "../use-vault-item-state";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((next) => { resolve = next; }), resolve };
}

let activeState: ReturnType<typeof useVaultItemState>;

function Harness({ actorId = "user", organizationId = "org", scopeKey = "mine", itemIds = ["a"] }: {
  actorId?: string | null; organizationId?: string | null; scopeKey?: string; itemIds?: string[];
}) {
  const state = useVaultItemState({ actorId, organizationId, scopeKey, itemIds });
  useLayoutEffect(() => { activeState = state; }, [state]);
  return <div data-status={state.status} data-favorite={state.stateById.get("a")?.isFavorite ? "yes" : "no"}>
    <button type="button" onClick={() => void state.toggleFavorite("a")}>favorite</button>
    <button type="button" onClick={() => void state.touch("a")}>touch</button>
  </div>;
}

describe("useVaultItemState", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    getBulk.mockReset(); setFavorite.mockReset(); touch.mockReset();
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it("ignores a stale actor, scope, or list completion and excludes removed IDs", async () => {
    const first = deferred<{ ok: true; data: { items: Array<{ entityId: string; isFavorite: boolean; lastViewedAt: null }> } }>();
    const second = deferred<{ ok: true; data: { items: Array<{ entityId: string; isFavorite: boolean; lastViewedAt: null }> } }>();
    getBulk.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await act(async () => root.render(<Harness actorId="old" scopeKey="mine" itemIds={["a"]} />));
    await act(async () => root.render(<Harness actorId="new" scopeKey="shared" itemIds={["b"]} />));
    await act(async () => first.resolve({ ok: true, data: { items: [{ entityId: "a", isFavorite: true, lastViewedAt: null }] } }));
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("loading");
    await act(async () => second.resolve({ ok: true, data: { items: [{ entityId: "a", isFavorite: true, lastViewedAt: null }, { entityId: "b", isFavorite: true, lastViewedAt: null }] } }));
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("ready");
    expect(container.firstElementChild?.getAttribute("data-favorite")).toBe("no");
  });

  it("does not write before ready and reports failed writes without inventing state", async () => {
    const initial = deferred<{ ok: true; data: { items: [] } }>();
    getBulk.mockReturnValueOnce(initial.promise);
    await act(async () => root.render(<Harness />));
    const favorite = container.querySelector<HTMLButtonElement>("button");
    if (!favorite) throw new Error("missing favorite button");
    await act(async () => favorite.click());
    expect(setFavorite).not.toHaveBeenCalled();
    await act(async () => initial.resolve({ ok: true, data: { items: [] } }));
    setFavorite.mockResolvedValueOnce({ ok: false, error: { message: "denied" } });
    await act(async () => favorite.click());
    expect(setFavorite).toHaveBeenCalledWith("credential_item", "a", true);
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("error");
    expect(container.firstElementChild?.getAttribute("data-favorite")).toBe("no");
  });

  const row = (id: string, favorite = false, viewed: string | null = null) => ({
    entityId: id, isFavorite: favorite, lastViewedAt: viewed,
  });
  const ok = (...items: ReturnType<typeof row>[]) => ({ ok: true as const, data: { items } });

  it("retains both overlapping different-item readbacks and locks each item through reconciliation", async () => {
    const readA = deferred<ReturnType<typeof ok>>();
    const readB = deferred<ReturnType<typeof ok>>();
    getBulk.mockResolvedValueOnce(ok(row("a"), row("b")))
      .mockReturnValueOnce(readA.promise).mockReturnValueOnce(readB.promise);
    setFavorite.mockResolvedValue({ ok: true, data: {} });
    await act(async () => root.render(<Harness itemIds={["a", "b"]} />));
    let actionA: Promise<boolean>;
    let actionB: Promise<boolean>;
    await act(async () => {
      actionA = activeState.toggleFavorite("a");
      actionB = activeState.toggleFavorite("b");
    });
    await act(async () => { expect(await activeState.toggleFavorite("a")).toBe(false); });
    expect(setFavorite).toHaveBeenCalledTimes(2);
    expect([...activeState.pendingItemIds].sort()).toEqual(["a", "b"]);
    await act(async () => { readB.resolve(ok(row("b", true))); await actionB; });
    await act(async () => { readA.resolve(ok(row("a", true))); await actionA; });
    expect(activeState.stateById.get("a")?.isFavorite).toBe(true);
    expect(activeState.stateById.get("b")?.isFavorite).toBe(true);
    expect(activeState.pendingItemIds.size).toBe(0);
  });

  it("queues explicit opens during initial loading", async () => {
    const initial = deferred<ReturnType<typeof ok>>();
    getBulk.mockReturnValueOnce(initial.promise).mockResolvedValueOnce(ok(row("a", false, "2026-09-20T10:00:00Z")));
    touch.mockResolvedValue({ ok: true, data: {} });
    await act(async () => root.render(<Harness />));
    await act(async () => { expect(await activeState.touch("a")).toBe(true); });
    expect(touch).not.toHaveBeenCalled();
    await act(async () => initial.resolve(ok(row("a"))));
    expect(touch).toHaveBeenCalledTimes(1);
    expect(activeState.stateById.get("a")?.lastViewedAt).toBe("2026-09-20T10:00:00Z");
  });

  it("delivers an open queued behind a favorite only after its readback", async () => {
    const favoriteRead = deferred<ReturnType<typeof ok>>();
    getBulk.mockResolvedValueOnce(ok(row("a"))).mockReturnValueOnce(favoriteRead.promise)
      .mockResolvedValueOnce(ok(row("a", true, "2026-09-20T11:00:00Z")));
    setFavorite.mockResolvedValue({ ok: true, data: {} });
    touch.mockResolvedValue({ ok: true, data: {} });
    await act(async () => root.render(<Harness />));
    let action: Promise<boolean>;
    await act(async () => { action = activeState.toggleFavorite("a"); });
    await act(async () => { expect(await activeState.touch("a")).toBe(true); });
    expect(touch).not.toHaveBeenCalled();
    await act(async () => { favoriteRead.resolve(ok(row("a", true))); await action; });
    expect(touch).toHaveBeenCalledTimes(1);
    expect(activeState.stateById.get("a")?.lastViewedAt).toBe("2026-09-20T11:00:00Z");
  });

  it("old-context finally cannot unlock a new same-ID mutation even after returning to the prior context", async () => {
    const oldWrite = deferred<{ ok: true; data: object }>();
    const newWrite = deferred<{ ok: true; data: object }>();
    getBulk.mockResolvedValue(ok(row("a")));
    setFavorite.mockReturnValueOnce(oldWrite.promise).mockReturnValueOnce(newWrite.promise);
    await act(async () => root.render(<Harness actorId="first" />));
    let oldAction: Promise<boolean>;
    let newAction: Promise<boolean>;
    await act(async () => { oldAction = activeState.toggleFavorite("a"); });
    await act(async () => root.render(<Harness actorId="second" />));
    await act(async () => root.render(<Harness actorId="first" />));
    expect(activeState.pendingItemIds.size).toBe(0);
    await act(async () => { newAction = activeState.toggleFavorite("a"); });
    expect([...activeState.pendingItemIds]).toEqual(["a"]);
    await act(async () => { oldWrite.resolve({ ok: true, data: {} }); expect(await oldAction).toBe(false); });
    const reads = getBulk.mock.calls.length;
    await act(async () => { expect(await activeState.toggleFavorite("a")).toBe(false); });
    expect(setFavorite).toHaveBeenCalledTimes(2);
    expect(getBulk).toHaveBeenCalledTimes(reads);
    await act(async () => { newWrite.resolve({ ok: true, data: {} }); await newAction; });
  });

  it("discards queued opens when leaving a context, including a later return", async () => {
    const initial = deferred<ReturnType<typeof ok>>();
    getBulk.mockReturnValueOnce(initial.promise).mockResolvedValue(ok(row("a")));
    await act(async () => root.render(<Harness actorId="first" />));
    await act(async () => { await activeState.touch("a"); });
    await act(async () => root.render(<Harness actorId="second" />));
    await act(async () => root.render(<Harness actorId="first" />));
    await act(async () => initial.resolve(ok(row("a"))));
    expect(touch).not.toHaveBeenCalled();
  });

  it("keeps a sibling failure visible when another item's readback succeeds", async () => {
    const readA = deferred<ReturnType<typeof ok>>();
    getBulk.mockResolvedValueOnce(ok(row("a"), row("b"))).mockReturnValueOnce(readA.promise);
    setFavorite.mockResolvedValueOnce({ ok: true, data: {} }).mockResolvedValueOnce({ ok: false, error: {} });
    await act(async () => root.render(<Harness itemIds={["a", "b"]} />));
    let action: Promise<boolean>;
    await act(async () => { action = activeState.toggleFavorite("a"); await activeState.toggleFavorite("b"); });
    await act(async () => { readA.resolve(ok(row("a", true))); await action; });
    expect(activeState.status).toBe("error");
    expect(activeState.error).toContain("Couldn't update this favorite");
    expect(activeState.stateById.get("a")?.isFavorite).toBe(true);
  });

  it("retries a failed explicit open after the user retries state loading", async () => {
    getBulk.mockResolvedValue(ok(row("a")));
    touch.mockResolvedValueOnce({ ok: false, error: {} }).mockResolvedValueOnce({ ok: true, data: {} });
    await act(async () => root.render(<Harness />));
    await act(async () => { expect(await activeState.touch("a")).toBe(false); });
    expect(activeState.status).toBe("error");
    await act(async () => activeState.retry());
    expect(touch).toHaveBeenCalledTimes(2);
    expect(activeState.status).toBe("ready");
  });

});
