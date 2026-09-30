/**
 * EVERY COLUMN THE ROW FORM MEETS GETS A CONTROL — NEVER A LABEL WITH NOTHING UNDER IT.
 *
 * BREAKER-3 B3-03 (S2, 2026-09-30). The Sheet's "+ Row" form drew "Referral Date / Date" and nothing
 * under it: no box, no picker, so a date could not be entered from the form at all.
 *
 * ROOT CAUSE, a class and not an instance: `formatHasOwnInput()` said a `date` / `datetime` format
 * owns its input, so the modal handed the field to `FormatAwareInput` and skipped its own switch —
 * and `FormatAwareInput` then returned `null` for any column that STORES a date ("the form's own date
 * input is drawn by what the column stores"). Two functions answering one question differently. The
 * guard therefore asks both halves: every format that claims its own input renders one for every
 * storage type, and the real row form draws a control under every one of the fifteen column kinds a
 * person can make.
 *
 * THE REAL USE CASE: Cedar Ridge Physical Therapy's front desk logs referrals in a table — patient,
 * referral date, first visit (date and time), copay, sessions prescribed, status, body areas,
 * insurance verified, pain score, phone, email, the referring clinic's site, the linked doctor, the
 * signed intake form and the therapist it is assigned to. The receptionist adds a referral by hand.
 *
 * RED PROOF — recorded 2026-09-29 against the pre-fix `FormatAwareInput.tsx`, before any edit:
 * the date and datetime kinds fail both clauses ("Referral Date has no control under its label").
 *
 * Nothing on the rendering path is stubbed: the real `AddRowModal` → real `FormatAwareInput` → real
 * inputs. The doubles are the service (the form must read the columns and never write here) and the
 * two text boxes that reach the application store for their agent bar.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

jest.mock("@/components/official/ProTextarea", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ProTextarea: (props: Record<string, unknown>) =>
    (require("react") as typeof import("react")).createElement("textarea", {
      id: props.id as string,
      value: (props.value as string) ?? "",
      onChange: props.onChange as () => void,
    }),
}));
jest.mock("@/components/official/ProInput", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ProInput: (props: Record<string, unknown>) =>
    (require("react") as typeof import("react")).createElement("input", {
      id: props.id as string,
      value: (props.value as string) ?? "",
      onChange: props.onChange as () => void,
    }),
}));

const readTableDetails = jest.fn();
const addTableRow = jest.fn();
jest.mock("@/features/data-tables/service", () => ({
  readTableDetails: (...args: unknown[]) => readTableDetails(...args),
  addTableRow: (...args: unknown[]) => addTableRow(...args),
}));

import AddRowModal from "@/components/user-generated-table-data/AddRowModal";
import {
  FormatAwareInput,
  formatHasOwnInput,
} from "@/features/data-tables/components/FormatAwareInput";
import { FIELD_FORMAT_LIST } from "@ai-matrx/design-system/field-formats";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const fmt = (id: string, options?: Record<string, unknown>) => ({ format: { id, ...(options ? { options } : {}) } });

/** The referral log's fifteen columns — one of every kind the row form can meet. */
const REFERRAL_LOG = [
  ["patient", "Patient", "string", null],
  ["sessions_prescribed", "Sessions Prescribed", "integer", null],
  ["copay", "Copay", "number", fmt("currency")],
  ["referral_date", "Referral Date", "date", null],
  ["first_visit", "First Visit", "datetime", null],
  ["status", "Status", "string", fmt("choice", { choices: [{ value: "New" }, { value: "Scheduled" }] })],
  ["body_areas", "Body Areas", "array", fmt("multi_choice", { choices: [{ value: "Knee" }, { value: "Hip" }] })],
  ["insurance_verified", "Insurance Verified", "boolean", null],
  ["pain_score", "Pain Score", "integer", fmt("rating")],
  ["phone", "Phone", "string", fmt("phone")],
  ["email", "Email", "string", fmt("email")],
  ["clinic_site", "Clinic Site", "string", fmt("url")],
  ["referring_doctor", "Referring Doctor", "string", fmt("relation", { relation_target: "doctors", relation_max: 1 })],
  ["intake_form", "Intake Form", "json", fmt("attachment")],
  ["therapist", "Therapist", "string", fmt("person")],
].map(([field_name, display_name, data_type, metadata], i) => ({
  id: `f${i + 1}`,
  field_name,
  display_name,
  data_type,
  field_order: i + 1,
  is_required: false,
  default_value: null,
  metadata,
}));

const CONTROL = "input, textarea, select, button, [role=combobox], [role=radiogroup], [role=slider], [role=checkbox]";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  readTableDetails.mockReset();
  addTableRow.mockReset();
  readTableDetails.mockResolvedValue({ success: true, fields: REFERRAL_LOG });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the + Row form draws a control under every column", () => {
  it("every one of the fifteen kinds has something to type into, tick or pick", async () => {
    const store = configureStore({ reducer: { noop: (state = {}) => state } });
    await act(async () => {
      root.render(
        <Provider store={store}>
          <AddRowModal tableId="cedar-ridge-referrals" isOpen onClose={() => {}} onSuccess={() => {}} />
        </Provider>,
      );
    });
    const missing: string[] = [];
    for (const field of REFERRAL_LOG) {
      const label = document.querySelector(`label[for="${field.field_name}"]`);
      if (!label) {
        missing.push(`${field.display_name} has no label`);
        continue;
      }
      // label → its header row → the field's block, which holds the control under it.
      const block = label.parentElement?.parentElement;
      const controls = [...(block?.querySelectorAll(CONTROL) ?? [])];
      if (controls.length === 0) missing.push(`${field.display_name} has no control under its label`);
    }
    expect(missing).toEqual([]);
    expect(addTableRow).not.toHaveBeenCalled();
  });

  it("a format that claims its own input draws one, whatever the column stores", () => {
    const storageTypes = ["string", "number", "integer", "boolean", "date", "datetime", "json", "array"];
    const store = configureStore({ reducer: { noop: (state = {}) => state } });
    const empty: string[] = [];
    for (const def of FIELD_FORMAT_LIST) {
      const format = { id: def.id } as never;
      if (!formatHasOwnInput(format)) continue;
      for (const dataType of storageTypes) {
        const html = renderToStaticMarkup(
          <Provider store={store}>
            <FormatAwareInput id="x" format={format} dataType={dataType} value={null} onChange={() => {}} />
          </Provider>,
        );
        if (!/<(input|textarea|select|button)\b|role="(combobox|radiogroup|slider)"/.test(html)) {
          empty.push(`${def.id} over ${dataType}`);
        }
      }
    }
    expect(empty).toEqual([]);
  });
});
