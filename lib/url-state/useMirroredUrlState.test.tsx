/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMirroredUrlState } from "./useUrlState";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type View = { sort: string; filter: string };

function Harness() {
  const [view, setView] = useMirroredUrlState<View>({
    parse: (params) => ({
      sort: params.get("sort") ?? "",
      filter: params.get("f") ?? "",
    }),
    toParams: (value) => ({
      sort: value.sort || null,
      f: value.filter || null,
    }),
    isSame: (a, b) => a.sort === b.sort && a.filter === b.filter,
  });

  return (
    <button
      data-view={`${view.sort}|${view.filter}`}
      onClick={() => setView({ sort: "reset_date.asc", filter: "Claude" })}
    />
  );
}

describe("useMirroredUrlState", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState({}, "", "/data/table-id");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps a local multi-parameter decision instead of restoring the stale render URL", () => {
    act(() => root.render(<Harness />));

    act(() => host.querySelector("button")?.click());

    expect(host.querySelector("button")?.getAttribute("data-view")).toBe(
      "reset_date.asc|Claude",
    );
    expect(window.location.search).toBe("?sort=reset_date.asc&f=Claude");
  });
});
