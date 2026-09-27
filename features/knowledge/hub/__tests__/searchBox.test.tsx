/**
 * Felt in the browser walk (2026-09-27): typing "grant " into the hub search
 * box emptied it — the box re-synced to the URL before the URL had caught up,
 * and the typed words were lost. The box must keep what the person typed while
 * the address catches up, and lift operators into chips.
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { HubSearchBox } from "@/features/knowledge/hub/components/HubSearchBox";
import type { KnowledgeQuery } from "@/features/knowledge/api/knowledgeSearch";

let root: Root;
let host: HTMLDivElement;
const seen: KnowledgeQuery[] = [];

/** A parent whose "URL" lags behind the box, like router.replace inside a transition. */
function Harness() {
  const [query, setQuery] = useState<KnowledgeQuery>({ mode: "find" });
  return (
    <HubSearchBox
      query={query}
      onQueryChange={(next) => {
        seen.push(next);
        setTimeout(() => setQuery(next), 500);
      }}
      onOpenFilters={() => undefined}
      titleFor={(r) => r.name ?? r.type}
      onEnterResults={() => undefined}
    />
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  seen.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("keeps typing that continues while an earlier commit is still landing in the URL", async () => {
  await act(async () => root.render(<Harness />));
  const input = host.querySelector("input") as HTMLInputElement;
  await act(async () => type(input, "grant "));
  await act(async () => {
    jest.advanceTimersByTime(300); // commit "grant" sent; URL lands at 800
  });
  await act(async () => {
    jest.advanceTimersByTime(400); // t=700: still typing
  });
  await act(async () => type(input, "grant budget"));
  await act(async () => {
    jest.advanceTimersByTime(150); // t=850: URL landed "grant", debounce not fired yet
  });
  expect(input.value).toBe("grant budget");
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(input.value).toBe("grant budget");
  expect(seen.at(-1)).toMatchObject({ text: "grant budget" });
});

it("keeps typed words while the URL catches up, then lifts an operator into a chip", async () => {
  await act(async () => root.render(<Harness />));
  const input = host.querySelector("input") as HTMLInputElement;
  await act(async () => type(input, "grant "));
  // Debounce fired, URL not caught up yet: the words stay.
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(seen.at(-1)).toMatchObject({ text: "grant" });
  expect(input.value.trim()).toBe("grant");
  // URL caught up: still the same words.
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(input.value.trim()).toBe("grant");

  await act(async () => type(input, "grant type:note "));
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(input.value.trim()).toBe("grant");
  expect(seen.at(-1)).toMatchObject({ text: "grant", types: ["note"] });
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(input.value.trim()).toBe("grant");
  expect(host.textContent).toContain("Note");
});
