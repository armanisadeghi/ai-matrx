/**
 * THE TEMPLATE AGENT COPY: the host's `copyAgent` for `installTemplate`.
 *
 * Shaped on the gold template (Linden Hollow Family Medicine, 45 appointments): the
 * request is exactly what install.ts's `agentCopyRequest` builds, and the source agent
 * row is the Chief of Staff's real variable shape (two variables, no `records` tool).
 * The ports are in-memory stand-ins for the database doors; the logic under test —
 * which source is copied, what each variable is bound to, the tool, and archiving an
 * unfinished copy — is the real code.
 */
import {
  bindTemplateVariables,
  createTemplateAgentArchiver,
  createTemplateAgentCopier,
  TEMPLATE_AGENT_COLLECTION_LIMIT,
  type TemplateAgentCopyPorts,
  type TemplateAgentCopyRequest,
} from "../templateAgentCopy";
import type { AgentRow } from "../installer";

const ORG = "6f1d2c34-9a7b-4e21-8c55-0d3e7f9a1b20";
const CHIEF_OF_STAFF = "4383174d-aae9-4bb8-a2ea-0498f3cc47a3";
const APPOINTMENTS = "b7e1a9c2-41f3-4d8e-9a6b-2c5f0e8d7a14";
const RECORDS_TOOL = "30cf4ddd-d9e6-4f43-af3a-595f467bd661";
const MEMORY_TOOL = "19b146f1-e1f2-4848-91e3-46df6c4898fb";

const REQUEST: TemplateAgentCopyRequest = {
  organizationId: ORG,
  platformAgent: "Chief of Staff",
  platformAgentId: null,
  name: "Linden Hollow Front Desk",
  bindings: [
    {
      variable: "person_profile",
      tableToken: "appointment",
      tableId: APPOINTMENTS,
      describes: "The schedule and what each visit collected — never the clinical notes.",
    },
  ],
};

const SOURCE_DEFS = [
  { name: "primary_channel", defaultValue: "sms", helpText: "How the person reaches their staff." },
  { name: "person_profile", defaultValue: "", helpText: "Who the person is.", customComponent: { type: "textarea" } },
];

function fakeDb(overrides: Partial<TemplateAgentCopyPorts> = {}) {
  const rows = new Map<string, AgentRow & { name?: string; is_archived?: boolean }>();
  const calls: string[] = [];
  const ports: TemplateAgentCopyPorts = {
    async platformAgentIdByName(name) {
      calls.push(`lookup:${name}`);
      if (name !== "Chief of Staff") throw new Error(`No platform agent is named "${name}".`);
      return CHIEF_OF_STAFF;
    },
    async duplicate(source, org) {
      calls.push(`duplicate:${source}->${org}`);
      const id = "c0a1f7e2-5b3d-4c9e-8f21-7d6a0b4e3c58";
      rows.set(id, {
        id,
        version: 1,
        // agx_duplicate_agent carries the source's tags (the Chief of Staff's real ones).
        tags: ["chief-of-staff", "personal-assistant", "sms-and-voice"],
        tools: [MEMORY_TOOL],
        variable_definitions: JSON.parse(JSON.stringify(SOURCE_DEFS)),
      });
      return id;
    },
    async name(agentId, _org, base, also) {
      calls.push(`name:${base}`);
      Object.assign(rows.get(agentId)!, { name: base, ...also });
      return base;
    },
    async write(agentId, what, build) {
      calls.push(`write:${what}`);
      const row = rows.get(agentId)!;
      Object.assign(row, build(row), { version: row.version + 1 });
    },
    async archive(agentId) {
      calls.push(`archive:${agentId}`);
      rows.get(agentId)!.is_archived = true;
    },
    async recordsToolId() {
      return RECORDS_TOOL;
    },
    ...overrides,
  };
  return { ports, rows, calls };
}

