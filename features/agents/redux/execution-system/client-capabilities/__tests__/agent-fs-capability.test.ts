/**
 * Pins the agent-fs client capability + the raw request-override escape hatch.
 *
 * Bug class prevented:
 *   - agent-fs must be a MANUAL, default-OFF toggle. If a refactor ever makes
 *     its provider return active without `builderAdvancedSettings.agentFs`, the
 *     capability silently arms fs/shell against a user's real Code Snippets —
 *     the exact "don't suddenly turn it on" hazard.
 *   - agent-fs is STATELESS: it must ride in `capabilities[]` with NO `state`
 *     entry (backend `payload_model=None`; matches the verified-good wire shape).
 *   - The override parser must reject anything that isn't a JSON object so the
 *     send thunks never merge garbage onto the request body.
 */

import type { RootState } from "@/lib/redux/store";
import { getRegisteredCapabilities } from "../registry";
import "../agent-fs.provider";
import { parseRequestOverrides } from "../../utils/request-overrides";

const CONV = "conv-1";

function stateWithSettings(
  settings: Record<string, unknown> | undefined,
): RootState {
  return {
    instanceUIState: {
      byConversationId: {
        [CONV]: { builderAdvancedSettings: settings },
      },
    },
  } as unknown as RootState;
}

function agentFsProvider() {
  const p = getRegisteredCapabilities().find((x) => x.name === "agent-fs");
  if (!p) throw new Error("agent-fs provider not registered");
  return p;
}

describe("agent-fs capability provider", () => {
  test("is registered and marked stateless", () => {
    expect(agentFsProvider().stateless).toBe(true);
  });

  test("inactive by default — no settings, undefined flag, and false all yield null", () => {
    const p = agentFsProvider();
    expect(p.selectPayload(stateWithSettings(undefined), CONV)).toBeNull();
    expect(p.selectPayload(stateWithSettings({}), CONV)).toBeNull();
    expect(
      p.selectPayload(stateWithSettings({ agentFs: false }), CONV),
    ).toBeNull();
  });

  test("active ONLY when the explicit toggle is true — returns an empty (stateless) sentinel", () => {
    const p = agentFsProvider();
    const payload = p.selectPayload(stateWithSettings({ agentFs: true }), CONV);
    expect(payload).toEqual({});
  });
});

describe("parseRequestOverrides — escape hatch parser", () => {
  test("empty / whitespace / null → no override, no error", () => {
    expect(parseRequestOverrides(undefined)).toEqual({
      overrides: null,
      error: null,
    });
    expect(parseRequestOverrides("")).toEqual({ overrides: null, error: null });
    expect(parseRequestOverrides("   ")).toEqual({
      overrides: null,
      error: null,
    });
  });

  test("valid JSON object → merge-able overrides", () => {
    const { overrides, error } = parseRequestOverrides(
      '{"debug": true, "client": {"capabilities": ["agent-fs"]}}',
    );
    expect(error).toBeNull();
    expect(overrides).toEqual({
      debug: true,
      client: { capabilities: ["agent-fs"] },
    });
  });

  test("invalid JSON → skipped with an error, never a partial merge", () => {
    const { overrides, error } = parseRequestOverrides("{ not json ");
    expect(overrides).toBeNull();
    expect(error).toBeTruthy();
  });

  test("valid JSON that is not an object (array / scalar) is rejected", () => {
    expect(parseRequestOverrides("[1,2,3]").overrides).toBeNull();
    expect(parseRequestOverrides("[1,2,3]").error).toBeTruthy();
    expect(parseRequestOverrides("42").overrides).toBeNull();
    expect(parseRequestOverrides('"hi"').overrides).toBeNull();
  });
});
