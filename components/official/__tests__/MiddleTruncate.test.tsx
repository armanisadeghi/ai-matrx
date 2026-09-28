/**
 * NAMES THAT DIFFER AT THE END STAY DISTINCT (page-pass /notes 2026-09-28: the
 * phone Context sheet showed four "LCP Test Repositories lcp-…" rows that
 * read the same). Break: the tail dropped or truncated → "tail" red; a short
 * name split into an empty head → "short" red; the full text lost for
 * assistive tech → "full" red.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MiddleTruncate, splitForMiddleTruncate } from "../MiddleTruncate";

describe("MiddleTruncate", () => {
  it("tail: siblings keep their distinguishing end", () => {
    const a = splitForMiddleTruncate("LCP Test Repositories lcp-0917-a");
    const b = splitForMiddleTruncate("LCP Test Repositories lcp-0917-b");
    expect(a.end).not.toBe(b.end);
    expect(a.head + a.end).toBe("LCP Test Repositories lcp-0917-a");
  });

  it("short: a short name keeps at most half as tail", () => {
    expect(splitForMiddleTruncate("Tags")).toEqual({ head: "Ta", end: "gs" });
    expect(splitForMiddleTruncate("A")).toEqual({ head: "A", end: "" });
  });

  it("full: the whole name is the title and the screen-reader text; the tail never shrinks", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<MiddleTruncate text="LCP Test Repositories lcp-0917-b" />);
    expect(host.querySelector('[title="LCP Test Repositories lcp-0917-b"]')).toBeTruthy();
    expect(host.querySelector(".sr-only")?.textContent).toBe("LCP Test Repositories lcp-0917-b");
    expect(host.querySelector(".shrink-0")?.textContent).toBe("lcp-0917-b");
  });
});