describe("template agent copy", () => {
  it("copies the named platform agent into the org, binds the variable to the installed table, and attaches records", async () => {
    const { ports, rows, calls } = fakeDb();
    const { agentId } = await createTemplateAgentCopier(ports)(REQUEST);

    expect(calls.slice(0, 3)).toEqual([
      "lookup:Chief of Staff",
      `duplicate:${CHIEF_OF_STAFF}->${ORG}`,
      "name:Linden Hollow Front Desk",
    ]);
    const row = rows.get(agentId)!;
    expect(row.name).toBe("Linden Hollow Front Desk");
    expect(row.tools).toEqual([MEMORY_TOOL, RECORDS_TOOL]);
    expect(row.is_archived).toBeUndefined();
    // The source's tags would file scopes (a Tag table) in the installing org: none ride along.
    expect(row.tags).toEqual([]);

    const defs = row.variable_definitions as Record<string, unknown>[];
    // The bound variable: the whole appointments table, default cleared, its other keys kept.
    expect(defs[1]).toEqual({
      name: "person_profile",
      defaultValue: null,
      helpText: "Who the person is.",
      customComponent: { type: "textarea" },
      binding: {
        kind: "merge_field",
        source: "record",
        semantic_type: "collection",
        table_id: APPOINTMENTS,
        limit: TEMPLATE_AGENT_COLLECTION_LIMIT,
        missing: "absent",
        override_policy: "shown_locked",
      },
    });
    // The unbound variable is untouched, byte for byte.
    expect(defs[0]).toEqual(SOURCE_DEFS[0]);
  });

  it("the collection limit covers all 45 appointments (the resolver's own default of 40 would cut five)", () => {
    expect(TEMPLATE_AGENT_COLLECTION_LIMIT).toBeGreaterThanOrEqual(45);
  });

  it("uses the template's agent id when it carries one, without a name lookup", async () => {
    const { ports, calls } = fakeDb();
    await createTemplateAgentCopier(ports)({ ...REQUEST, platformAgentId: CHIEF_OF_STAFF });
    expect(calls).not.toContain("lookup:Chief of Staff");
    expect(calls).toContain(`duplicate:${CHIEF_OF_STAFF}->${ORG}`);
  });

  it("does not add records twice when the source already has it", async () => {
    const { ports, rows } = fakeDb();
    const duplicate = ports.duplicate;
    ports.duplicate = async (s, o) => {
      const id = await duplicate(s, o);
      rows.get(id)!.tools = [RECORDS_TOOL];
      return id;
    };
    const { agentId } = await createTemplateAgentCopier(ports)(REQUEST);
    expect(rows.get(agentId)!.tools).toEqual([RECORDS_TOOL]);
  });

  it("a variable the agent lacks fails by name and archives the unfinished copy", async () => {
    const { ports, rows } = fakeDb();
    const request = { ...REQUEST, bindings: [{ ...REQUEST.bindings[0]!, variable: "visit_schedule" }] };
    await expect(createTemplateAgentCopier(ports)(request)).rejects.toThrow(
      'The copied agent has no "visit schedule" input to connect. The unfinished copy was archived.',
    );
    const [row] = [...rows.values()];
    expect(row!.is_archived).toBe(true);
    expect((row!.variable_definitions as unknown[])).toEqual(SOURCE_DEFS);
  });

  it("a table the install did not create (empty id) fails by name", () => {
    expect(() =>
      bindTemplateVariables(SOURCE_DEFS, [{ ...REQUEST.bindings[0]!, tableId: "" }], 500),
    ).toThrow('The template binds "person_profile" to its "appointment" table, which was not created.');
  });

  it("an unreadable records tool is a named failure, not a copy without it", async () => {
    const { ports } = fakeDb({ recordsToolId: async () => null });
    await expect(createTemplateAgentCopier(ports)(REQUEST)).rejects.toThrow(/records tool could not be read/);
  });

  it("onCreated hands the id over before anything can fail, and the footprint (not the copier) then owns the failed copy", async () => {
    const { ports, rows, calls } = fakeDb({ recordsToolId: async () => null });
    const created: string[] = [];
    await expect(
      createTemplateAgentCopier(ports)({ ...REQUEST, onCreated: (id) => created.push(id) }),
    ).rejects.toThrow(/records tool could not be read/);
    const [id] = [...rows.keys()];
    expect(created).toEqual([id]);
    expect(calls.some((c) => c.startsWith("archive:"))).toBe(false);
  });

  it("the archiver archives exactly the footprint's agent", async () => {
    const { ports, rows } = fakeDb();
    const { agentId } = await createTemplateAgentCopier(ports)(REQUEST);
    await createTemplateAgentArchiver(ports)(agentId);
    expect(rows.get(agentId)!.is_archived).toBe(true);
  });
});

