/**
 * Pins the wire contract to what aidream ACTUALLY sends.
 *
 * Found live 2026-09-12 (Lane E two-browser proof): the production listener
 * published a `settings_changed` directive to `matrx-server-bus:platform` and
 * every browser dropped it with `not_an_envelope (toInstance)`. The Python
 * envelope (`aidream/services/cross_component/envelope.py`) declares
 * `toInstance: PartialInstanceRef | None = None` and `model_dump(mode="json")`
 * serialises that as `"toInstance": null` — the JSON literal the contract doc
 * shows — while the Zod mirror said `.optional()`, which accepts an ABSENT key
 * and rejects an explicit `null`. Every server-published envelope carries the
 * null, so every directive was dead on arrival.
 */

import { parseDirective } from "./directiveEnvelope";

/** Verbatim shape of what the wake listener broadcasts (see publisher.py). */
function serverEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    kind: "directive",
    direction: "server->any",
    action: "settings_changed",
    requestId: "directive-3f9c1a2b7d4e",
    payload: {
      registry: "feature_knob",
      feature: "meet",
      key: "guest_join_enabled",
      scope: null,
      organization_id: null,
    },
    timestamp: 1757577600000,
    fromInstance: { component: "server", instanceId: "aidream-1a2b3c4d" },
    toInstance: null,
    ...overrides,
  };
}

describe("parseDirective — the server's real envelope", () => {
  it("accepts `toInstance: null` (what aidream serialises for a broadcast)", () => {
    const result = parseDirective(serverEnvelope());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.directive.action).toBe("settings_changed");
      expect(result.directive.payload).toMatchObject({ feature: "meet", key: "guest_join_enabled" });
    }
  });

  it("still accepts an absent `toInstance`", () => {
    const raw = serverEnvelope();
    delete (raw as Record<string, unknown>).toInstance;
    expect(parseDirective(raw).ok).toBe(true);
  });

  it("names the gate when the envelope is malformed", () => {
    const result = parseDirective(serverEnvelope({ timestamp: "not-a-number" }));
    expect(result).toMatchObject({ ok: false, reason: "not_an_envelope" });
  });

  it("names the gate when the payload drifts from the kind's schema", () => {
    const result = parseDirective(serverEnvelope({ payload: { registry: "feature_knob" } }));
    expect(result).toMatchObject({ ok: false, reason: "bad_payload" });
  });
});
