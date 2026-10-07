/**
 * The action list never states a guess as fact, and is instant once known.
 *
 * THE DEFECT (G11A review, 2026-10-07): the first "Change…" open said
 * "Linking is the only action available for this type." for Task — the loading
 * flag was a stored `false` for the one render between opening and the fetch
 * starting — and every later open showed skeletons for 4–8 s (the catalog is
 * ~2.4 MB and fetched on demand).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/features/directive-catalog/service", () => ({
  // The server never answers in these tests: anything shown is a guess or a cache.
  fetchDirectiveCatalog: jest.fn(() => new Promise(() => undefined)),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "https://server.example.test",
  useAppDispatch: () => () => undefined,
}));

// The popover renders inline, in the SAME commit as the click — so a frame the
// real browser paints (and jsdom's portal timing would hide) is in the DOM here.
jest.mock("@ai-matrx/design-system", () => {
  const actual = jest.requireActual("@ai-matrx/design-system");
  const R = jest.requireActual("react") as typeof React;
  const Ctx = R.createContext<{ open: boolean; set: (o: boolean) => void }>({
    open: false,
    set: () => undefined,
  });
  return {
    ...actual,
    Popover: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) =>
      R.createElement(Ctx.Provider, { value: { open, set: onOpenChange } }, children),
    PopoverTrigger: ({ children }: { children: React.ReactElement<{ onClick?: () => void }> }) => {
      const { open, set } = R.useContext(Ctx);
      return R.cloneElement(children, { onClick: () => set(!open) });
    },
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = R.useContext(Ctx);
      return open ? R.createElement("div", { "data-testid": "popover" }, children) : null;
    },
  };
});

import { ActionRow } from "@/features/matrx-envelope/components/reference-picker/ReferencePickerBody";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ONLY_LINKING = "Linking is the only action";

async function openChange(): Promise<{ seen: string[]; cleanup: () => void }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ActionRow token="task" directiveClass="reference" onChange={() => undefined} />);
  });
  // Every node that is ever added — a frame that flashed and vanished counts.
  const seen: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => seen.push(n.textContent ?? ""));
      if (r.type === "characterData") seen.push(r.target.textContent ?? "");
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const change = [...container.querySelectorAll("button")].find((b) => b.textContent === "Change…")!;
  await act(async () => {
    change.click();
  });
  seen.push(...observer.takeRecords().flatMap((r) => [...r.addedNodes].map((n) => n.textContent ?? "")));
  observer.disconnect();
  return {
    seen,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the action list while the catalog is unknown", () => {
  beforeEach(() => window.localStorage.clear());

  it("never says linking is the only action — not even for one frame", async () => {
    const { seen, cleanup } = await openChange();
    expect(seen.join(" ")).not.toContain(ONLY_LINKING);
    expect(document.body.textContent).not.toContain(ONLY_LINKING);
    cleanup();
  });

  it("shows the real actions at once from the last answer, without waiting on the server", async () => {
    window.localStorage.setItem(
      "matrx:directive-catalog-actions:v1:https://server.example.test",
      JSON.stringify({
        savedAt: Date.now(),
        nouns: { task: { create: true, update: true, delete: true } },
        aliases: {},
      }),
    );
    const { cleanup } = await openChange();
    const options = [...document.querySelectorAll('[role="radio"]')].map((o) => o.textContent);
    expect(options).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Link to it"),
        expect.stringContaining("Create one"),
        expect.stringContaining("Update it"),
        expect.stringContaining("Delete it"),
      ]),
    );
    cleanup();
  });
});
