/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { tableUrlParamPrefix, useTableUrlState } from "./useTableUrlState";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("tableUrlParamPrefix", () => {
  it("creates an isolated namespace for each table", () => {
    expect(tableUrlParamPrefix("accounts")).toBe("table.accounts");
    expect(tableUrlParamPrefix("account-audit")).toBe("table.account-audit");
  });

  it("rejects unstable or ambiguous table ids", () => {
    expect(() => tableUrlParamPrefix("Account List")).toThrow("must match");
    expect(() => tableUrlParamPrefix("accounts.rows")).toThrow("must match");
  });
});

function Harness({ tableId }: { tableId: string }) {
  const table = useTableUrlState({ tableId, defaultPageSize: 25 });
  return (
    <div data-table={tableId}>
      <output data-value={tableId}>{table.state.search}</output>
      <button
        data-set={tableId}
        onClick={() =>
          table.onStateChange({
            ...table.state,
            search: `${tableId}-query`,
          })
        }
      />
      <button
        data-refine={tableId}
        onClick={() =>
          table.onStateChange({
            ...table.state,
            search: `${tableId}-refined`,
          })
        }
      />
      <button data-reset={tableId} onClick={table.reset} />
    </div>
  );
}

describe("useTableUrlState", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState({}, "", "/tables?view=cards");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.restoreAllMocks();
  });

  it("isolates siblings, preserves page params, and rehydrates navigation", () => {
    const pushSpy = jest.spyOn(window.history, "pushState");
    const replaceSpy = jest.spyOn(window.history, "replaceState");
    act(() =>
      root.render(
        <>
          <Harness tableId="primary" />
          <Harness tableId="secondary" />
        </>,
      ),
    );

    act(() =>
      host.querySelector<HTMLButtonElement>('[data-set="primary"]')?.click(),
    );
    const primaryUrl = `${window.location.pathname}${window.location.search}`;
    expect(window.location.search).toContain("view=cards");
    expect(window.location.search).toContain("table.primary.q=primary-query");
    expect(window.location.search).not.toContain("table.secondary.q");
    expect(pushSpy).toHaveBeenCalled();

    act(() =>
      host.querySelector<HTMLButtonElement>('[data-refine="primary"]')?.click(),
    );
    expect(window.location.search).toContain("table.primary.q=primary-refined");
    expect(replaceSpy).toHaveBeenCalled();

    act(() => {
      window.history.replaceState({}, "", primaryUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    act(() =>
      host.querySelector<HTMLButtonElement>('[data-set="secondary"]')?.click(),
    );
    const bothUrl = `${window.location.pathname}${window.location.search}`;
    expect(window.location.search).toContain("table.primary.q=primary-query");
    expect(window.location.search).toContain(
      "table.secondary.q=secondary-query",
    );

    act(() => {
      window.history.replaceState({}, "", primaryUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector('[data-value="primary"]')?.textContent).toBe(
      "primary-query",
    );
    expect(host.querySelector('[data-value="secondary"]')?.textContent).toBe(
      "",
    );

    act(() => {
      window.history.replaceState({}, "", bothUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector('[data-value="secondary"]')?.textContent).toBe(
      "secondary-query",
    );

    act(() =>
      host.querySelector<HTMLButtonElement>('[data-reset="primary"]')?.click(),
    );
    expect(window.location.search).not.toContain("table.primary.");
    expect(window.location.search).toContain(
      "table.secondary.q=secondary-query",
    );
    expect(window.location.search).toContain("view=cards");
  });
});
