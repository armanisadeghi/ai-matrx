/**
 * THE DOOR LAW on the agent-shortcuts panel: the agent the panel is about, each
 * shortcut row's label, and an org-scoped shortcut's org all render as
 * EntityRef doors (open / new tab / peek), and the row is button-semantics on
 * a div so those doors can legally nest inside it.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgentShortcutsPanel } from "../AgentShortcutsPanel";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";

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
const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: pushMock }),
}));
jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
    __esModule: true,
    ResourcePeekHost: () => null,
}));
jest.mock("@/components/official/icons/IconResolver", () => ({
    __esModule: true,
    default: () => null,
}));

const shortcuts: AgentShortcutRecord[] = [
    {
        id: "s1",
        label: "Summarize selection",
        userId: "u1",
        organizationId: null,
        projectId: null,
        taskId: null,
        surfaceName: "web/notes",
        iconName: null,
        isActive: true,
        keyboardShortcut: null,
        categoryId: null,
    } as unknown as AgentShortcutRecord,
    {
        id: "s2",
        label: "Draft reply",
        userId: null,
        organizationId: "org-9",
        projectId: null,
        taskId: null,
        surfaceName: "web/chat",
        iconName: null,
        isActive: true,
        keyboardShortcut: null,
        categoryId: null,
    } as unknown as AgentShortcutRecord,
];

jest.mock("@/features/agent-shortcuts/hooks/useAgentShortcuts", () => ({
    useAgentShortcuts: () => ({ isLoading: false, error: null }),
}));
jest.mock("@/features/organizations/hooks", () => ({
    useUserOrganizations: () => ({
        organizations: [{ id: "org-9", name: "Acme Health", role: "member" }],
        loading: false,
    }),
}));
jest.mock("@/features/agents/redux/agent-shortcuts/selectors", () => ({
    selectShortcutsByAgentId: jest.fn(() => shortcuts),
}));
jest.mock("@/features/agents/redux/agent-shortcut-categories/selectors", () => ({
    selectCategoryById: jest.fn(() => null),
}));
jest.mock("@/lib/redux/hooks", () => ({
    useAppSelector: (sel: (s: unknown) => unknown) => sel({}),
    useAppDispatch: () => jest.fn(),
}));
jest.mock("@/features/surfaces/utils/surface-display", () => ({
    getSurfaceDisplayLabel: (name: string) => name,
}));

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

describe("AgentShortcutsPanel doors", () => {
    beforeEach(() => {
        act(() =>
            root.render(<AgentShortcutsPanel agentId="a1" agentName="Flashcard Generator" />),
        );
    });

    it("names the agent as a door in the header", () => {
        const open = container.querySelector('a[title="Open Flashcard Generator"]');
        expect(open?.getAttribute("href")).toBe("/agents/a1");
        expect(
            container.querySelector('button[title="Quick look at Flashcard Generator"]'),
        ).not.toBeNull();
    });

    it("each shortcut label opens its editor (basePath-aware) with new-tab + peek", () => {
        const open = container.querySelector('a[title="Open Summarize selection"]');
        expect(open?.getAttribute("href")).toBe("/agents/a1/shortcuts/s1");
        expect(
            container.querySelector('a[title="Open Summarize selection in a new tab"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('button[title="Quick look at Summarize selection"]'),
        ).not.toBeNull();
    });

    it("an org-scoped shortcut names AND opens the org", () => {
        const open = container.querySelector('a[title="Open Acme Health"]');
        expect(open?.getAttribute("href")).toBe("/organizations/org-9");
    });

    it("rows are div-with-button-semantics so doors can nest", () => {
        const rows = [...container.querySelectorAll('div[role="button"]')];
        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(container.querySelector("button a")).toBeNull();
    });

    it("Enter on a nested door does NOT also fire the row action", () => {
        pushMock.mockClear();
        const door = container.querySelector<HTMLElement>('a[title="Open Summarize selection"]');
        act(() => {
            door!.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
            );
        });
        expect(pushMock).not.toHaveBeenCalled();

        // The row itself still responds to Enter.
        const row = door!.closest<HTMLElement>('div[role="button"]');
        act(() => {
            row!.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
            );
        });
        expect(pushMock).toHaveBeenCalledWith("/agents/a1/shortcuts/s1");
    });
});
