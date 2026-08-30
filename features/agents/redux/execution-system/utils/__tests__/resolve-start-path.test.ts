/**
 * Pins THE DOOR CHOICE for turn 1.
 *
 * The defect this exists to prevent is the one it closed: matrx-frontend
 * resolved mandates a SECOND time in the browser and POSTed the agent IT
 * picked, so an org or user rebind made server-side never reached client chat.
 * If someone ever routes a mandate-driven conversation back to
 * `/ai/agents/{id}`, these fail.
 */

import { aiVersionPathOverrides } from "@/lib/api/ai-api-version";
import { resolveStartPath } from "../resolve-start-path";

const V2 = { pathOverrides: aiVersionPathOverrides("v2") };

describe("resolveStartPath — the mandate door", () => {
  test("a mandate-driven conversation POSTs /ai/mandates/{key}, never the agent route", () => {
    const start = resolveStartPath({
      agentId: "display-agent-uuid",
      mandateKey: "chat.default_new_chat",
    });
    expect(start.door).toBe("mandate");
    expect(start.path).toBe("/ai/mandates/chat.default_new_chat");
    // The display agent must not leak into the run target.
    expect(start.path).not.toContain("display-agent-uuid");
    expect(start.isVersion).toBe(false);
  });

  test("the door has a /v2 sibling and rides the same version override", () => {
    const start = resolveStartPath({
      agentId: "display-agent-uuid",
      mandateKey: "chat.default_new_chat",
      overrideConfig: V2,
    });
    expect(start.path).toBe("/v2/ai/mandates/chat.default_new_chat");
  });

  test("a mandate key is URL-encoded, not interpolated raw", () => {
    const start = resolveStartPath({
      agentId: "a",
      mandateKey: "weird key/with slash",
    });
    expect(start.path).toBe("/ai/mandates/weird%20key%2Fwith%20slash");
  });
});

describe("resolveStartPath — the agent door", () => {
  test("no mandate key → the plain saved-agent route", () => {
    const start = resolveStartPath({ agentId: "agent-uuid" });
    expect(start.door).toBe("agent");
    expect(start.path).toBe("/ai/agents/agent-uuid");
    expect(start.isVersion).toBe(false);
  });

  test("a version pin WINS over a mandate key — an explicit 'run THIS row'", () => {
    const start = resolveStartPath({
      agentId: "agent-uuid",
      pinnedVersionId: "version-uuid",
      mandateKey: "chat.default_new_chat",
    });
    expect(start.door).toBe("agent");
    expect(start.path).toBe("/ai/agents/version-uuid");
    expect(start.isVersion).toBe(true);
  });
});
