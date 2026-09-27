/**
 * @jest-environment jsdom
 */
// The `@` record search never passes a partial or failed search off as the
// whole answer: types it could not read are named above the options, and a
// search where every type failed says "Search failed", never "No … matches".

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const search = jest.fn();
jest.mock("../service", () => ({ mentionCandidates: jest.fn(async () => []) }));
jest.mock("@/features/scopes/service/associationCandidates", () => ({
  searchCandidatesAcrossTokens: (...args: unknown[]) => search(...args),
}));
jest.mock("@/features/scopes/host/associationsStore", () => ({
  getAssociationsStore: () => ({ registry: { listableTokens: () => ["task", "note"] } }),
}));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({
  tryGetEntityInfo: (token: string) =>
    ({ task: { label: "Task", labelPlural: "Tasks" }, note: { label: "Note", labelPlural: "Notes" } })[token] ?? null,
}));

import { MentionComposer } from "../MentionComposer";
import type { AnnotationSource } from "../types";

const SOURCE = { kind: "note", id: "00000000-0000-4000-8000-000000000001" } as unknown as AnnotationSource;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  jest.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
  search.mockReset();
});

async function typeMention(text: string) {
  act(() => {
    root.render(<MentionComposer source={SOURCE} onSubmit={() => {}} mentions={false} />);
  });
  const area = host.querySelector("textarea") as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(area, text);
    area.setSelectionRange(text.length, text.length);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

it("names the record types it could not search above the matches it found", async () => {
  search.mockResolvedValue({
    results: [{ token: "task", id: "t1", title: "Quarterly report" }],
    failures: [{ token: "note", error: "notes down" }],
  });
  await typeMention("@report");
  const listbox = host.querySelector('[role="listbox"]');
  expect(listbox?.textContent).toContain("Quarterly report");
  expect(listbox?.textContent).toContain("Couldn't search Notes");
});

it("says the search failed when every record type failed", async () => {
  search.mockResolvedValue({
    results: [],
    failures: [
      { token: "task", error: "down" },
      { token: "note", error: "down" },
    ],
  });
  await typeMention("@report");
  const listbox = host.querySelector('[role="listbox"]');
  expect(listbox?.textContent).toContain("Search failed");
  expect(listbox?.textContent).not.toContain("No record or date matches");
});
