/**
 * THE DOOR LAW — the tokens the /agents/slots and agent-shortcuts surfaces
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
import { EntityRef } from "../EntityRef";

jest.mock("next/link", () => ({
    __esModule: true,
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

// The peek host statically drags peek components in; the door test only cares
// that EntityRef *offers* the peek control for registered kinds.
jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
    __esModule: true,
    ResourcePeekHost: () => null,
}));

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

describe("EntityRef doors for slots/shortcuts surfaces", () => {
    it("agent: open link from the registry route, new-tab link, and peek", () => {
        renderRef(<EntityRef token="agent" id="a1" name="Flashcard Generator" />);
        const open = container.querySelector('a[title="Open Flashcard Generator"]');
        expect(open?.getAttribute("href")).toBe("/agents/a1");
        expect(
            container.querySelector('a[title="Open Flashcard Generator in a new tab"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('button[title="Quick look at Flashcard Generator"]'),
        ).not.toBeNull();
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
        expect(container.querySelector('button[title="Quick look at Summarize"]')).not.toBeNull();
    });

    it("a name with no route and no peek renders as plain text, never a dead link", () => {
        renderRef(<EntityRef token="seo_keyword" id="k1" name="best crm" />);
        expect(container.querySelector("a")).toBeNull();
        expect(container.textContent).toContain("best crm");
    });
});
