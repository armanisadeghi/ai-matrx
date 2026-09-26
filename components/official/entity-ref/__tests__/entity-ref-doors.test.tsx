/**
 * THE DOOR LAW — the tokens the /mandates and agent-shortcuts surfaces
 * name must actually resolve to doors through EntityRef:
 *
 *   agent          → registry route (/agents/{id}) + peek + new tab
 *   organization   → registry route (/organizations/{id}) — added in the same
 *                    change that put org doors on those surfaces
 *   agent_shortcut → no registry route (editor is agent-nested), so surfaces
 *                    pass `href`; the peek registry still serves the kind
 *
 * Browser verification can't cover these here (the surfaces need live
 * Supabase data), so the resolution logic is pinned by test instead.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EntityDoorControls } from "../EntityDoorControls";
import { EntityRef } from "../EntityRef";
import {
  __resetAgentAddressCache,
  seedAgentAddress,
} from "@/features/agents/addressing/agentAddressCache";

const AGENT_ID = "aaaaaaaa-1111-2222-3333-444444444444";

jest.mock("@/utils/supabase/client", () => ({
  __esModule: true,
  createClient: () => ({ rpc: async () => ({ data: [], error: null }) }),
  supabase: {},
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The peek host statically drags peek components in. Keep it shallow here, but
// retain its props so the test can prove a caller's destination reaches the
// dialog host when the Quick look button is pressed.
const mockResourcePeekHost = jest.fn((_props: unknown) => null);

jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
  __esModule: true,
  ResourcePeekHost: (props: unknown) => mockResourcePeekHost(props),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  __resetAgentAddressCache();
  mockResourcePeekHost.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderRef(el: React.ReactElement) {
  act(() => root.render(el));
}

describe("EntityRef doors for mandates/shortcuts surfaces", () => {
  it("agent: open link, new-tab link, and peek", () => {
    // 🚨 The href is NOT taken from the entity registry any more. An agent's
    // shell depends on its KIND (see features/agents/addressing), so an id
    // with no seeded address gets the always-valid `/agents/go/<id>`, which
    // resolves server-side. Seeding the kind is covered by
    // entity-ref-agent-address.test.tsx.
    seedAgentAddress({ agentId: AGENT_ID, agentType: "user" });
    renderRef(
      <EntityRef token="agent" id={AGENT_ID} name="Flashcard Generator" />,
    );
    const open = container.querySelector('a[title="Open Flashcard Generator"]');
    expect(open?.getAttribute("href")).toBe(`/agents/${AGENT_ID}`);
    expect(
      container.querySelector(
        'a[title="Open Flashcard Generator in a new tab"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'button[title="Quick look at Flashcard Generator"]',
      ),
    ).not.toBeNull();
  });

  it("opts compact link doors into a host touch-target scope", () => {
    renderRef(
      <EntityDoorControls
        token="organization"
        id="org-9"
        name="Acme Health"
        href="/organizations/org-9"
        disablePeek
        showOpen
      />,
    );

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.hasAttribute("data-tap-target")).toBe(true);
    }
  });

  it("organization: opens via the registry route added for the org door", () => {
    renderRef(<EntityRef token="organization" id="org-9" name="Acme Health" />);
    const open = container.querySelector('a[title="Open Acme Health"]');
    expect(open?.getAttribute("href")).toBe("/organizations/org-9");
  });

  it("agent_shortcut: href override wins and the peek is offered", () => {
    renderRef(
      <EntityRef
        token="agent_shortcut"
        id="s1"
        name="Summarize"
        href="/agents/a1/shortcuts/s1"
      />,
    );
    const open = container.querySelector('a[title="Open Summarize"]');
    expect(open?.getAttribute("href")).toBe("/agents/a1/shortcuts/s1");
    expect(
      container.querySelector('button[title="Quick look at Summarize"]'),
    ).not.toBeNull();
  });

  it("passes an overridden destination to the Quick look host", () => {
    const href = "/administration/agents/agent-apps/edit/app-9";
    renderRef(
      <EntityRef token="app" id="app-9" name="Onboarding" href={href} />,
    );

    const peek = container.querySelector(
      'button[title="Quick look at Onboarding"]',
    );
    expect(peek).not.toBeNull();
    act(() => peek?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(mockResourcePeekHost).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "app", id: "app-9", href }),
    );
  });

  it("marks hover-revealed controls for the shared visibility gate", () => {
    renderRef(
      <EntityRef token="organization" id="org-9" name="Acme Health" />,
    );

    const controls = container.querySelector("[data-entity-ref-controls]");
    expect(controls?.getAttribute("data-reveal-on-hover")).toBe("true");
    expect(controls?.className.split(/\s+/)).toContain("entity-ref-controls");

    // The actual pointer and visibility behavior is measured in Chromium at
    // desktop and coarse-pointer widths by entity-ref-controls.spec.ts.
    expect(container.querySelector('[title="Quick look at Acme Health"]')?.className)
      .not.toContain("pointer-events-auto");
  });

  it("a name with no route and no peek renders as plain text, never a dead link", () => {
    renderRef(<EntityRef token="seo_keyword" id="k1" name="best crm" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("best crm");
  });

  it("preserves rich label children when the identity has no reachable door", () => {
    renderRef(
      <EntityRef token="seo_keyword" id="k1" name="best crm">
        <span>best crm</span>
        <code>k1</code>
      </EntityRef>,
    );
    expect(container.querySelector("a, button")).toBeNull();
    expect(container.textContent).toContain("best crm");
    expect(container.textContent).toContain("k1");
  });
});
