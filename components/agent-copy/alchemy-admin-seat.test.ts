/**
 * ALCHEMY WORKS IN THE ADMIN SEAT'S ORGANIZATION (lane DRILL-EXPLAIN, 2026-09-30).
 *
 * The admin section never has a selected workspace — every server request from there runs in the
 * platform tenant (`lib/api/admin-lane.ts`), and the organization gate never asks the admin to
 * choose one. The Alchemy host read ONLY the selected workspace, so on every admin page the
 * preparation workspace offered no destinations at all: "Explain this" on /administration/usage
 * opened with no way to continue into a chat (walk, admin@admin.com).
 *
 * The data: an admin on /administration/usage with no workspace selected opens "Open an assistant
 * window" with a drill answer attached.
 *
 * Break it names: the host or the destination ports reading the selected workspace alone → red.
 */
jest.mock("@/lib/redux/slices/userSlice", () => ({ selectUserId: (state: { userId?: string }) => state.userId }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: (state: { organizationId?: string | null }) => state.organizationId ?? null }));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({ openOverlay: (payload: unknown) => ({ type: "overlay/open", payload }) }));
jest.mock("@/features/tasks/redux/taskUiSlice", () => ({ setPendingSource: (payload: unknown) => ({ type: "task/pending", payload }) }));
jest.mock("@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice", () => ({ clearFocus: (payload: unknown) => ({ type: "focus/clear", payload }) }));
jest.mock("@/features/agents/redux/chat/chat-route.slice", () => ({ bumpFreshSession: () => ({ type: "chat/bump" }) }));
jest.mock("@/features/agents/components/chat/begin-fresh-chat", () => ({ chatRouteSurfaceKey: (id: string) => `surface:${id}` }));
jest.mock("@/features/agents/components/chat/chat-quick-actions.config", () => ({ DEFAULT_NEW_CHAT_MANDATE_KEY: "default-mandate" }));
jest.mock("@/features/mandates/service", () => ({ resolveMandate: jest.fn(async () => ({ agentId: "agent-42" })) }));
jest.mock("@/features/data-tables/export-targets", () => ({ pushMarkdownToDocument: jest.fn(), pushTableToWorkbook: jest.fn() }));

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { createAlchemyDestinationPorts } from "./alchemy-destinations";

const content = {
  label: "AI usage — Cost by Provider, for Person admin@admin.com, last 30 days",
  markdown: '```json\n{"screen":"AI usage"}\n```',
  plainText: '{"screen":"AI usage"}',
  signal: new AbortController().signal,
  draft: { sourceId: "drill-explain:1" },
} as never;

const at = (path: string) => window.history.pushState({}, "", path);

describe("Alchemy on the admin seat", () => {
  afterEach(() => at("/"));

  it("opens an assistant window from an admin page with no workspace selected", async () => {
    at("/administration/usage");
    const dispatch = jest.fn();
    const ports = createAlchemyDestinationPorts({ getCurrentState: () => ({ userId: "user-1", organizationId: null }) as never, dispatch, navigate: jest.fn() });
    await ports.assistant(content);
    const opened = dispatch.mock.calls.map(([a]) => a).find((a: { type: string }) => a.type === "overlay/open");
    expect(opened?.payload).toEqual(expect.objectContaining({ overlayId: "agentRunWindow", data: expect.objectContaining({ initialAutoRun: false }) }));
  });

  it("still refuses on a user page with no workspace selected (the gate asks there)", async () => {
    at("/notes");
    const ports = createAlchemyDestinationPorts({ getCurrentState: () => ({ userId: "user-1", organizationId: null }) as never, dispatch: jest.fn(), navigate: jest.fn() });
    await expect(ports.assistant(content)).rejects.toThrow(/select an organization/i);
  });

  it("the host's organization is the platform tenant in admin and the workspace elsewhere", async () => {
    const { alchemyOrganizationId } = await import("./alchemy-organization");
    at("/administration/usage");
    expect(alchemyOrganizationId({ organizationId: null } as never)).toBe(SYSTEM_ORGANIZATION_ID);
    at("/notes");
    expect(alchemyOrganizationId({ organizationId: "org-1" } as never)).toBe("org-1");
    expect(alchemyOrganizationId({ organizationId: null } as never)).toBeNull();
  });
});
