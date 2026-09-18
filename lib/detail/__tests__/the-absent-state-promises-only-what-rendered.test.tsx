// 🚨 NEW-17 (VERIFY-U-P1-R4) — THE ABSENT STATE PROMISES ONLY THE CONTROLS THAT
// ACTUALLY RENDERED.
//
// Reproduced with the real type map on `/detail/session/<id>`: the body said
// "Nothing more about this session is stored here… The controls above still open
// it where it lives, and copy its id" while the controls above were `Back | Open
// as window | Open docked to the side | Copy record id | More record actions`.
// NOTHING there opens the session where it lives — `session` has no
// `entityToken`, so `RecordDoors` renders nothing by design, and the same
// sentence was shown for every unregistered type, which is the agent-emitted case
// the registry deliberately supports. Round 3's NEW-9 replaced a true-but-
// unusable screen with a false one.
//
// The rule: the sentence is DERIVED from the doors that exist for this record —
// the token resolves to a route or a peek — never a fixed string. The copy half
// is always true (the header's copy control is unconditional); the open half is
// claimed only when it is there.

import * as React from "react";

import { DetailBody } from "../core/DetailBody";
import { DetailActions, DetailTitle } from "../core/DetailHeader";
import { useDetailCore } from "../core/useDetailCore";
import type { DetailRecordType } from "../types";
import { FILE_TYPE, instance, makePorts, mount } from "./harness";

function Detail({ type }: { type: string }) {
  const core = useDetailCore(instance({ type }), "window", { onClose: () => {} });
  return (
    <div>
      <DetailTitle core={core} />
      <DetailActions core={core} />
      <DetailBody core={core} />
    </div>
  );
}

const sourceless = (type: string, entityToken: string | null): DetailRecordType => ({
  ...FILE_TYPE,
  type,
  entityToken,
  load: null,
});

function bodyText(container: HTMLElement): string {
  return container.textContent ?? "";
}

describe("a record that stores nothing more here", () => {
  it("does not claim a door when the type has no entity token (a session)", () => {
    const m = mount(
      <Detail type="session-a" />,
      makePorts({ resolveType: () => sourceless("session-a", null) }),
    );
    const said = bodyText(m.container);
    expect(said).toContain("copy its id");
    expect(said.toLowerCase()).not.toContain("open it where it lives");
    m.unmount();
  });

  it("does not claim a door when nothing is registered for the type at all", () => {
    const m = mount(<Detail type="sc_property" />, makePorts({ resolveType: () => null }));
    const said = bodyText(m.container);
    expect(said).toContain("copy its id");
    expect(said.toLowerCase()).not.toContain("open it where it lives");
    m.unmount();
  });

  it("does not claim a door when the token is registered but opens nothing", () => {
    const ports = makePorts({ resolveType: () => sourceless("ghost-b", "ghost") });
    ports.doors.hasDoor = () => false;
    const m = mount(<Detail type="ghost-b" />, ports);
    expect(bodyText(m.container).toLowerCase()).not.toContain("open it where it lives");
    m.unmount();
  });

  it("DOES claim it when the record really has a door", () => {
    const ports = makePorts({ resolveType: () => sourceless("file-c", "file") });
    ports.doors.hasDoor = () => true;
    const m = mount(<Detail type="file-c" />, ports);
    const said = bodyText(m.container);
    expect(said.toLowerCase()).toContain("open it where it lives");
    expect(said).toContain("copy its id");
    m.unmount();
  });
});
