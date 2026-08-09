/**
 * THE DOOR LAW on /agents/slots: the resolved agent, the system default it
 * displaced, and (for members) the org that owns an override all render as
 * EntityRef doors — and the card header is button-semantics on a div so those
 * doors can legally nest inside it.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
    __esModule: true,
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
    __esModule: true,
    ResourcePeekHost: () => null,
}));
jest.mock("@/lib/toast", () => ({
    toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/redux/hooks", () => ({
    // The page's single useAppSelector call is selectUserId.
    useAppSelector: () => "u1",
    useAppDispatch: () => jest.fn(),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
    selectUserId: jest.fn(),
}));
jest.mock("@/features/agents/redux/agent-definition/thunks", () => ({
    fetchAgentsListFull: () => ({ type: "test/noop" }),
}));
jest.mock("@/features/organizations/hooks", () => ({
    useUserOrganizations: () => ({
        // member (not admin) → the "org overrides this step" narrative renders
        organizations: [{ id: "org-9", name: "Acme Health", role: "member" }],
        loading: false,
    }),
}));
jest.mock("../SlotOverridePanel", () => ({
    SlotOverridePanel: () => null,
}));
jest.mock("../../overrides", () => ({
    fetchSlotOverridesData: jest.fn(() =>
        Promise.resolve({
            slots: [
                {
                    id: "slot1",
                    slot_key: "research.analyze",
                    label: "Analyze findings",
                    description: null,
                    is_enabled: true,
                    default_agent_id: "sys1",
                    default_agent_version_id: null,
                    input_kind: null,
                    output_kind: null,
                    metadata: null,
                    deleted_at: null,
                    updated_at: null,
                },
            ],
            bindings: [
                {
                    id: "b1",
                    slot_id: "slot1",
                    principal_type: "org",
                    organization_id: "org-9",
                    subject_user_id: null,
                    agent_id: "orgAgent",
                    is_enabled: true,
                    config_overrides: null,
                    deleted_at: null,
                },
            ],
            agentsById: {
                sys1: { id: "sys1", name: "System Analyzer", isArchived: false, agentType: "builtin" },
                orgAgent: { id: "orgAgent", name: "Org Analyzer", isArchived: false, agentType: "user" },
            },
            versionAgentIds: {},
        }),
    ),
}));

import { SlotOverridesPage } from "../SlotOverridesPage";

jest.setTimeout(60000);

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root.render(<SlotOverridesPage />);
    });
    // Let the mocked fetch settle, then flush the resulting state updates.
    // (A single tick isn't reliably enough — the effect → fetch → setState
    // chain spans several micro/macrotasks.)
    for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        act(() => {});
    }
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe("SlotOverridesPage doors", () => {
    it("the resolved (org-override) agent and the system default are both doors", () => {
        const resolved = container.querySelector('a[title="Open Org Analyzer"]');
        expect(resolved?.getAttribute("href")).toBe("/agents/orgAgent");
        const fallback = container.querySelector('a[title="Open System Analyzer"]');
        expect(fallback?.getAttribute("href")).toBe("/agents/sys1");
    });

    it("expanding the card shows the org narrative with org + agent doors", () => {
        const header = container.querySelector<HTMLElement>('div[role="button"][aria-expanded]');
        expect(header).not.toBeNull();
        act(() => {
            header!.click();
        });
        const org = container.querySelector('a[title="Open Acme Health"]');
        expect(org?.getAttribute("href")).toBe("/organizations/org-9");
        expect(container.querySelectorAll('a[title="Open Org Analyzer"]').length).toBeGreaterThan(1);
    });

    it("no interactive door is nested inside a native <button>", () => {
        expect(container.querySelector("button a")).toBeNull();
    });
});
