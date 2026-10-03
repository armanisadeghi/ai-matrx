/**
 * KINDS-GLUE wave 4 slice 4.1 guard — G-W4-1 / G-W4-6, the reader's half.
 *
 * - A `relation` routes to its one chip, and the chip is a LINK only after its token's own door
 *   said this viewer may open it; a target the viewer can't open is a muted chip carrying the
 *   door's sentence and no link. Every chip of one tick is checked in ONE call per door group.
 * - A `pick_list` names a Pick list, never another table (chair V2: an "Appointment Slots" offer is
 *   refused in a sentence), and draws that list's records as choices; a choice that is not a record of the
 *   named list (an Appointment Slots id offered on the "Visit type" list) refuses the offer in one
 *   plain sentence. Nothing can be pressed (choosing is slice 4.6).
 *
 * Server half: aidream/aidream/kinds/tests/test_record_primitives_guard.py (a relation is never
 * stored; ad-hoc keys are refused at the shape). Golden ids: the slice 4.0 fixtures.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import userAuthReducer from "@/lib/redux/slices/userAuthSlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { envelopeFromCompleteValue, IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import { applyIrKindRoute } from "../react/kind-route";
import { RELATION_KINDS, pickListChoiceRefusal } from "../kinds/record-primitives";
import {
  CANT_OPEN_RECORD,
  NO_DOOR,
  setOpenabilityDoorsForTests,
  type OpenabilityDoors,
} from "../record-primitives/openability";
import RelationBlock from "@/components/mardown-display/blocks/result-kinds/RelationBlock";
import PickListBlock from "@/components/mardown-display/blocks/result-kinds/PickListBlock";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));
jest.mock("@/features/unified-data/recordsReferences", () => ({
  recordsRenderReference: (ref: { token: string; id: string; label: string | null }) => (
    <a href={`/o/${ref.id}`}>{ref.label}</a>
  ),
}));

const CEDAR = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const VISIT_TYPE = "7f44c0da-3c66-4790-9afd-c4bf9e4657b1";
const FOLLOW_UP = "fa4f4987-928d-42f0-bc0d-be1306ced268";
const DISCHARGE = "321edc7f-3734-4720-ac5d-9a9ff411c569";
const SLOTS = "d4de9795-6634-4cf1-9e37-b5e5d9c5db2e";
const TUE_930 = "89943d24-e12e-47c0-b696-48b66cb6c93a";
const WED_200 = "ba4bbf34-0fca-4b7f-8962-38d4460d8664";
const OLD_INTAKE = "5c0f9a3e-7d21-4b8e-9a6f-2e4d1c3b0a97";

/** The store's answer: which ids each table holds for this viewer. */
const TABLES: Record<string, string[]> = { [VISIT_TYPE]: [FOLLOW_UP, DISCHARGE], [SLOTS]: [TUE_930, WED_200] };

/** The two tables' own documents, as the store keeps them (slice 4.0 fixtures). */
const DOCUMENTS: Record<string, Record<string, unknown>> = {
  [VISIT_TYPE]: { name: "Visit type", display: "list", kept_for: "choices", title_field: "name" },
  [SLOTS]: { name: "Appointment Slots", display: "list", title_field: "slot" },
};

function doors() {
  const calls = { readRecords: 0, resolveId: 0, entityWords: 0 };
  const fake: OpenabilityDoors = {
    async readRecords(_org, tableId, ids) {
      calls.readRecords += 1;
      return new Set(ids.filter((id) => TABLES[tableId]?.includes(id)));
    },
    async tableDocument(tableId) {
      return DOCUMENTS[tableId] ?? null;
    },
    async resolveId() {
      calls.resolveId += 1;
      return { open: false, says: "This link does not open anything for the account you are signed in with." };
    },
    async entityWords(_org, refs) {
      calls.entityWords += 1;
      return new Map(refs.map((r) => [`${r.token}:${r.id}`, "Tomorrow's visits"]));
    },
    hasDoor: (token) => token === "record" || token === "note",
  };
  return { fake, calls };
}

function block(kind: string, value: Record<string, unknown>) {
  const complete = { __kind: kind, ...value };
  return { content: JSON.stringify(complete), metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, kind) } };
}

async function mount(node: React.ReactNode) {
  const store = configureStore({
    reducer: { userAuth: userAuthReducer, appContext: appContextReducer },
    preloadedState: { appContext: { ...appContextReducer(undefined, { type: "init" }), organization_id: CEDAR } },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Provider store={store}>{node}</Provider>);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { container };
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  setOpenabilityDoorsForTests(null);
  document.body.innerHTML = "";
});

