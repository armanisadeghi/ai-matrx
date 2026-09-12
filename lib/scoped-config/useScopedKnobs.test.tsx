/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useScopedKnobs } from "./useScopedKnobs";
import { fetchKnobIndex } from "./service";
import type { ScopedKnob } from "./types";
jest.mock("./service", () => ({ fetchKnobIndex: jest.fn() }));
const fetchIndex = jest.mocked(fetchKnobIndex);
const row = { feature: "tables.pagination", key: "mode", effective_value: "scroll", origin: "platform_default" } as ScopedKnob;
function deferred() {
  let resolve!: (rows: ScopedKnob[]) => void;
  const promise = new Promise<ScopedKnob[]>((done) => { resolve = done; });
  return { promise, resolve };
}
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useScopedKnobs>;
function Harness({ userId, organizationId = "org" }: { userId?: string; organizationId?: string | null }) {
  current = useScopedKnobs({ organizationId, userId });
  return null;
}
beforeEach(() => { fetchIndex.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
it("masks the old user's policy immediately and ignores a stale request", async () => {
  const first = deferred(); const second = deferred(); const third = deferred();
  fetchIndex.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  act(() => root.render(<Harness userId="one" />));
  await act(async () => first.resolve([row]));
  expect(current.knobs).toHaveLength(1);
  act(() => root.render(<Harness userId="two" />));
  expect(current.knobs).toEqual([]);
  expect(current.isLoading).toBe(true);
  act(() => root.render(<Harness userId="three" />));
  await act(async () => second.resolve([row]));
  expect(current.knobs).toEqual([]);
  await act(async () => third.resolve([{ ...row, effective_value: "manual" }]));
  expect(current.knobs[0]?.effective_value).toBe("manual");
});
it("clears configuration and error without an organization, and retries a failure", async () => {
  fetchIndex.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([row]);
  await act(async () => root.render(<Harness />));
  expect(current.error).toBe("offline");
  await act(async () => current.refresh());
  expect(current.knobs).toHaveLength(1);
  act(() => root.render(<Harness organizationId={null} />));
  expect(current).toMatchObject({ knobs: [], error: null, isLoading: false });
  expect(fetchIndex).toHaveBeenCalledTimes(2);
});
