/**
 * RC-B12 round 11: an empty view is an answer only after a read that
 * SUCCEEDED and returned nothing. Loading shows loading; failed shows the
 * error with the Alchemy Menu — never "Your vault is empty" under an error.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/components/errors/ErrorNotice", () => ({
  ErrorNotice: ({ title, message, error }: { title?: string; message?: string; error?: unknown }) => (
    <div data-error-notice="">
      {title} {message ?? String((error as Error)?.message ?? error)}
    </div>
  ),
}));

import { ReadGate, readStatusOf } from "@/components/read-state/ReadGate";
import { ReadFailure } from "@/components/read-state/ReadFailure";

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

describe("ReadFailure", () => {
  it("names the failed read, even when all it has is a flag", () => {
    expect(renderToStaticMarkup(<ReadFailure error={true} what="your tasks" />)).toContain("your tasks");
  });
});
