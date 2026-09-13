/**
 * @jest-environment jsdom
 *
 * The four things this notice must never get wrong, proven against the REAL
 * component. Only the boundaries it does not own are stubbed: Redux gating,
 * the network read, and the router.
 *
 *  1. Two open outages => two rows. Every provider that is down is named, and
 *     "no fallback" is SAID rather than left blank.
 *  2. Mute hides that outage AND persists it — and leaves the other one loud.
 *     A different outage is a different server id and is never muted with it.
 *  3. A non-super-admin renders nothing AND issues no request: a normal user
 *     must never call the admin endpoint once a minute on every page.
 *  4. A failed poll renders nothing. A fetch error is not an outage — it is
 *     already captured once by `lib/python-client`, and a loud bar on a
 *     60-second timer is the "complains constantly" defect in its purest form.
 *
 * Rendered with `createRoot` + `act`, the repo's component-test convention
 * (there is no @testing-library in this workspace).
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PlatformOutageBanner from "../PlatformOutageBanner";
import { clearMutes, readMutedIds } from "../outage-mute";
import type { OpenOutage } from "../open-outages";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => push(...args) }),
}));

const fetchOpenOutages = jest.fn();
jest.mock("../open-outages", () => {
  const actual = jest.requireActual("../open-outages");
  return { ...actual, fetchOpenOutages: () => fetchOpenOutages() };
});

let superAdmin = true;
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: { name?: string }) => {
    const name = selector?.name ?? "";
    if (name.includes("SuperAdmin")) return superAdmin;
    if (name.includes("AuthReady")) return true;
    if (name.includes("AccessToken")) return "token";
    return undefined;
  },
}));

function outage(
  over: Partial<OpenOutage> & { id: string; provider: string },
): OpenOutage {
  return {
    error_type: "overloaded_error",
    error_text: "provider refused",
    first_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    consecutive_failures: 214,
    models_affected: ["claude-opus-5"],
    rerouted_to: null,
    occurred_at: new Date().toISOString(),
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <PlatformOutageBanner />
      </QueryClientProvider>,
    );
  });
  // Let the query settle (resolve or reject) and re-render. React Query
  // resolves across several microtask turns; flush until the tree stops
  // changing rather than guessing a tick count.
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function rows(): Element[] {
  return [...container.querySelectorAll('[data-testid="platform-outage-row"]')];
}

function buttonByLabel(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`no button labelled "${label}"`);
  return found as HTMLButtonElement;
}

beforeEach(() => {
  // React 19 refuses to treat `act` as an act-environment without this flag,
  // and then warns on every update instead of flushing effects.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  superAdmin = true;
  push.mockClear();
  fetchOpenOutages.mockReset();
  window.localStorage.clear();
  clearMutes();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("PlatformOutageBanner", () => {
  it("names every provider that is down — two outages, two rows", async () => {
    fetchOpenOutages.mockResolvedValue([
      outage({ id: "o-anthropic", provider: "anthropic" }),
      outage({ id: "o-openai", provider: "openai", rerouted_to: ["anthropic"] }),
    ]);
    await mount();

    expect(rows()).toHaveLength(2);
    const text = container.textContent ?? "";
    expect(text).toContain("2 providers are down");
    expect(text).toContain("Anthropic is refusing every call");
    expect(text).toContain("214 failures, overloaded_error");
    expect(text).toContain("there is no fallback");
    expect(text).toContain("rerouted to anthropic");
  });

  it("mute hides that outage, persists it, and leaves the other one loud", async () => {
    fetchOpenOutages.mockResolvedValue([
      outage({ id: "o-anthropic", provider: "anthropic" }),
      outage({ id: "o-openai", provider: "openai" }),
    ]);
    await mount();
    expect(rows()).toHaveLength(2);

    const mute = buttonByLabel("Mute the anthropic outage for 1 hour");
    await act(async () => {
      mute.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(rows()).toHaveLength(1);
    expect(container.textContent ?? "").not.toContain("Anthropic is refusing");
    // Persisted, and scoped to the one server outage id.
    const stored = readMutedIds();
    expect(stored.has("o-anthropic")).toBe(true);
    expect(stored.has("o-openai")).toBe(false);
  });

  it("renders nothing and asks the server nothing for a non-super-admin", async () => {
    superAdmin = false;
    fetchOpenOutages.mockResolvedValue([
      outage({ id: "o-a", provider: "anthropic" }),
    ]);
    await mount();

    expect(fetchOpenOutages).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the poll itself fails — an error is not an outage", async () => {
    fetchOpenOutages.mockRejectedValue(new Error("network down"));
    await mount();

    expect(fetchOpenOutages).toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });
});
