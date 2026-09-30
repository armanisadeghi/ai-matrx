/**
 * THE LIST CELL KEEPS UP WHILE A CANDIDATE COLLECTS (V1 D3) — every
 * Candidates cell on a mandate list re-reads through ONE batched call
 * (public.mnd_candidate_cells) on the heartbeat while its candidate collects,
 * shows the newer answer, and stops once nothing collects.
 *
 * The host list hands a FRESH row object on every render (seen on the clone
 * 2026-09-30: the org list's cell re-read six times and never changed), so the
 * test re-renders with an equal-but-new cell object between beats.
 */

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  peekEffectiveKnob: () => 10,
  ensureEffectiveKnob: async () => 10,
  subscribeEffectiveKnob: () => () => undefined,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CandidateListCell } from "../components/CandidateListCell";

const MANDATE = "c2d0a661-f18c-48ed-b952-1432dcedc22c";
function cell(runsIn: number, status: "collecting" | "ready") {
  return {
    id: "8eceef14-62ea-43e3-84fa-b45f7253197e",
    status,
    runs_wanted: 2,
    runs_in: runsIn,
    runs_failed: 0,
    runs_stopped: 0,
    runs_regressed: 0,
    stalled: false,
    open_count: 1,
    recommendation: null,
  } as const;
}

let root: Root | null = null;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  jest.useRealTimers();
});

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

it("re-reads while collecting, shows the newer count through fresh row objects, then stops", async () => {
  jest.useFakeTimers();
  rpc
    .mockResolvedValueOnce({ data: { [MANDATE]: cell(1, "collecting") }, error: null })
    .mockResolvedValueOnce({ data: { [MANDATE]: cell(2, "ready") }, error: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  const draw = () =>
    root!.render(<CandidateListCell mandateId={MANDATE} cell={cell(1, "collecting")} href="/m/x" />);
  act(() => {
    root = createRoot(container);
    draw();
  });
  const text = () => container.querySelector("[data-testid=mandate-candidate-cell]")?.textContent;
  expect(text()).toBe("1 of 2 in");

  await tick(10_000);
  expect(rpc).toHaveBeenCalledWith("mnd_candidate_cells", { p_mandate_ids: [MANDATE] });
  await tick(10_000);
  // The host list re-renders with a new-but-equal row object.
  act(() => draw());
  expect(text()).toBe("2 of 2 in");

  await tick(60_000);
  expect(rpc).toHaveBeenCalledTimes(2);
});
