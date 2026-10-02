/**
 * @jest-environment jsdom
 */
// lib/records/recordChanges.test.tsx — a list hears about a record the same page just made.
// RED before 2026-10-02: the CRM people list kept "No records here" after the create window
// made a person, until a reload. The service that creates announces; the list listens.

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { announceRecordChange, useRecordChanges, type RecordChange } from "./recordChanges";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountListener(token: string, onChange: (c: RecordChange) => void) {
  function Listener() {
    useRecordChanges(token, onChange);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Listener />));
  return { unmount: () => act(() => root.unmount()) };
}

describe("record changes reach the lists of their token", () => {
  it("calls the listener for its own token only", () => {
    const party = jest.fn();
    mountListener("party", party);
    act(() => {
      announceRecordChange({ token: "crm_deal", kind: "created", id: "d1" });
      announceRecordChange({ token: "party", kind: "created", id: "p1" });
    });
    expect(party).toHaveBeenCalledTimes(1);
    expect(party).toHaveBeenCalledWith({ token: "party", kind: "created", id: "p1" });
  });

  it("stops listening when the list unmounts", () => {
    const party = jest.fn();
    const { unmount } = mountListener("party", party);
    unmount();
    act(() => announceRecordChange({ token: "party", kind: "created" }));
    expect(party).not.toHaveBeenCalled();
  });
});

describe("the CRM lists and their writers are wired", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const read = (p: string) => readFileSync(`${__dirname}/../../${p}`, "utf8");
  it.each([
    ["party", "features/crm/hooks/usePartyList.ts", "features/crm/service.ts"],
    ["crm_deal", "features/crm/deals/useDealList.ts", "features/crm/deals/service.ts"],
  ])("%s: the list listens and the create announces", (token, list, service) => {
    expect(read(list)).toContain(`useRecordChanges("${token}", refresh)`);
    expect(read(service)).toMatch(new RegExp(`announceRecordChange\\(\\{ token: "${token}", kind: "created"`));
  });
});
