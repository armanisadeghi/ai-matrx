/**
 * EntityRef is where ~65 agent links in this app are drawn. Until 2026-09-08
 * every one of them asked the entity registry, which answered `/agents/${id}`
 * for a builtin agent too — a link into a shell that agent does not live in.
 *
 * RED before `useEntityHref` existed: a builtin agent rendered
 * `href="/agents/<id>"`. GREEN now: the administration href, and an id that
 * cannot be placed renders NO link and says why.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EntityRef } from "../EntityRef";
import {
  __resetAgentAddressCache,
  seedAgentAddress,
} from "@/features/agents/addressing/agentAddressCache";

jest.mock("@/utils/supabase/client", () => ({
  __esModule: true,
  createClient: () => ({
    rpc: async () => ({ data: [], error: null }),
  }),
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

jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
  __esModule: true,
  ResourcePeekHost: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const BUILTIN = "8f0bbfc2-85d9-4913-8cea-b09a50c62be6";
const USER_AGENT = "ac714b9b-9fb8-4c08-af62-190c0c4d86ff";
const MISSING = "11111111-2222-3333-4444-555555555555";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  __resetAgentAddressCache();
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

describe("EntityRef sends each agent to the shell its kind lives in", () => {
  it("a builtin agent opens in the System Agents admin shell", () => {
    seedAgentAddress({
      agentId: BUILTIN,
      agentType: "builtin",
      agentName: "Research → Slides Generator",
    });
    renderRef(
      <EntityRef
        token="agent"
        id={BUILTIN}
        name="Research → Slides Generator"
      />,
    );
    const open = container.querySelector(
      'a[title="Open Research → Slides Generator"]',
    );
    expect(open?.getAttribute("href")).toBe(
      `/administration/agents/system-agents/agents/${BUILTIN}`,
    );
  });

  it("a user agent still opens in the core shell", () => {
    seedAgentAddress({ agentId: USER_AGENT, agentType: "user" });
    renderRef(
      <EntityRef token="agent" id={USER_AGENT} name="Info Extractor" />,
    );
    const open = container.querySelector('a[title="Open Info Extractor"]');
    expect(open?.getAttribute("href")).toBe(`/agents/${USER_AGENT}`);
  });

  it("an unresolved id still gets a working door, never a dead one", () => {
    renderRef(<EntityRef token="agent" id={MISSING} name="Ghost" />);
    // `/agents/go/<id>` resolves the shell SERVER-side, so the link works on
    // the first paint and survives a resolver that never answers.
    expect(
      container.querySelector('a[title="Open Ghost"]')?.getAttribute("href"),
    ).toBe(`/agents/go/${MISSING}`);
  });

  it("an id that resolves to NOTHING refuses in a sentence — never a link", async () => {
    // Nothing seeded and the mocked RPC answers with no rows: a real miss.
    renderRef(<EntityRef token="agent" id={MISSING} name="Ghost" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(container.querySelector('a[title="Open Ghost"]')).toBeNull();
    const label = container.querySelector('[data-agent-link-refused="true"]');
    expect(label).not.toBeNull();
    expect(label?.getAttribute("title")).toContain(MISSING);
    expect(label?.getAttribute("title")).toContain("No agent found");
  });

  it("an explicit href override still wins (admin surfaces pass their own)", () => {
    renderRef(
      <EntityRef
        token="agent"
        id={BUILTIN}
        name="Slides"
        href="/somewhere/else"
      />,
    );
    expect(
      container.querySelector('a[title="Open Slides"]')?.getAttribute("href"),
    ).toBe("/somewhere/else");
  });
});
