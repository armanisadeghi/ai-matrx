/**
 * Peek open/close from the person's seat: on the hub page (sample data), a
 * click on a result opens its peek and writes it into the URL; Esc closes it
 * and removes it from the URL. ↵ on the keyboard-focused row opens it too.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let search = new URLSearchParams("data=sample");
const listeners = new Set<() => void>();
const navigate = (href: string) => {
  search = new URLSearchParams(href.split("?")[1] ?? "");
  listeners.forEach((l) => l());
};
jest.mock("next/navigation", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    useSearchParams: () => {
      const [, force] = React.useReducer((n: number) => n + 1, 0);
      React.useEffect(() => {
        listeners.add(force);
        return () => {
          listeners.delete(force);
        };
      }, []);
      return search;
    },
    useRouter: () => ({ push: navigate, replace: navigate, back: jest.fn() }),
  };
});
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
    <header>
      {left}
      {right}
    </header>
  ),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
jest.mock("@ai-matrx/associations/react", () => ({
  useEntityTitles: () => ({ titleFor: () => "Untitled", isUnresolved: () => false, loading: false }),
  useAssociations: () => ({ edges: [], status: "ready", error: null }),
  UniversalAssociationPicker: () => null,
}));
const ready = { status: "ready" as const, items: [], error: null, retry: jest.fn() };
jest.mock("@/features/knowledge/hub/hooks/useHubSidebarData", () => {
  const actual = jest.requireActual("@/features/knowledge/hub/hooks/useHubSidebarData");
  return {
    ...actual,
    useHubSidebarData: () => ({
      savedViews: ready,
      favorites: ready,
      containers: {
        project: ready,
        scope: ready,
        media_source_library: ready,
        research_topic: ready,
        data_store: ready,
      },
    }),
  };
});

import { TooltipProvider } from "@ai-matrx/design-system";
import { KnowledgeHubPage } from "@/features/knowledge/hub/components/KnowledgeHubPage";

// jsdom has no layout, so no scrollIntoView; every browser does.
Element.prototype.scrollIntoView = jest.fn();

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  search = new URLSearchParams("data=sample");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function mount() {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <KnowledgeHubPage cookieName="t" />
      </TooltipProvider>,
    );
  });
  await settle();
}

function row(title: string): HTMLElement {
  const el = [...host.querySelectorAll<HTMLElement>("[data-hit-key]")].find((e) =>
    e.textContent?.includes(title),
  );
  if (!el) throw new Error(`no row "${title}" in: ${host.textContent?.slice(0, 400)}`);
  return el;
}

it("click opens the peek (URL carries it); Esc closes it (URL drops it)", async () => {
  await mount();
  expect(host.textContent).toContain("Sample data");
  await act(async () => {
    row("NSF grant solicitation 2026").click();
  });
  await settle();
  expect(search.get("peek")).toMatch(/^processed_document:/);
  const peek = host.querySelector('aside[aria-label^="Peek"]');
  expect(peek?.textContent).toContain("NSF grant solicitation 2026");
  expect(peek?.textContent).toContain("Filed under");
  expect(peek?.textContent).toContain("Grant 2026");
  expect(peek?.textContent).toContain("Top segments");
  expect(peek?.textContent).toContain("data management plan");
  expect(peek?.textContent).toContain("File under Client Ava");

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  await settle();
  expect(search.get("peek")).toBeNull();
  expect(host.querySelector('aside[aria-label^="Peek"]')).toBeNull();
});

it("j then ↵ opens the focused row's peek from the keyboard", async () => {
  await mount();
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
  });
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  });
  await settle();
  expect(search.get("peek")).not.toBeNull();
  expect(host.querySelector('aside[aria-label^="Peek"]')).not.toBeNull();
});
