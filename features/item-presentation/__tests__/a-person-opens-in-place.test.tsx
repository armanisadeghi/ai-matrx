/**
 * 🚨 F-40 — A PERSON OPENS IN PLACE.
 *
 * THE DEFECT (found by lane F-36, Bugbot round 20 on PR 228). The approvals
 * queue's contact-import card names the matched Person and every ambiguous
 * candidate through `EntityRef token="party"`. A Person had NO in-place
 * presentation at all: no peek was registered for `party`, and the only party
 * window creates a NEW record. So the one door the card could honestly offer
 * was a new tab — a person reviewing a proposal had to leave the queue to find
 * out who the proposal is about.
 *
 * RED before this change:
 *   - `getItemConfig("party").recognized` was `false`, so the Detail primitive
 *     resolved the neutral fallback: `load === null`, label "Party", and every
 *     presentation showed the honest "nothing more is stored here" state for a
 *     record that is fully stored in `crm.party`.
 *   - `hasPeek("party")` was `false`, so `EntityRef` offered no Quick look.
 *
 * GREEN: ONE registration in the item-presentation registry (THE type map) —
 * the same entry the Detail primitive reads for window, docked and page — plus
 * the generic registry peek for the token. No bespoke Person panel anywhere.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  DetailDockedPresentation,
  DetailPagePresentation,
  DetailWindowPresentation,
} from "@/lib/detail/presentations";
import { DetailHostProvider, type DetailHostPorts } from "@/lib/detail/host";
import type {
  DetailDockedShellProps,
  DetailPageShellProps,
  DetailWindowShellProps,
} from "@/lib/detail/host";
import { hasPeek } from "@/features/organizations/peek/kinds-list";
import { PEEK_REGISTRY } from "@/features/organizations/peek/registry";

import { getItemConfig } from "../registry";
import { resolveItemDetailType } from "../detail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `useIsMobile` reads `matchMedia`, which jsdom does not implement. Desktop,
// because these are the desktop shells.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const PARTY_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

// The registry's own loader against a stubbed client: the loader, the field
// formatting and the title resolution are the real ones.
jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    schema: self,
    from: self,
    select: self,
    eq: self,
    abortSignal: self,
    maybeSingle: async () => ({
      data: {
        id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        display_name: "Dana Whitfield",
        party_kind: "person",
        job_title: "Health Editor",
        primary_domain: "example-news.com",
        updated_at: "2026-09-17T10:00:00Z",
      },
      error: null,
    }),
  });
  return { supabase: chain };
});

describe("the Person registration (the door the queue needed)", () => {
  it("is a recognized item type reading crm.party", () => {
    const { config, recognized } = getItemConfig("party");
    expect(recognized).toBe(true);
    expect(config.detailSource).toMatchObject({
      table: "party",
      schemaName: "crm",
      titleField: "display_name",
    });
  });

  it("resolves through THE type map with a loader and the party entity token", () => {
    const recordType = resolveItemDetailType("party");
    expect(recordType).not.toBeNull();
    // RED: `load` was null (the fallback config), so the detail could show
    // nothing about a record that is fully stored.
    expect(recordType?.load).not.toBeNull();
    expect(recordType?.entityToken).toBe("party");
    // Not the neutral fallback label a misspelled type gets.
    expect(recordType?.label).toBe("Person");
  });

  it("titles the detail from the record's own name, never a stand-in", () => {
    const recordType = resolveItemDetailType("party");
    expect(
      recordType?.title({ display_name: "Dana Whitfield" }, null),
    ).toBe("Dana Whitfield");
  });

  it("offers the peek door EntityRef asks for, and the registry agrees", () => {
    // RED: `hasPeek("party")` was false, so every surface naming a Person —
    // the contact-import card included — had no in-place door at all.
    expect(hasPeek("party")).toBe(true);
    expect(PEEK_REGISTRY.party).toBeDefined();
  });
});

// ─── The record, composed, in all three presentations ────────────────────────

function ports(shells: DetailHostPorts["shells"]): DetailHostPorts {
  return {
    // THE REAL TYPE MAP.
    resolveType: resolveItemDetailType,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: () => `/detail/party/${PARTY_ID}`,
      toPage: jest.fn(),
      back: jest.fn(),
      canGoBack: () => false,
      toRecordHome: jest.fn(),
    },
    shells,
    doors: {
      RecordDoors: ({ id }: { id: string }) => <span data-doors={id} />,
      RefCell: ({ value }: { value: string }) => <span>{value}</span>,
      tokenFromColumnName: () => null,
      isUuidValue: (v: unknown): v is string => typeof v === "string",
      hasDoor: () => true,
    },
    associations: { defaultTokens: [], canAnchor: () => false },
    history: { list: async () => [] },
    notify: { error: jest.fn(), success: jest.fn() },
    copyText: async () => true,
  } as unknown as DetailHostPorts;
}

function StubWindowShell({ titleNode, actions, children }: DetailWindowShellProps) {
  return (
    <div data-shell="window">
      {titleNode}
      {actions}
      {children}
    </div>
  );
}
function StubDockedShell({ titleNode, actions, children }: DetailDockedShellProps) {
  return (
    <div data-shell="docked">
      {titleNode}
      {actions}
      {children}
    </div>
  );
}
function StubPageShell({ titleNode, actions, onBack, children }: DetailPageShellProps) {
  return (
    <div data-shell="page">
      <button type="button" aria-label="Back" onClick={onBack}>
        back
      </button>
      {titleNode}
      {actions}
      {children}
    </div>
  );
}

const DATA = { type: "party", id: PARTY_ID, seed: null, list: null };

const PRESENTATIONS = [
  {
    name: "window",
    shells: { Window: StubWindowShell },
    node: <DetailWindowPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "docked",
    shells: { Docked: StubDockedShell },
    node: <DetailDockedPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "page",
    shells: { Page: StubPageShell },
    node: <DetailPagePresentation data={DATA} />,
  },
] as const;

async function mountComposed(which: (typeof PRESENTATIONS)[number]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DetailHostProvider ports={ports(which.shells)}>{which.node}</DetailHostProvider>,
    );
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("an existing Person, composed, in all three presentations", () => {
  for (const which of PRESENTATIONS) {
    it(`shows the Person's own record in the ${which.name} presentation`, async () => {
      const m = await mountComposed(which);
      expect(m.container.querySelector(`[data-shell="${which.name}"]`)).not.toBeNull();
      const title = m.container.querySelector("[data-detail-title]") as HTMLElement;
      // The name from the loaded row — RED: "Untitled Party" from the seedless
      // fallback, because the type had no loader.
      expect(title.textContent).toBe("Dana Whitfield");
      expect(title.getAttribute("data-detail-title-standin")).toBeNull();
      expect(m.container.querySelector("[data-detail-id]")?.textContent).toBe(PARTY_ID);
      // Fields the generic formatter derived from the real row.
      const text = m.container.textContent ?? "";
      expect(text).toContain("Health Editor");
      expect(text).toContain("example-news.com");
      // A Person is not a mirror of a provider: no health strip.
      expect(m.container.querySelector("[data-detail-health]")).toBeNull();
      m.unmount();
    });
  }
});
