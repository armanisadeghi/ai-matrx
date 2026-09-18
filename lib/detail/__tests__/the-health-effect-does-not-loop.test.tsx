// 🚨 N8 (VERIFY-U-P1-R5) — AN UNCACHED `resolveType` MUST NOT LOOP FOREVER.
//
// `useDetailHealth` keyed its effect on `recordType.health` — the producer's
// FUNCTION IDENTITY — and `useDetailRecord` keyed its effect on `recordType.load`
// the same way. `resolveType` is a host PORT and nothing in the contract said its
// answer must be cached: a host whose map builds the registration per call hands
// fresh closures every render, and each effect's own `setState` causes the next
// render. A verifier hit it by registering a type inline, and react-dom said
// "Maximum update depth exceeded … at publish (lib/detail/useDetailHealth.ts:72)"
// for minutes until the run was killed — plus an endless reload of the same
// record at the server, which nothing announced at all.
//
// It does not bite THIS host today (`resolveItemDetailType` caches per type in a
// Map), which is exactly why nothing caught it: the contract, not the current
// binding, is what a package publishes.
//
// Red: against the old deps this suite does not terminate — it was killed at 180s
// in the package and times out here. Green: it settles in milliseconds and the
// producer is asked once.

import * as React from "react";
import { act } from "react";

import { DetailBody } from "../core/DetailBody";
import { useDetailCore } from "../core/useDetailCore";
import type { DetailSourceHealth } from "../types";
import { FILE_TYPE, instance, makePorts, mount } from "./harness";

const HEALTH: DetailSourceHealth = {
  source: "Google Drive",
  grant: "ok",
  grantDetail: null,
  lastRefreshedAt: "2026-09-17T10:00:00Z",
};

function Body() {
  const core = useDetailCore(instance(), "window", { onClose: () => {} });
  return <DetailBody core={core} />;
}

describe("a host whose resolveType is not cached", () => {
  it("settles instead of looping, and asks the producer once", async () => {
    const health = jest.fn(() => HEALTH);
    const load = jest.fn(async () => ({ row: { file_name: "Q3 plan.gdoc" } }));
    // A FRESH registration object — and therefore fresh `load` / `health`
    // closures — on EVERY call, which is what an uncached host map does.
    const resolveType = () => ({ ...FILE_TYPE, load: () => load(), health: () => health() });
    const m = mount(<Body />, makePorts({ resolveType }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(m.container.querySelector("[data-detail-health]")).not.toBeNull();
    expect(health.mock.calls.length).toBeLessThanOrEqual(2);
    expect(load.mock.calls.length).toBeLessThanOrEqual(2);
    m.unmount();
  });
});
