/**
 * EVERY SHORTCUT RUNS BY ITS MANDATE KEY (aidream 1042; Arman, 2026-09-25:
 * "making a change in the mandates system guarantees it works").
 *
 * Before: `createInstanceFromShortcut` stamped the shortcut row's pinned
 * `agent_version_id` as `initialAgentVersionId`, and `resolveStartPath` lets a
 * pin outrank the mandate — so turn 1 POSTed `/ai/agents/{version}` and no
 * mandate default, rebind or user binding could ever reach a shortcut run.
 * After: the instance carries the mandate key and NO pin, so turn 1 goes
 * through `/ai/mandates/{key}` and the server resolves user → org → default.
 */

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({}) } }));
jest.mock("../execute-instance.thunk", () => ({ executeInstance: jest.fn() }));
jest.mock(
  "@/features/agents/redux/execution-system/instance-input-capabilities/input-capabilities-snapshot",
  () => ({ fetchInputCapabilitiesSnapshot: jest.fn(async () => ({})) }),
);
jest.mock("@/lib/supabase/shortcutStorage", () => ({
  ...jest.requireActual("@/lib/supabase/shortcutStorage"),
  fetchShortcutMandateKey: jest.fn(async () => "shortcut.looked_up_key"),
}));

import { createInstanceFromShortcut } from "../create-instance.thunk";
import { resolveStartPath } from "../../utils/resolve-start-path";
import { fetchShortcutMandateKey } from "@/lib/supabase/shortcutStorage";

const SHORTCUT_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const OLD_PINNED_VERSION = "33333333-3333-4333-8333-333333333333";

function shortcutRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SHORTCUT_ID,
    label: "Summarize",
    agentId: AGENT_ID,
    agentVersionId: OLD_PINNED_VERSION,
    useLatest: false,
    variableDefinitions: [],
    contextPolicies: [],
    scopeMappings: null,
    contextMappings: null,
    valueMappings: null,
    mandateKey: "shortcut.summarize_content",
    ...overrides,
  };
}

async function launch(record: Record<string, unknown>) {
  const actions: Array<{ type: string; payload?: Record<string, unknown> }> = [];
  const dispatch = jest.fn((action: unknown) => {
    if (typeof action === "function") return undefined;
    actions.push(action as { type: string; payload?: Record<string, unknown> });
    return action;
  });
  const state = {
    agentShortcut: { shortcuts: { [SHORTCUT_ID]: record } },
  };
  const result = await createInstanceFromShortcut({
    shortcutId: SHORTCUT_ID,
    uiScopes: {},
    sourceFeature: "notes",
  } as never)(dispatch as never, (() => state) as never, undefined);
  const created = actions.find(
    (a) => a.payload && a.payload.shortcutId === SHORTCUT_ID && "agentId" in a.payload,
  );
  return { result, created: created?.payload };
}

describe("a shortcut launch runs through its mandate", () => {
  it("stamps the mandate key and never a version pin, so turn 1 takes the mandate door", async () => {
    const { created } = await launch(shortcutRecord());
    expect(created).toBeDefined();
    expect(created!.mandateKey).toBe("shortcut.summarize_content");
    expect(created!.initialAgentVersionId ?? null).toBeNull();

    const door = resolveStartPath({
      agentId: created!.agentId as string,
      pinnedVersionId: (created!.initialAgentVersionId as string | null) ?? null,
      mandateKey: created!.mandateKey as string,
    });
    expect(door.door).toBe("mandate");
    expect(door.path).toContain("/ai/mandates/shortcut.summarize_content");
  });

  it("looks the key up when the record in hand did not carry it", async () => {
    const { created } = await launch(shortcutRecord({ mandateKey: null }));
    expect(fetchShortcutMandateKey).toHaveBeenCalledWith(expect.anything(), SHORTCUT_ID);
    expect(created!.mandateKey).toBe("shortcut.looked_up_key");
  });
});
