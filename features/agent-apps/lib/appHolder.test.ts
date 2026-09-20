/**
 * THE DARK-SHIP RATCHET for the app → mandate cutover.
 *
 * Two things this file exists to stop:
 *   1. The switch flipping by accident. `APP_MANDATE_CUTOVER` is a one-line
 *      release that changes which agent 96 live apps run; it moves when Arman
 *      nods, and a failing test is how a stray edit announces itself.
 *   2. The OFF branch drifting. While the switch is OFF the router must be a
 *      pure pass-through of the row's own columns — no invented defaults, no
 *      mandate fields leaking into the answer, nothing async. If that stops
 *      being true, "ships dark" stops being true with it.
 *
 * The ON branch is proven by flipping the constant locally and re-running the
 * agent-apps suites — it is literal-narrowed, so no runtime test can reach it
 * while it is false, and pretending otherwise would be a test that cannot fail.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dbAuthoredMandateKey } from "@/features/mandates/mandate-key";

import {
  APP_MANDATE_CUTOVER,
  holderIdentityFromResolved,
  pinnedHolder,
} from "./appHolder";

describe("APP_MANDATE_CUTOVER", () => {
  it("is ON — flipped 2026-08-30 on Arman's order; apps resolve through their mandate", () => {
    expect(APP_MANDATE_CUTOVER).toBe(true);
  });
});

describe("pinnedHolder — the OFF answer", () => {
  it("returns the row's own agent verbatim, synchronously", () => {
    expect(
      pinnedHolder({
        agent_id: "agent-1",
        agent_version_id: "ver-1",
        use_latest: false,
      }),
    ).toEqual({
      agentId: "agent-1",
      agentVersionId: "ver-1",
      useLatest: false,
      configOverrides: null,
      mandateId: null,
      mandateKey: null,
      provenance: null,
      loading: false,
      error: null,
    });
  });

  it("never leaks the mandate columns into the pinned answer", () => {
    const holder = pinnedHolder({
      agent_id: "agent-1",
      use_latest: true,
      mandate_id: "mandate-1",
      mandate_key: "app.thing",
      mandate_agent_id: "some-other-agent",
    });
    expect(holder.agentId).toBe("agent-1");
    expect(holder.mandateId).toBeNull();
    expect(holder.mandateKey).toBeNull();
    expect(holder.provenance).toBeNull();
  });

  it("treats a missing version as floating, not as a pinned null", () => {
    const holder = pinnedHolder({ agent_id: "agent-1", use_latest: true });
    expect(holder.agentVersionId).toBeNull();
    expect(holder.useLatest).toBe(true);
  });
});

describe("holderIdentityFromResolved — a pin is a pin", () => {
  const base = {
    agentId: "definition-id",
    configOverrides: null,
    mandateId: "mandate-1",
    // 🚨 A MANDATE KEY IS A TYPE, NOT A STRING (features/mandates/mandate-key.ts).
    // A bare literal in an object literal widens to `string`, which is not
    // assignable to `AnyMandateKey`, so `type-check` refused both cases below.
    // `app.*` is a DB-authored key the generated union cannot carry, and
    // `dbAuthoredMandateKey` is the ONE typed door for exactly that — it keeps
    // the literal visible to `pnpm check:mandate-keys` instead of widening the
    // carrier back to `string`, which that file names as the thing never to do.
    mandateKey: dbAuthoredMandateKey("app.thing"),
    provenance: "system" as const,
  };

  it("threads a pinned winner instead of inventing latest", () => {
    expect(
      holderIdentityFromResolved({
        ...base,
        isVersion: true,
        versionId: "version-id",
      }),
    ).toEqual({
      agentId: "definition-id",
      agentVersionId: "version-id",
      useLatest: false,
      configOverrides: null,
      mandateId: "mandate-1",
      mandateKey: "app.thing",
      provenance: "system",
    });
  });

  it("keeps a floating winner floating", () => {
    const holder = holderIdentityFromResolved({
      ...base,
      isVersion: false,
      versionId: null,
    });
    expect(holder.agentVersionId).toBeNull();
    expect(holder.useLatest).toBe(true);
  });
});

describe("the leftover class — no silent pin drop after resolve", () => {
  const root = join(__dirname, "..");

  it("does not claim a resolved mandate is floating by construction", () => {
    const holder = readFileSync(join(__dirname, "appHolder.ts"), "utf8");
    expect(holder).not.toContain("FLOATING by construction");
    expect(holder).not.toContain("resolveMandate refuses a pinned");
    expect(holder).toContain("holderIdentityFromResolved(resolved)");
  });

  it("launches apps through the mandate door, not the definition id", () => {
    const hook = readFileSync(join(root, "hooks/useAgentApp.ts"), "utf8");
    const renderer = readFileSync(
      join(root, "components/AgentAppPublicRendererImpl.tsx"),
      "utf8",
    );
    expect(hook).toContain("mandateKey: holder.mandateKey");
    expect(renderer).toContain("mandateKey: runMandateKey");
    expect(renderer).toContain("do not pass pinnedVersionId here");
  });

  it("every shell hands the row to useAgentApp so the holder can resolve", () => {
    const shells = [
      "AgentAppChatShell.tsx",
      "AgentAppFormToResultShell.tsx",
      "AgentAppFullyCustomShell.tsx",
      "AgentAppWidgetShell.tsx",
    ];
    for (const file of shells) {
      const source = readFileSync(
        join(root, "components/shells", file),
        "utf8",
      );
      expect(source).toContain("useAgentApp({");
      expect(source).toContain("app,");
    }
  });

  it("the custom shell warms the holder, not the row pin", () => {
    const source = readFileSync(
      join(root, "components/shells/AgentAppFullyCustomShell.tsx"),
      "utf8",
    );
    expect(source).toContain("ctx.agentVersionId");
    expect(source).not.toContain("app.agent_version_id");
    expect(source).not.toContain("app.use_latest");
  });
});
