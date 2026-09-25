/**
 * TABLE-PARITY M3 on /data-v2: an agent button hands the row to `data.row_action` exactly as
 * the older grid does. Cedar Ridge Veterinary Clinic's Appointments table, "Draft reminder".
 */
import { rowAgentLaunch, rowAgentOffer, type RowAgentActionTarget } from "../rowAgentAction";

const target: RowAgentActionTarget = {
  tableId: "5b1d6f0e-2c47-4a8e-9f1b-7d3c2a9e4b10",
  recordId: "c7e2a4b9-1f63-4d58-8a0e-3b9f6d2c1a74",
  title: "Tango — annual vaccines",
  action: "Draft reminder",
  prompt: "  Draft a friendly reminder text for this appointment.  ",
};

const columns = [
  { display_name: "Status", field_name: "status", data_type: "choice", sort: 2 },
  { display_name: "Patient", field_name: "patient", data_type: "text", sort: 0 },
  { display_name: "Visit fee", field_name: "visit_fee", data_type: "number", sort: 1 },
];

const document = {
  patient: "Tango",
  visit_fee: 185.5,
  status: null,
  _hidden: { owner_phone: { reason: "sensitive" } },
  _sources: { s1: { unresolved: { vet: "9f2c7a10-5b44-4e88-9d31-0a6e1c4b7f22" } } },
};

describe("an agent button on the new table page", () => {
  it("offers the row as the job's values, in column order, without the store's envelope keys", () => {
    const offer = rowAgentOffer({
      target,
      tableName: "Appointments",
      columns,
      document,
      actingPersonId: "87a6e699-3622-4869-8843-d0867456c0dd",
      actingPersonCanEdit: true,
    });
    expect(offer.table_id).toBe(target.tableId);
    expect(offer.table_name).toBe("Appointments");
    const cols = (offer.table_columns as { columns: Array<{ field_name: string }> }).columns;
    expect(cols.map((c) => c.field_name)).toEqual(["patient", "visit_fee", "status"]);
    expect(cols[0]).toEqual({ display_name: "Patient", field_name: "patient", data_type: "text" });
    expect(offer.row_json).toEqual({ patient: "Tango", visit_fee: 185.5, status: null });
    expect(offer.row_fields_summary).toBe("Patient: Tango\nVisit fee: 185.5\nStatus: (empty)");
    expect(offer.row_label).toBe("Tango — annual vaccines");
    expect(offer.action_name).toBe("Draft reminder");
    expect(offer.action_prompt).toBe("Draft a friendly reminder text for this appointment.");
    expect(offer.acting_person_can_edit).toBe(true);
  });

  it("a blank prompt and an unknown person are absent, never empty strings", () => {
    const offer = rowAgentOffer({
      target: { ...target, prompt: "   ", title: "" },
      tableName: "Appointments",
      columns,
      document: {},
      actingPersonId: null,
      actingPersonCanEdit: false,
    });
    expect("action_prompt" in offer).toBe(false);
    expect("acting_person_id" in offer).toBe(false);
    expect(offer.row_label).toBe(target.recordId);
  });

  it("launches the same job the older grid launches, with the prompt as the only user input", () => {
    const offer = rowAgentOffer({ target, tableName: "Appointments", columns, document, actingPersonId: null, actingPersonCanEdit: false });
    const launch = rowAgentLaunch(target, offer, "org-cedar-ridge-veterinary");
    // The run is filed in the TABLE's organization, never the active one (ACCESS-FIX-18).
    expect(launch.organizationId).toBe("org-cedar-ridge-veterinary");
    expect(launch.runtime?.userInput).toBe("Draft a friendly reminder text for this appointment.");
    expect(launch.runtime?.variables).toBe(offer);
    expect(launch.runtime?.context).toBe(offer);
    expect(launch.config?.displayMode).toBe("flexible-panel");
    expect(launch.runtime?.userInput).not.toContain("Tango");
  });
});
