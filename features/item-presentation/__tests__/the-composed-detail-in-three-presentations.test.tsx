/**
 * 🚨 VERIFY-U-P1-R4 (the tests section) — THE FIRST TEST IN THE TREE THAT MOUNTS
 * THE COMPOSED DETAIL.
 *
 * Every one of the primitive's fifteen suites stubbed `resolveType` and the
 * shells, so 104 green tests could not see that the honest absent state promised
 * controls that were not there (NEW-17) or that every history row dropped who
 * made the change (NEW-23). The round-4 verifier's throwaway probe was the first
 * thing ever to mount a presentation with the REAL type map and the REAL
 * `ItemDetailFrame`, and it crashed on `window.matchMedia is not a function`
 * until stubbed. This is that probe, kept.
 *
 * WHAT IS REAL HERE: `resolveItemDetailType` (THE one type map, including the
 * health producer it now attaches), `ItemDetailFrame` (the surface runtime and the
 * right-click menu every presentation wraps the body in), the core, the header,
 * the body and all three presentation components.
 *
 * WHAT IS NOT: the three SHELLS are stubs, because the real ones are the app's
 * chrome — the window manager, the resizable docked panel and the route header —
 * each with its own suite. They are the frame around this, not the detail.
 * And no pixels: jsdom computes no layout.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  DetailDockedPresentation,
  DetailHostProvider,
  DetailPagePresentation,
  DetailWindowPresentation,
  type DetailDockedShellProps,
  type DetailHostPorts,
  type DetailPageShellProps,
  type DetailWindowShellProps,
} from "@ai-matrx/detail/react";
import { resolveItemDetailType } from "../detail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The wall the verifier's probe hit: `useIsMobile` reads `matchMedia`, which
// jsdom does not implement. Desktop, because these are the desktop shells.
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

const NOTE_ID = "11111111-2222-3333-4444-555555555555";

// The registry's own loader, against a stubbed client: the loader, the field
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
        id: "11111111-2222-3333-4444-555555555555",
        label: "Kickoff notes",
        content: "What we agreed",
        updated_at: "2026-09-17T10:00:00Z",
      },
      error: null,
    }),
  });
  return { supabase: chain };
});

function ports(shells: DetailHostPorts["shells"]): DetailHostPorts {
  return {
    // 🚨 THE REAL TYPE MAP.
    resolveType: resolveItemDetailType,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: () => `/detail/note/${NOTE_ID}`,
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
    history: {
      list: async () => [
        {
          version: 2,
          operation: "UPDATE",
          actorId: "aaaaaaaa-1111-2222-3333-444444444444",
          occurredAt: "2026-09-17T10:00:00Z",
          isCurrent: true,
        },
      ],
    },
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

const DATA = { type: "note", id: NOTE_ID, seed: null, list: null };

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

describe("one real record, composed, in all three presentations", () => {
  for (const which of PRESENTATIONS) {
    it(`renders the ${which.name} presentation from the real type map`, async () => {
      const m = await mountComposed(which);
      expect(m.container.querySelector(`[data-shell="${which.name}"]`)).not.toBeNull();
      // The record's own name from the loaded row, not a stand-in.
      const title = m.container.querySelector("[data-detail-title]") as HTMLElement;
      expect(title.textContent).toBe("Kickoff notes");
      expect(title.getAttribute("data-detail-title-standin")).toBeNull();
      // The id is in the body meta line at every width.
      expect(m.container.querySelector("[data-detail-id]")?.textContent).toBe(NOTE_ID);
      m.unmount();
    });

    it(`shows the SAME content in the ${which.name} presentation`, async () => {
      const m = await mountComposed(which);
      const text = m.container.textContent ?? "";
      // Fields the generic formatter derived from the real row.
      expect(text).toContain("What we agreed");
      // The history section, WHO included (NEW-23).
      expect(text.toLowerCase()).toContain("changed by");
      expect(text).toContain("aaaaaaaa-1111-2222-3333-444444444444");
      // No health strip: a note is not a mirror of a provider.
      expect(m.container.querySelector("[data-detail-health]")).toBeNull();
      m.unmount();
    });

    it(`keeps the record's doors and the keyboard reachable in the ${which.name} header`, async () => {
      const m = await mountComposed(which);
      expect(m.container.querySelector("[data-detail-copy-id]")).not.toBeNull();
      // The header slots carry the keyboard model (NEW-22).
      expect(
        m.container.querySelectorAll("[data-detail-keyboard-slot]").length,
      ).toBeGreaterThanOrEqual(2);
      m.unmount();
    });
  }
});
