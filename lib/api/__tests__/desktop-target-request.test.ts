/**
 * desktop-target-request — the admin desktop-target preference may only
 * DIRECT a desktop the request already declares (presence-gated
 * `desktop-native` capability), never DECLARE one. Fabricating the
 * capability from the sticky preference is the bug class that instance-
 * targeted browser-executed delegated tools (war_room_*, ui-first) and made
 * their own /tool_results POSTs 404 the submission-binding check.
 */

import { applyDesktopTargetToRequestBody } from "@/lib/api/desktop-target-request";

describe("applyDesktopTargetToRequestBody", () => {
  it("does nothing when the body has no client envelope (quick-run shape)", () => {
    const body: Record<string, unknown> = { user_input: "hi", stream: true };
    applyDesktopTargetToRequestBody(body, "inst_abc");
    expect(body.target_instance_id).toBeUndefined();
    expect(body.client).toBeUndefined();
  });

  it("does nothing when desktop-native is not declared in client.state", () => {
    const body: Record<string, unknown> = {
      client: { capabilities: ["sandbox-fs"], state: { "sandbox-fs": {} } },
    };
    applyDesktopTargetToRequestBody(body, "inst_abc");
    expect(body.target_instance_id).toBeUndefined();
    const client = body.client as { capabilities: string[]; state: object };
    expect(client.capabilities).toEqual(["sandbox-fs"]);
    expect(client.state).toEqual({ "sandbox-fs": {} });
  });

  it("stamps target when a live desktop-native envelope exists", () => {
    const desktopState: Record<string, unknown> = {
      platform: "darwin",
      engine_version: "1.2.3",
      instance_id: "inst_live",
      tunnel_state: "active",
    };
    const body: Record<string, unknown> = {
      client: {
        capabilities: ["desktop-native"],
        state: { "desktop-native": desktopState },
      },
    };
    applyDesktopTargetToRequestBody(body, "inst_abc");
    expect(body.target_instance_id).toBe("inst_abc");
    expect(desktopState.target_instance_id).toBe("inst_abc");
    // Existing payload fields are preserved untouched.
    expect(desktopState.platform).toBe("darwin");
  });

  it("never overwrites an explicit target already on the body", () => {
    const desktopState: Record<string, unknown> = {
      target_instance_id: "inst_explicit",
    };
    const body: Record<string, unknown> = {
      target_instance_id: "inst_explicit",
      client: {
        capabilities: ["desktop-native"],
        state: { "desktop-native": desktopState },
      },
    };
    applyDesktopTargetToRequestBody(body, "inst_pref");
    expect(body.target_instance_id).toBe("inst_explicit");
    expect(desktopState.target_instance_id).toBe("inst_explicit");
  });

  it("ignores null/empty targets", () => {
    const body: Record<string, unknown> = {
      client: { capabilities: ["desktop-native"], state: { "desktop-native": {} } },
    };
    applyDesktopTargetToRequestBody(body, null);
    applyDesktopTargetToRequestBody(body, undefined);
    applyDesktopTargetToRequestBody(body, "");
    expect(body.target_instance_id).toBeUndefined();
  });
});
