/**
 * The Tags column cell shows EVERY tag, and the tag panel adds or removes the
 * chosen tags on the target keywords.
 *
 * Red before the tags work: neither component existed, and the only per-keyword
 * cell (`StampCell`) renders one value, so a second tag was invisible.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/utils/supabase/client", () => ({
  __esModule: true,
  // @ai-matrx/associations (loaded by the rich-content host setup) requires a client with `.rpc`.
  supabase: { rpc: jest.fn() },
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { TagsCell } from "./TagsCell";
import { TagAssignPanel } from "./TagAssignPanel";
import type { KeywordStamp } from "../data";
import type { FacetValue } from "@/features/marketing/seo/value-system/dimensions/data";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function stamp(value: string, label: string): KeywordStamp {
  return {
    dimension: "site_tags_2edfba58",
    dimensionLabel: "Tags",
    value,
    valueLabel: label,
    valueId: `id-${value}`,
    source: "human",
    pinned: false,
    notes: null,
  };
}

function tag(key: string, label: string): FacetValue {
  return {
    value_id: `id-${key}`,
    slug: `site_tags_2edfba58:${key}`,
    key,
    label,
    description: null,
    keyword_count: 3,
    abstain: false,
    as_of: null,
    condition_matcher_count: 0,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonNamed(host: HTMLElement, name: string | RegExp) {
  const match = Array.from(host.querySelectorAll("button")).find((b) =>
    typeof name === "string"
      ? b.textContent?.trim() === name
      : name.test(b.textContent ?? ""),
  );
  if (!match) throw new Error(`no button ${String(name)}`);
  return match;
}

describe("keyword tag controls", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it("shows every tag on a keyword, and filters by the one clicked", () => {
    const onFilter = jest.fn();
    act(() => {
      root.render(
        <TagsCell
          tags={[stamp("priority", "Priority"), stamp("saved", "Saved")]}
          activeValues={["saved"]}
          onFilter={onFilter}
        />,
      );
    });
    expect(buttonNamed(host, "Priority")).toBeTruthy();
    const saved = buttonNamed(host, "Saved");
    expect(saved.getAttribute("aria-pressed")).toBe("true");
    act(() => buttonNamed(host, "Priority").click());
    expect(onFilter).toHaveBeenCalledWith("priority");
  });

  it("collapses tags past three into +N", () => {
    act(() => {
      root.render(
        <TagsCell
          tags={[
            stamp("a", "A"),
            stamp("b", "B"),
            stamp("c", "C"),
            stamp("d", "D"),
            stamp("e", "E"),
          ]}
        />,
      );
    });
    expect(host.textContent).toContain("+2");
    expect(host.textContent).not.toContain("D");
  });

  it("adds an existing tag and a typed new one to the target keywords", async () => {
    const write = jest.fn(async () => ({
      dimensionSlug: "site_tags_2edfba58",
      changed: 4,
      created: ["Q4 push"],
    }));
    const onDone = jest.fn();
    act(() => {
      root.render(
        <TagAssignPanel
          siteId="site"
          tags={[tag("priority", "Priority"), tag("saved", "Saved")]}
          target={{ keywordIds: ["k1", "k2"], label: "2 keywords" }}
          onDone={onDone}
          write={write}
        />,
      );
    });

    act(() => buttonNamed(host, "Priority").click());
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Tag name"]');
    if (!input) throw new Error("no tag input");
    act(() => setInputValue(input, "Q4 push"));
    act(() => buttonNamed(host, /New “Q4 push”/).click());
    await act(async () => buttonNamed(host, "Add to 2").click());

    expect(write).toHaveBeenCalledWith({
      siteId: "site",
      keywordIds: ["k1", "k2"],
      tags: [
        { value: "priority", label: "Priority", isNew: false },
        { value: "q4_push", label: "Q4 push", isNew: true },
      ],
      remove: false,
    });
    expect(onDone).toHaveBeenCalledWith(expect.anything(), {
      remove: false,
      labels: ["Priority", "Q4 push"],
    });
  });

  it("removes only the chosen existing tags", async () => {
    const write = jest.fn(async () => ({
      dimensionSlug: "site_tags_2edfba58",
      changed: 1,
      created: [],
    }));
    act(() => {
      root.render(
        <TagAssignPanel
          siteId="site"
          tags={[tag("priority", "Priority"), tag("saved", "Saved")]}
          target={{ keywordIds: ["k1"], label: "“shred”" }}
          onDone={jest.fn()}
          write={write}
        />,
      );
    });
    const remove = buttonNamed(host, "Remove");
    expect(remove.disabled).toBe(true);
    act(() => buttonNamed(host, "Saved").click());
    expect(buttonNamed(host, "Remove").disabled).toBe(false);
    await act(async () => buttonNamed(host, "Remove").click());
    expect(write).toHaveBeenCalledWith({
      siteId: "site",
      keywordIds: ["k1"],
      tags: [{ value: "saved", label: "Saved", isNew: false }],
      remove: true,
    });
  });
});