// THE BINDING IS THE "FROM MY DATA" BINDING. A template copy must open in the agent's own
// custom-data picker as an ordinary whole-table binding — the same shape the picker starts
// from — never a second binding dialect the picker cannot edit.
import { emptyCustomDataBinding, isCompleteBinding } from "@/features/agents/components/variables-management/custom-data/customDataBinding";
import { templateBinding } from "../templateAgentCopy";

describe("template binding = the From my data binding", () => {
  it("is the picker's whole-table binding with only the table and row cap filled in", () => {
    const b = templateBinding(REQUEST.bindings[0], TEMPLATE_AGENT_COLLECTION_LIMIT);
    expect(b).toEqual({ ...emptyCustomDataBinding(), table_id: APPOINTMENTS, limit: TEMPLATE_AGENT_COLLECTION_LIMIT });
    expect(isCompleteBinding(b)).toBe(true);
  });
});

// A TABLE VARIABLE TAKES THE REFERENCE (Arman, 2026-10-03: "users can just select tables instead
// of text"). "Answers From Your Tables" declares primary_table as a Table and related_tables as
// Tables; a template copy hands each the installed table id(s) — the same value the person picks
// in the run form — never a merge-field binding and never text.
// The module under test can be swapped for a scratch copy with a planted break (forcing function).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const underTest = require(process.env.TEMPLATE_AGENT_COPY_UNDER_TEST ?? "../templateAgentCopy") as typeof import("../templateAgentCopy");

describe("a Table variable gets the table reference", () => {
  const bindTables = underTest.bindTemplateVariables;
  const VISITS = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
  const PATIENTS = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
  const PROVIDERS = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
  const TABLE_AGENT_DEFS = [
    { name: "primary_table", defaultValue: "", required: true, customComponent: { type: "table" } },
    { name: "related_tables", defaultValue: [], customComponent: { type: "tables" } },
  ];
  const bind = (variable: string, tableId: string) => ({ variable, tableToken: variable, tableId, describes: "" });

  it("primary_table holds the one id; related_tables holds every id the template names, in order", () => {
    const defs = bindTables(
      TABLE_AGENT_DEFS,
      [bind("primary_table", VISITS), bind("related_tables", PATIENTS), bind("related_tables", PROVIDERS)],
      TEMPLATE_AGENT_COLLECTION_LIMIT,
    ) as Record<string, unknown>[];
    expect(defs[0]).toEqual({ ...TABLE_AGENT_DEFS[0], defaultValue: VISITS });
    expect(defs[1]).toEqual({ ...TABLE_AGENT_DEFS[1], defaultValue: [PATIENTS, PROVIDERS] });
    expect(defs.some((d) => "binding" in d)).toBe(false);
  });

  it("a stale binding on a Table variable is removed — the reference is the one truth", () => {
    const stale = [{ ...TABLE_AGENT_DEFS[0], binding: { kind: "merge_field", table_id: "x" } }];
    const [def] = bindTables(stale, [bind("primary_table", VISITS)], 500) as Record<string, unknown>[];
    expect(def).toEqual({ ...TABLE_AGENT_DEFS[0], defaultValue: VISITS });
  });
});
