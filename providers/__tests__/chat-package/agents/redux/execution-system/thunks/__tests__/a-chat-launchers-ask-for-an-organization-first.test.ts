/**
 * EVERY LAUNCHER THAT RESOLVES `chat.default_new_chat` ASKS FOR AN ORGANIZATION FIRST
 * (right-click Chat on /notes, 2026-10-03).
 *
 * Sibling of a-launch-with-no-organization-asks-first: a launcher that called the
 * bare `resolveMandate` with no organization selected threw
 * MandateOrganizationUnresolvedError and opened a window at "Pick an agent to
 * start". The one door is `resolveMandateAsking`: pick continues the launch,
 * cancel opens nothing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const askOrganization = jest.fn();
let active: string | null = null;
jest.mock("@ai-matrx/chat/host/org", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/org"),
  ensureOrganizationContext: (...a: unknown[]) => askOrganization(...a),
  getActiveOrgId: () => active,
}));
jest.mock("@ai-matrx/chat/host/server/admin-lane", () => ({ adminLaneOrganizationId: () => null }));
const resolveSpy = jest.fn(async (key: string, opts: { organizationId?: string | null }) => ({
  mandateKey: key,
  agentId: `agent-for-${opts.organizationId}`,
}));
jest.mock("@ai-matrx/chat/mandates/service", () => ({
  resolveMandate: (...a: [string, { organizationId?: string | null }]) => resolveSpy(...a),
}));

import { resolveMandateAsking } from "@ai-matrx/chat/mandates/resolve-asking";
import { CHAT_SRC_REL } from "../../../../../chat-source";

const KEY = "chat.default_new_chat" as never;

beforeEach(() => {
  askOrganization.mockReset();
  resolveSpy.mockClear();
  active = null;
});

describe("resolveMandateAsking", () => {
  it("no organization: asks, and the pick continues the resolution in that organization", async () => {
    askOrganization.mockResolvedValue("org-picked");
    const resolved = await resolveMandateAsking(KEY);
    expect(askOrganization).toHaveBeenCalledTimes(1);
    expect(resolved.agentId).toBe("agent-for-org-picked");
  });

  it("cancel rejects as cancelled and resolves nothing", async () => {
    const cancelled = Object.assign(new Error(""), { name: "OrganizationSelectionCancelled" });
    askOrganization.mockRejectedValue(cancelled);
    await expect(resolveMandateAsking(KEY)).rejects.toMatchObject({ name: "OrganizationSelectionCancelled" });
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("a selected organization never asks", async () => {
    active = "org-active";
    const resolved = await resolveMandateAsking(KEY);
    expect(askOrganization).not.toHaveBeenCalled();
    expect(resolved.agentId).toBe("agent-for-org-active");
  });
});

describe("census: no launcher resolves the default chat mandate without asking", () => {
  const root = process.cwd();
  const launchers = [
    "features/quick-actions/hooks/useQuickActions.ts",
    "features/window-panels/tools-grid/toolsGridTiles.ts",
    "features/files/components/surfaces/desktop/NewMenu.tsx",
    "components/agent-copy/alchemy-destinations.ts",
    `${CHAT_SRC_REL}/agents/components/chat/begin-fresh-chat.ts`,
  ];
  it.each(launchers)("%s resolves through resolveMandateAsking (the one organization door)", (file) => {
    const src = readFileSync(join(root, file), "utf8");
    expect(src).toMatch(/resolveMandateAsking/);
    expect(src).not.toMatch(/\bresolveMandate\(\s*DEFAULT_NEW_CHAT_MANDATE_KEY/);
  });
});
