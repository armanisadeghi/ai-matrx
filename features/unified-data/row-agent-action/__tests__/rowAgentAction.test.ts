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
  // `rowAgentOffer`/`rowAgentLaunch` never read these four (they take the row and columns as
  // their own arguments) — carried here only so `target` satisfies the required shape the Grid
  // (records-ui 0.85.7+) actually sends; the "no second read" tests below override them.
  tableName: "Appointments",
  fields: [],
  document: {},
  level: null,
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

describe("no second read", () => {
  it("a target that carries the table, columns, row and level starts the job without asking the store anything", async () => {
    const { runRowAgentAction } = await import("../rowAgentAction");
    const rpc = jest.fn();
    const launches: Array<{ key: string; options: unknown }> = [];
    await runRowAgentAction({
      target: {
        ...target,
        tableName: "Appointments",
        fields: [
          { id: "f1", key: "patient", label: "Patient", type: "text", sort: 0 },
          { id: "f2", key: "visit_fee", label: "Visit fee", type: "range", sort: 1 },
        ] as never,
        document: { patient: "Tango", visit_fee: 185.5 } as never,
        level: "editor",
      },
      dataSource: { rpc } as never,
      actor: { actor: "user", user_id: "87a6e699-3622-4869-8843-d0867456c0dd", on_behalf_of: null } as never,
      organizationId: "6069a466-1445-42df-a64e-cf37ecdc1b99",
      actingPersonId: "87a6e699-3622-4869-8843-d0867456c0dd",
      launchMandate: async (key, options) => {
        launches.push({ key, options });
      },
      onRefused: () => {
        throw new Error("refused");
      },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(launches).toHaveLength(1);
    const offer = (launches[0]!.options as { runtime: { variables: Record<string, unknown> } }).runtime.variables;
    expect(offer.table_name).toBe("Appointments");
    expect(offer.row_fields_summary).toBe("Patient: Tango\nVisit fee: 185.5");
    expect(offer.acting_person_can_edit).toBe(true);
  });

  it("a target missing one of the four required values is refused by name, never silently read", async () => {
    const { runRowAgentAction } = await import("../rowAgentAction");
    const rpc = jest.fn();
    const launches: Array<{ key: string; options: unknown }> = [];
    const refusals: Array<{ title: string; why: string }> = [];
    // `level` is dropped entirely — the one field an older records-ui, or a caller that
    // regressed to it, would omit — never inherited from `target`'s own `level: null`.
    const { level: _droppedLevel, ...targetWithoutLevel } = target;
    await runRowAgentAction({
      target: {
        ...targetWithoutLevel,
        tableName: "Appointments",
        fields: [{ id: "f1", key: "patient", label: "Patient", type: "text", sort: 0 }] as never,
        document: { patient: "Tango" } as never,
      } as never,
      dataSource: { rpc } as never,
      actor: { actor: "user", user_id: "87a6e699-3622-4869-8843-d0867456c0dd", on_behalf_of: null } as never,
      organizationId: "6069a466-1445-42df-a64e-cf37ecdc1b99",
      actingPersonId: "87a6e699-3622-4869-8843-d0867456c0dd",
      launchMandate: async (key, options) => {
        launches.push({ key, options });
      },
      onRefused: (refusalTitle, why) => {
        refusals.push({ title: refusalTitle, why });
      },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(launches).toHaveLength(0);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.title).toBe('Could not start "Draft reminder"');
    expect(refusals[0]!.why).toBe("The grid did not send this row's level.");
  });
});