describe("relation", () => {
  it("routes to its one chip, and is read as platform_record too", () => {
    const routed = applyIrKindRoute({ type: "code", ...block("relation", { _record_id: TUE_930 }) });
    expect(routed.type).toBe("relation");
    expect([...RELATION_KINDS].sort()).toEqual(["platform_record", "relation"]);
  });

  it("a readable record is a link; an unreadable one is a muted chip with the door's sentence and no link", async () => {
    const { fake, calls } = doors();
    setOpenabilityDoorsForTests(fake);
    const { container } = await mount(
      <>
        <RelationBlock {...block("relation", { _record_id: TUE_930, token: "record", table_id: SLOTS, label: "Tue Oct 7, 9:30 AM" })} />
        <RelationBlock {...block("relation", { _record_id: WED_200, token: "record", table_id: SLOTS, label: "Wed Oct 8, 2:00 PM" })} />
        <RelationBlock {...block("relation", { _record_id: OLD_INTAKE, token: "record", table_id: SLOTS, label: "Old intake form" })} />
        <RelationBlock {...block("relation", { _record_id: OLD_INTAKE, token: "wormhole", label: "Elsewhere" })} />
      </>,
    );
    const open = container.querySelectorAll('[data-relation-chip="open"] a');
    expect([...open].map((a) => a.getAttribute("href"))).toEqual([`/o/${TUE_930}`, `/o/${WED_200}`]);
    const closed = [...container.querySelectorAll('[data-relation-chip="closed"]')];
    expect(closed.map((c) => c.getAttribute("title"))).toEqual([CANT_OPEN_RECORD, NO_DOOR]);
    for (const chip of closed) expect(chip.querySelector("a")).toBeNull();
    // One call for the table, however many chips it holds.
    expect(calls.readRecords).toBe(1);
  });
});

describe("pick_list", () => {
  const offer = (choices: Array<Record<string, unknown>>) =>
    block("pick_list", { prompt: "What kind of visit is Maria Alvarez booking?", choose: "one", pick_list_id: VISIT_TYPE, choices });

  it("draws the Pick list's records as choices that cannot be pressed yet", async () => {
    setOpenabilityDoorsForTests(doors().fake);
    const { container } = await mount(
      <PickListBlock {...offer([{ _record_id: FOLLOW_UP, label: "Follow-up" }, { _record_id: DISCHARGE, label: "Discharge" }])} />,
    );
    const choices = [...container.querySelectorAll("[data-pick-list-choice]")];
    expect(choices.map((c) => c.textContent)).toEqual(["Follow-up", "Discharge"]);
    for (const c of choices) expect(c.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector("button")).toBeNull();
  });

  it("a choice that is not a record of the named Pick list refuses the offer in a sentence", async () => {
    setOpenabilityDoorsForTests(doors().fake);
    const { container } = await mount(
      <PickListBlock {...offer([{ _record_id: FOLLOW_UP, label: "Follow-up" }, { _record_id: TUE_930, label: "Re-evaluation" }])} />,
    );
    expect(container.querySelector("[data-pick-list-choice]")).toBeNull();
    expect(container.querySelector("[data-pick-list-refused]")?.textContent).toBe(
      "“Re-evaluation” is not a record of this Pick list, so these choices can't be offered.",
    );
  });

  it("a pick list naming any table but a Pick list is refused in a sentence (chair V2)", async () => {
    setOpenabilityDoorsForTests(doors().fake);
    const { container } = await mount(
      <PickListBlock
        {...block("pick_list", {
          prompt: "Which time works for Maria's follow-up visit?",
          pick_list_id: SLOTS,
          choices: [{ _record_id: TUE_930, label: "Tue Oct 7, 9:30 AM" }, { _record_id: WED_200, label: "Wed Oct 8, 2:00 PM" }],
        })}
      />,
    );
    expect(container.querySelector("[data-pick-list-choice]")).toBeNull();
    expect(container.querySelector("[data-pick-list-refused]")?.textContent).toBe(
      "“Appointment Slots” is a table, not a Pick list, so its records can't be offered as choices.",
    );
  });

  it("an ad-hoc key is never a choice", () => {
    expect(
      pickListChoiceRefusal({ pick_list_id: VISIT_TYPE, choices: [{ key: "thu-1100", label: "Thu Oct 9, 11:00 AM" }] }),
    ).toBe("“Thu Oct 9, 11:00 AM” is not a record of the Pick list. Every choice must be one of the list's own records.");
  });
});
