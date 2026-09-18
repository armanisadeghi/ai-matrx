// 🚨 N1 (VERIFY-U-P1-R5) — `onReconnect: null` MEANS "OFFER NOTHING" (Bugbot
// round 18 on frontend PR 228, review comment 4041985944).
//
// A health producer decides whether a reconnect would repair the refusal it
// found: for a share the owner must grant, a record we own, or an unclassified
// failure it answers `onReconnect: null` — offer nothing, because a Reconnect
// button there is a control that does nothing (law 4). `useDetailHealth` filled
// the host's action back in with `??`, which reads `null` as "unset", so the
// synced record showed Reconnect anyway.
//
// The one live producer chooses `null` deliberately
// (`features/item-presentation/sourceHealth.ts`), so this was not theoretical:
// pressing that Reconnect opened the Google consent window, which cannot repair
// a quota, an outage or a platform-configuration fault.
//
// The contract is three-valued and the hook honours each value:
//   a function → that action · `null` → NO Reconnect · omitted → the host's.
//
// The fix was made in `@ai-matrx/detail` first and never reached the frontend,
// because the adoption commit was reverted (R21) while the publish is pending.
// This is the frontend's own witness for it; `lib/detail/__tests__/
// the-in-repo-copy-matches-the-package.test.ts` is what keeps the two even.

import * as React from "react";
import { act } from "react";

import { DetailBody } from "../core/DetailBody";
import { useDetailCore } from "../core/useDetailCore";
import { reconnectFor } from "../useDetailHealth";
import type { DetailHostPorts } from "../host";
import type { DetailRecordType, DetailSourceHealth } from "../types";
import { FILE_TYPE, instance, makePorts, mount } from "./harness";

const ROW = { file_name: "Q3 plan.gdoc", provider: "google" };

/** A share the OWNER must grant: a reconnect cannot repair it. */
const SHARE_REQUIRED: DetailSourceHealth = {
  source: "Google Drive",
  grant: "missing",
  grantDetail:
    "This document is not shared with the account we refresh through. Ask its owner to share it.",
  lastRefreshedAt: null,
  onReconnect: null,
};

function synced(health: DetailSourceHealth): DetailRecordType {
  return {
    ...FILE_TYPE,
    load: async () => ({ row: ROW }),
    health: () => health,
  };
}

function Body() {
  const core = useDetailCore(instance(), "window", { onClose: () => {} });
  return <DetailBody core={core} />;
}

async function mountWith(
  recordType: DetailRecordType,
  reconnectSource: DetailHostPorts["reconnectSource"] | undefined,
) {
  // 🚨 N8 — a fresh `resolveType` answer per call is a fresh producer identity.
  // The map is resolved ONCE here on purpose: this suite is about the refusal,
  // and `the-health-effect-does-not-loop.test.tsx` owns the loop.
  const ports = makePorts({ resolveType: () => recordType });
  if (reconnectSource) ports.reconnectSource = reconnectSource;
  const m = mount(<Body />, ports);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return m;
}

function reconnectButton(container: HTMLElement): HTMLButtonElement | null {
  return (
    Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-detail-health] button"),
    ).find((b) => b.textContent?.trim() === "Reconnect") ?? null
  );
}

describe("the source health strip and the producer's refusal", () => {
  it("renders NO Reconnect for a refusal a reconnect cannot repair, even when the host could reconnect", async () => {
    const hostReconnect = jest.fn();
    const m = await mountWith(synced(SHARE_REQUIRED), hostReconnect);
    const strip = m.container.querySelector("[data-detail-health]");
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain("Ask its owner to share it");
    expect(reconnectButton(m.container)).toBeNull();
    m.unmount();
  });

  it("defers to the host's Reconnect only when the producer says nothing about it", async () => {
    const hostReconnect = jest.fn();
    const { onReconnect: _omitted, ...saysNothing } = SHARE_REQUIRED;
    const m = await mountWith(synced({ ...saysNothing, grant: "expired" }), hostReconnect);
    const button = reconnectButton(m.container);
    expect(button).not.toBeNull();
    act(() => button?.click());
    expect(hostReconnect).toHaveBeenCalledWith(
      { type: "file", id: instance().id },
      "Google Drive",
    );
    m.unmount();
  });

  it("offers the producer's OWN action when it supplies one", async () => {
    const own = jest.fn();
    const hostReconnect = jest.fn();
    const m = await mountWith(
      synced({ ...SHARE_REQUIRED, grant: "revoked", onReconnect: own }),
      hostReconnect,
    );
    const button = reconnectButton(m.container);
    expect(button).not.toBeNull();
    act(() => button?.click());
    expect(own).toHaveBeenCalledTimes(1);
    expect(hostReconnect).not.toHaveBeenCalled();
    m.unmount();
  });

  it("resolves the three values as the contract says (the pure rule)", () => {
    const host = jest.fn();
    const own = () => {};
    expect(reconnectFor({ ...SHARE_REQUIRED, onReconnect: null }, host)).toBeNull();
    expect(reconnectFor({ ...SHARE_REQUIRED, onReconnect: own }, host)).toBe(own);
    const { onReconnect: _omitted, ...saysNothing } = SHARE_REQUIRED;
    const deferred = reconnectFor(saysNothing, host);
    expect(deferred).not.toBeNull();
    deferred?.();
    expect(host).toHaveBeenCalledWith("Google Drive");
    expect(reconnectFor(saysNothing, null)).toBeNull();
  });
});
