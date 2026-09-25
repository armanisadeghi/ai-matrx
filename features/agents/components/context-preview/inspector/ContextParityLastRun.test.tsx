/**
 * "Last parity: <date>, <n> defects" (lane PARITY-NIGHTLY) — the line is honest in every state:
 * a guard that never ran says so, a schedule that is off says so with the one place to turn it
 * on, a run that could not finish says how many parts could not run, and a run with defects
 * links to the rows. The data read is mocked; the line is the real component.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const maybeSingle = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/schedulerDb", () => ({
  schedulerDb: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  CONTEXT_PARITY_ROWS_HREF,
  ContextParityLastRun,
  SYSTEM_JOBS_HREF,
} from "./ContextParityLastRun";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  maybeSingle.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render() {
  await act(async () => {
    root.render(<ContextParityLastRun />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const LAST = {
  ran_at: "2026-09-26T09:15:04Z",
  trigger: "schedule",
  defects: 8,
  seat_defects: 0,
  raw_defects: 8,
  refused: 0,
  complete: true,
  organizations: 12,
  types: 43,
};

test("a guard that never ran says so, and a switched-off schedule names where to turn it on", async () => {
  maybeSingle.mockResolvedValue({ data: { enabled: false, metadata: { handler_gate_pending: true } }, error: null });
  await render();
  expect(host.textContent).toContain("Last parity: never run.");
  expect(host.textContent).toContain("The nightly schedule is off");
  expect(host.querySelector(`a[href="${SYSTEM_JOBS_HREF}"]`)).not.toBeNull();
});

test("a run with defects gives the count per check and links to the rows", async () => {
  maybeSingle.mockResolvedValue({ data: { enabled: true, metadata: { last_parity: LAST } }, error: null });
  await render();
  expect(host.textContent).toContain("8 defects");
  expect(host.textContent).toContain("seat 0, raw copy 8");
  expect(host.querySelector(`a[href="${CONTEXT_PARITY_ROWS_HREF}"]`)).not.toBeNull();
  expect(host.textContent).not.toContain("schedule is off");
});

test("a run that could not finish says how many parts could not run", async () => {
  maybeSingle.mockResolvedValue({
    data: { enabled: true, metadata: { last_parity: { ...LAST, defects: 0, raw_defects: 0, refused: 1, complete: false } } },
    error: null,
  });
  await render();
  expect(host.textContent).toContain("0 defects");
  expect(host.textContent).toContain("1 part could not run");
});

test("an unreadable task row says why instead of showing nothing", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: { message: "permission denied for schema scheduler" } });
  await render();
  expect(host.textContent).toContain("could not be read: permission denied for schema scheduler");
});
