/**
 * @jest-environment jsdom
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SettingsSelect, matchesSearch } from "../SettingsSelect";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const zones = ["America/Los_Angeles", "Asia/Tokyo", "Europe/Paris", "Asia/Kolkata"].map(
  (n) => ({ value: n, label: n.replace(/_/g, " ") }),
);

describe("searchable SettingsSelect (time zone picker)", () => {
  it("matchesSearch is a case-insensitive contains on city and zone", () => {
    expect(matchesSearch("tokyo", zones[1])).toBe(true);
    expect(matchesSearch("TOKYO", zones[1])).toBe(true);
    expect(matchesSearch("los angeles", zones[0])).toBe(true);
    expect(matchesSearch("asia", zones[1])).toBe(true);
    expect(matchesSearch("tokyo", zones[2])).toBe(false);
  });

  it("typing Tokyo narrows the open list to Asia/Tokyo", async () => {
    (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.scrollIntoView ??= () => {};
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <SettingsSelect label="Time zone" value="America/Los_Angeles" onValueChange={() => {}} options={zones} searchable />,
      );
    });
    await act(async () => {
      (document.querySelector('[role="combobox"]') as HTMLElement).click();
    });
    expect(document.querySelectorAll('[role="option"]').length).toBe(4);
    const input = document.querySelector("input[placeholder='Search']") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Tokyo");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const opts = document.querySelectorAll('[role="option"]');
    expect(opts.length).toBe(1);
    expect(opts[0].textContent).toContain("Asia/Tokyo");
  });
});
