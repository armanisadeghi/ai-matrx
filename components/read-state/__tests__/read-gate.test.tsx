/**
 * RC-B12 round 11: an empty view is an answer only after a read that
 * SUCCEEDED and returned nothing. Loading shows loading; failed shows the
 * error with the Alchemy Menu — never "Your vault is empty" under an error.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual("@ai-matrx/design-system"),
  ErrorNotice: ({ title, message, error }: { title?: string; message?: string; error?: unknown }) => (
    <div data-error-notice="">
      {title} {message ?? String((error as Error)?.message ?? error)}
    </div>
  ),
}));

import { ReadEmpty, ReadGate, ReadStaleNotice, readOf, readStatusOf } from "@ai-matrx/design-system";
import { ReadFailure } from "@ai-matrx/design-system";
import { UntrustedCount, countReadState, countIsStale } from "@ai-matrx/design-system";

const empty = <p>Your vault is empty</p>;
const list = <ul><li>row</li></ul>;

describe("ReadGate", () => {
  it("failed read: the failure, never the empty view", () => {
    const html = renderToStaticMarkup(
      <ReadGate status="error" error="forced failure" what="your credentials" isEmpty empty={empty}>{list}</ReadGate>,
    );
    expect(html).toContain("data-error-notice");
    expect(html).toContain("forced failure");
    expect(html).not.toContain("Your vault is empty");
  });
  it("loading: a wait, never the empty view", () => {
    const html = renderToStaticMarkup(<ReadGate status="loading" what="your credentials" isEmpty empty={empty}>{list}</ReadGate>);
    expect(html).not.toContain("Your vault is empty");
    expect(html).toContain('aria-busy="true"');
  });
  it("succeeded with nothing: the empty view", () => {
    const html = renderToStaticMarkup(<ReadGate status="ready" what="your credentials" isEmpty empty={empty}>{list}</ReadGate>);
    expect(html).toContain("Your vault is empty");
  });
  it("succeeded with rows: the rows", () => {
    const html = renderToStaticMarkup(<ReadGate status="ready" what="your credentials" isEmpty={false} empty={empty}>{list}</ReadGate>);
    expect(html).toContain("<li>row</li>");
  });
  it("readStatusOf reads the usual flags", () => {
    expect(readStatusOf({ isLoading: true })).toBe("loading");
    expect(readStatusOf({ isError: true })).toBe("error");
    expect(readStatusOf({ error: "x" })).toBe("error");
    expect(readStatusOf({ isLoading: false })).toBe("ready");
  });
});

describe("ReadOutcome on a list primitive (RC-B12 round 13)", () => {
  it("ReadEmpty: failure, wait, then the empty view only after success", () => {
    const failed = renderToStaticMarkup(<ReadEmpty read={{ status: "error", error: "forced failure", what: "your tasks" }}>{empty}</ReadEmpty>);
    expect(failed).toContain("forced failure");
    expect(failed).not.toContain("Your vault is empty");
    const waiting = renderToStaticMarkup(<ReadEmpty read={{ status: "loading" }}>{empty}</ReadEmpty>);
    expect(waiting).toContain('aria-busy="true"');
    expect(waiting).not.toContain("Your vault is empty");
    expect(renderToStaticMarkup(<ReadEmpty read={{ status: "ready" }}>{empty}</ReadEmpty>)).toContain("Your vault is empty");
    // No read handed in: the primitive's empty view, as before.
    expect(renderToStaticMarkup(<ReadEmpty>{empty}</ReadEmpty>)).toContain("Your vault is empty");
  });
  it("a failed refresh over kept rows: the rows stay under a stale notice", () => {
    const html = renderToStaticMarkup(
      <ReadGate read={{ status: "error", error: "timeout", what: "your tasks", onRetry: () => {} }} isEmpty={false} empty={empty}>{list}</ReadGate>,
    );
    expect(html).toContain("<li>row</li>");
    expect(html).toContain("may be out of date");
    expect(renderToStaticMarkup(<ReadStaleNotice read={{ status: "ready" }} />)).toBe("");
  });
  it("readOf folds a query into an outcome with its retry", () => {
    let retried = 0;
    const outcome = readOf({ isLoading: false, error: new Error("x"), refetch: () => { retried += 1; } }, { what: "your tasks" });
    expect(outcome.status).toBe("error");
    expect(outcome.what).toBe("your tasks");
    outcome.onRetry?.();
    expect(retried).toBe(1);
    expect(readOf({ isLoading: true }).status).toBe("loading");
    expect(readOf({ isLoading: false, isError: false }).status).toBe("ready");
  });
});

describe("ReadFailure", () => {
  it("names the failed read, even when all it has is a flag", () => {
    expect(renderToStaticMarkup(<ReadFailure error={true} what="your tasks" />)).toContain("your tasks");
  });
});

describe("ReadFailure always offers a way forward (page-pass 2026-09-27)", () => {
  // The mocked ErrorNotice above drops `actions`, so the element ReadFailure
  // returns is read directly and its retry control rendered on its own.
  it("a server page (no onRetry, it cannot pass one) gets a same-URL reload", () => {
    const element = ReadFailure({ error: new Error("timed out"), what: "this message template" });
    const actions = (element.props as { actions?: React.ReactElement }).actions;
    expect(actions).toBeTruthy();
    const html = renderToStaticMarkup(actions as React.ReactElement);
    expect(html).toContain("Reload page");
  });

  it("a client surface with its own retry gets Try again, not a page reload", () => {
    const element = ReadFailure({ error: new Error("timed out"), onRetry: () => {} });
    const html = renderToStaticMarkup((element.props as { actions: React.ReactElement }).actions);
    expect(html).toContain("Try again");
    expect(html).not.toContain("Reload page");
  });
});

describe("counts keep their last known value (RC-B12 r13 stale-while-error ruling)", () => {
  it("first load with nothing known is loading; a failure with nothing known is failed", () => {
    expect(countReadState({ read: readOf({ isLoading: true, data: undefined }) })).toBe("loading");
    expect(countReadState({ read: readOf({ isError: true, error: new Error("x"), data: [] }) })).toBe("failed");
  });
  it("a refetch in flight keeps the last value — no flicker to …", () => {
    expect(countReadState({ read: readOf({ status: "loading", hasData: true }) })).toBe("ready");
    expect(countReadState({ read: readOf({ isLoading: true, data: [{ id: 1 }] }) })).toBe("ready");
  });
  it("a failed refresh keeps the last value and marks it stale — never —", () => {
    const read = readOf({ isError: true, error: new Error("down"), dataUpdatedAt: 1700000000000 });
    expect(countReadState({ read })).toBe("ready");
    expect(countIsStale(read)).toBe(true);
    const html = renderToStaticMarkup(<UntrustedCount read={read} value={12} label="Assists" />);
    expect(html).toContain(">12<");
    expect(html).toContain("last known value");
  });
  it("an empty array is a placeholder, not a known answer", () => {
    expect(countReadState({ read: readOf({ status: "loading", data: [] }) })).toBe("loading");
  });
});
