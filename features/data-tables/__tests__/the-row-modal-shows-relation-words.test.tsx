/**
 * THE ROW MODAL READS A RELATION BY ITS WORDS, THROUGH THE SAME PICKER AS THE GRID.
 *
 * Lane REFUSAL-SWEEP item 3 (2026-09-23). `OLD-TABLES-2`'s W3 wave put the
 * WORDS of a related record on the grid, the column filter checklist and the
 * agent scope by feeding `choiceMap` `{ value: <record id>, label: <words> }`
 * from the ONE resolver (`relation-words.ts` + `relation-words-client.tsx`).
 * It missed the two ROW MODALS: opening a row on an older user-defined table
 * showed the Customer field as a bare uuid, and the field's picker was not the
 * picker the grid cell opens — it had no options at all.
 *
 * THE REAL USE CASE these fixtures name: Rincon Plumbing & Drain, a 14-van
 * plumbing contractor in Ventura County, runs its dispatch board as an older
 * user-defined data table. A dispatcher opens a work order to change who it is
 * for. "Customer" points at a row of the Accounts table. The dispatcher knows
 * "Takeda Property Management"; nobody on that board has ever known
 * `5f3c1d2a-…`.
 *
 * RED PROOF — recorded 2026-09-23 by restoring the pre-fix `EditRowModal.tsx`
 * and `ChoiceInput.tsx` in place and putting them back in the same command.
 * FOUR of the five clauses fail:
 *   1. the Customer field reads `5f3c1d2a-7b41-4e88-9a02-1c6d3e5f7a90`
 *   2. the picker says "No options declared yet. Type a value to use one."
 *      instead of offering the two names the grid's picker offers
 *   4. an unresolvable id reads as the bare uuid, not the amber identifier
 *   5. and so does a page whose relation words never arrived
 *
 * Nothing about the rendering path is stubbed: this is the real
 * `EditRowModal` → real `FormatAwareInput` → real `ChoiceInput` → real
 * `useFieldChoices`. The only double is the write service, which a read must
 * never reach.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

/**
 * The plain-text column's editor is `ProTextarea`, which mounts the agent
 * action bar and reads the real application store. It is not what this test is
 * about — a bare textarea stands in so the RELATION path below is the only
 * thing under test and nothing here is stubbed.
 */
jest.mock("@/components/official/ProTextarea", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ProTextarea: (props: Record<string, unknown>) =>
    (require("react") as typeof import("react")).createElement("textarea", {
      id: props.id as string,
      value: (props.value as string) ?? "",
      onChange: props.onChange as () => void,
    }),
}));

const upsertRow = jest.fn();
jest.mock("../service", () => ({
  upsertRow: (...args: unknown[]) => upsertRow(...args),
}));

import EditRowModal from "@/components/user-generated-table-data/EditRowModal";
import type { FieldChoice } from "@/lib/field-formats/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Radix's popper measures its anchor; jsdom ships no ResizeObserver. Position is
// not what this test reads — the option list's CONTENTS are.
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// cmdk scrolls the active option into view; jsdom has no layout to scroll.
if (!(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView) {
  (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = () => {};
}

/** The dispatch board's real shape: a work order pointing at an account row. */
const TAKEDA = "5f3c1d2a-7b41-4e88-9a02-1c6d3e5f7a90";
const RINCON_RIDGE = "a1b2c3d4-55e6-47f8-8901-2b3c4d5e6f70";
/** An account row this seat cannot resolve — archived, or in a table it may not read. */
const GONE = "9f2c7a10-0000-4000-8000-0123456789ab";

const CUSTOMER_WORDS: ReadonlyMap<string, FieldChoice[]> = new Map([
  [
    "customer",
    [
      { value: TAKEDA, label: "Takeda Property Management" },
      { value: RINCON_RIDGE, label: "Rincon Ridge HOA" },
    ],
  ],
]);

const FIELDS = [
  {
    id: "f1",
    field_name: "work_order",
    display_name: "Work order",
    data_type: "string",
    field_order: 1,
    is_required: false,
  },
  {
    id: "f2",
    field_name: "customer",
    display_name: "Customer",
    data_type: "string",
    field_order: 2,
    is_required: false,
    metadata: {
      format: {
        id: "relation",
        options: { relation_target: "accounts", relation_max: 1 },
      },
    },
  },
];

/** A canonical uuid anywhere on the screen — the thing that must never be there. */
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  upsertRow.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Everything on screen, dialog included — Radix portals the dialog out of `container`. */
function screenText(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function uuidsOnScreen(): string[] {
  return screenText().match(UUID_ANYWHERE) ?? [];
}

function openRow(
  customerValue: string | null,
  relationChoices: ReadonlyMap<string, FieldChoice[]> | undefined,
) {
  // The plain-text column draws `ProTextarea`, which reaches the app store for
  // its agent action. An empty store is enough: nothing in this test touches it.
  const store = configureStore({ reducer: { noop: (state = {}) => state } });
  act(() => {
    root.render(
      <Provider store={store}>
      <EditRowModal
        tableId="rincon-dispatch-board"
        rowId="row-4471"
        rowData={{ work_order: "WO-4471", customer: customerValue }}
        fields={FIELDS}
        isOpen
        onClose={() => {}}
        onSuccess={() => {}}
        relationChoices={relationChoices}
      />
      </Provider>,
    );
  });
}

/** The Customer field's own control — the combobox the dispatcher clicks. */
function customerTrigger(): HTMLElement {
  const found = document.getElementById("customer");
  if (!found) throw new Error("the Customer field has no control on screen");
  return found;
}

describe("a row modal on an older data table reads a relation by its words", () => {
  it("1. shows the customer's NAME where the row stores a record id, and no uuid anywhere", () => {
    openRow(TAKEDA, CUSTOMER_WORDS);
    expect(customerTrigger().textContent).toContain("Takeda Property Management");
    expect(uuidsOnScreen()).toEqual([]);
  });

  it("2. its picker offers the same names the grid's picker offers", () => {
    openRow(TAKEDA, CUSTOMER_WORDS);
    act(() => {
      customerTrigger().dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    const text = screenText();
    expect(text).toContain("Takeda Property Management");
    expect(text).toContain("Rincon Ridge HOA");
    expect(uuidsOnScreen()).toEqual([]);
  });

  it("3. never sends a write while the row is merely being read", () => {
    openRow(TAKEDA, CUSTOMER_WORDS);
    expect(upsertRow).not.toHaveBeenCalled();
  });

  it("4. an id the store could not resolve reads as the amber identifier, never a bare uuid", () => {
    openRow(GONE, CUSTOMER_WORDS);
    expect(customerTrigger().textContent).toContain("Record 9f2c7a10");
    expect(uuidsOnScreen()).toEqual([]);
  });

  it("5. a table whose relation words never arrived still never prints a uuid", () => {
    // The resolver returning nothing is a real state (a refusal comes back as
    // an empty map). It must degrade to the identifier rendering, not to the id.
    openRow(TAKEDA, undefined);
    expect(customerTrigger().textContent).toContain("Record 5f3c1d2a");
    expect(uuidsOnScreen()).toEqual([]);
  });
});
