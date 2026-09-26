/**
 * RC-B12 round 12: the hand-rolled read (useState loading + catch/console.error
 * + list left at []) is the source of "No items yet" under a failed read.
 * useRead makes the failure a status: a rejected read is "error", never
 * "ready" with empty data.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRead } from "@/components/read-state/useRead";

function Probe({ read, deps = [] as unknown[] }: { read: () => Promise<string[]>; deps?: unknown[] }) {
  const r = useRead(read, deps, { initialData: [] });
  return (
    <div>
      <span data-testid="status">{r.status}</span>
      <span data-testid="rows">{(r.data ?? []).join(",")}</span>
      <span data-testid="error">{r.error ? String((r.error as Error).message ?? r.error) : ""}</span>
      <button onClick={r.retry}>retry</button>
    </div>
  );
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (el: React.ReactElement) => { act(() => root.render(el)); return { rerender: (next: React.ReactElement) => act(() => root.render(next)) }; };
const screen = {
  getByTestId: (id: string) => host.querySelector(`[data-testid="${id}"]`)!,
  getByText: (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === t)!,
};
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("useRead", () => {
  it("a failed read is status error with the error — never ready-and-empty", async () => {
    render(<Probe read={() => Promise.reject(new Error("forced failure"))} />);
    expect(screen.getByTestId("status").textContent).toBe("loading");
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("error");
    expect(screen.getByTestId("error").textContent).toBe("forced failure");
  });

  it("a read that throws synchronously is an error too", async () => {
    render(<Probe read={() => { throw new Error("sync throw"); }} />);
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("error");
  });

  it("a successful empty read is ready — the only time empty is an answer", async () => {
    render(<Probe read={() => Promise.resolve([])} />);
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("rows").textContent).toBe("");
  });

  it("retry re-runs the read and clears the failure on success", async () => {
    let fail = true;
    render(<Probe read={() => (fail ? Promise.reject(new Error("down")) : Promise.resolve(["a"]))} />);
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("error");
    fail = false;
    await act(async () => { screen.getByText("retry").click(); });
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("rows").textContent).toBe("a");
    expect(screen.getByTestId("error").textContent).toBe("");
  });

  it("a superseded read's late answer is dropped", async () => {
    let resolveFirst: (v: string[]) => void = () => {};
    const first = new Promise<string[]>((r) => { resolveFirst = r; });
    const { rerender } = render(<Probe read={() => first} deps={[1]} />);
    rerender(<Probe read={() => Promise.resolve(["second"])} deps={[2]} />);
    await flush();
    resolveFirst(["first"]);
    await flush();
    expect(screen.getByTestId("rows").textContent).toBe("second");
  });
});
