// 🚨 NEW-23 (VERIFY-U-P1-R4) — A HISTORY ROW NEVER DROPS WHO MADE THE CHANGE.
//
// Reproduced at `01566c21`: `HistorySection` rendered the actor only when
// `host.doors.tokenFromColumnName("actor_id")` returned a token, and it returns
// `null` — no `actor` or `user` token has a door in this platform's entity
// registry. So every row read `v3 · update · 2 hours ago` and the person who did
// it was thrown away with no word at all, on every record, while `version_list`
// hands the id over. A stand-in that does not announce itself (law 4) and an
// identity the data names that the UI never shows (the no-dead-ends class).
//
// The rule: resolve the actor to a door through the existing token map when it
// can name one, show the raw value under an honest label when it cannot, and say
// so plainly when the row records nobody. Never nothing.

import * as React from "react";
import { act } from "react";

import { DetailBody } from "../core/DetailBody";
import { useDetailCore } from "../core/useDetailCore";
import type { DetailHistoryEntry, DetailRow } from "../types";
import { instance, makePorts, mount } from "./harness";

const ACTOR = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const ENTRIES: DetailHistoryEntry[] = [
  { version: 3, operation: "UPDATE", actorId: ACTOR, occurredAt: "2026-09-17T10:00:00Z", isCurrent: true },
  { version: 2, operation: "UPDATE", actorId: null, occurredAt: "2026-09-16T10:00:00Z", isCurrent: false },
];

function Body() {
  const core = useDetailCore(instance(), "window", { onClose: () => {} });
  return <DetailBody core={core} />;
}

async function mountWithHistory(
  tokenFromColumnName: (c: string) => string | null,
  ActorName?: React.ComponentType<{ actorId: string; row: DetailRow | null }>,
) {
  const ports = makePorts({
    history: { list: jest.fn(async () => ENTRIES), ...(ActorName ? { ActorName } : {}) },
  });
  ports.doors.tokenFromColumnName = tokenFromColumnName;
  const m = mount(<Body />, ports);
  // Let the history read settle.
  await act(async () => {
    await Promise.resolve();
  });
  return { m, ports };
}

describe("the history section", () => {
  // 🚨 NEW-23, ROUND 5 — "never nothing" was still a bare 36-character uuid on
  // every row of every record, because no host registry gives `actor_id` a door.
  // The host's ONE identity resolver is a port now (`history.ActorName`, bound in
  // `features/window-panels/detail/DetailHost.tsx` to `useRecordActors` +
  // `resolveUserName`), it answers FIRST, and the id is the last resort with a
  // title that says we could not find the person.
  it("names the PERSON when the host binds its identity resolver", async () => {
    const ActorName = ({ actorId }: { actorId: string; row: DetailRow | null }) => (
      <span>{actorId === ACTOR ? "Angie Sadeghi" : "someone else"}</span>
    );
    const { m } = await mountWithHistory((c) => (c === "actor_id" ? "user" : null), ActorName);
    const row = m.container.querySelector('[data-detail-section="history"]')!;
    expect(row.querySelector("[data-detail-history-actor-person]")).not.toBeNull();
    expect(row.textContent).toContain("Changed by");
    expect(row.textContent).toContain("Angie Sadeghi");
    // The uuid is GONE from the screen — that is the whole point.
    expect(row.textContent).not.toContain(ACTOR);
    m.unmount();
  });

  it("titles the raw id with why it is an id, when no resolver is bound", async () => {
    const { m } = await mountWithHistory(() => null);
    const raw = m.container.querySelector("[data-detail-history-actor-raw] [title]");
    expect(raw).not.toBeNull();
    expect(raw?.getAttribute("title")?.toLowerCase()).toContain("could not find the person");
    m.unmount();
  });

  it("shows the actor as a door when the token map can name the column", async () => {
    const { m } = await mountWithHistory((c) => (c === "actor_id" ? "user" : null));
    const row = m.container.querySelector('[data-detail-section="history"]')!;
    expect(row.textContent).toContain(ACTOR);
    expect(row.querySelector("[data-detail-history-actor]")).not.toBeNull();
    m.unmount();
  });

  it("still shows WHO when no token has a door — the raw value, honestly labelled", async () => {
    const { m } = await mountWithHistory(() => null);
    const row = m.container.querySelector('[data-detail-section="history"]')!;
    expect(row.textContent).toContain(ACTOR);
    expect(row.textContent?.toLowerCase()).toContain("changed by");
    m.unmount();
  });

  it("says so when the change records nobody, rather than leaving a gap", async () => {
    const { m } = await mountWithHistory(() => null);
    const rows = Array.from(
      m.container.querySelectorAll('[data-detail-section="history"] li'),
    ).map((li) => li.textContent ?? "");
    expect(rows).toHaveLength(2);
    expect(rows[1].toLowerCase()).toContain("no person recorded");
    m.unmount();
  });
});
