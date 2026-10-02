/**
 * THE AGENT TWIN OF "ADD FIELD" (page-pass 2026-09-27, /chat/message-templates/<id>).
 *
 * A person on a record page could add a custom field; an agent on the same page
 * was offered nothing. Every page that embeds the custom-fields section now
 * offers the platform target `custom_fields_add`, which goes to the section's
 * own door. Harbor Lane Dental's office manager asks the page's agent to add a
 * "Recall interval" to every message template.
 */
const mockToastSuccess = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: mockToastSuccess },
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: () => undefined,
}));
jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => ({
  getKindInputContractBySlug: jest.fn(),
}));

import {
  applySurfaceWrite,
  listAgentWritableTargets,
} from "@/features/surfaces/runtime/surface-writeback";
import {
  __resetCustomFieldsDoors,
  customFieldsScopeValue,
  customFieldsProblems,
  hasCustomFieldsDoors,
  listCustomFieldsDoors,
  registerCustomFieldsDoor,
  type CustomFieldAddRequest,
  type CustomFieldsAgentDoor,
} from "@/features/surfaces/runtime/custom-field-targets";

const TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
];

function templatesDoor(opts: { mayAdd?: boolean; failOn?: string } = {}) {
  const fields: Array<{ key: string; label: string; type: string; value?: unknown }> = [
    { key: "tone", label: "Tone", type: "text", value: "Warm" },
  ];
  const added: CustomFieldAddRequest[] = [];
  const door: CustomFieldsAgentDoor = {
    entityToken: "message_template",
    recordId: "9a4b2c1d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    state: () => ({
      entityToken: "message_template",
      recordId: "9a4b2c1d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      entityLabel: "Message template",
      mayAdd: opts.mayAdd ?? true,
      refusal: opts.mayAdd === false ? "Only an organization admin can add a field to Message templates." : null,
      fields,
      types: TYPES,
    }),
    check: (requests) => {
      if (opts.mayAdd === false) return ["Only an organization admin can add a field to Message templates."];
      const problems: string[] = [];
      for (const r of requests) {
        if (fields.some((f) => f.label.toLowerCase() === r.label.trim().toLowerCase())) {
          problems.push(`there is already a field named "${r.label}".`);
        }
        if (r.type && !TYPES.some((t) => t.value === r.type)) problems.push(`"${r.label}" cannot hold "${r.type}".`);
      }
      return problems;
    },
    addField: async (request) => {
      if (request.label === opts.failOn) return { ok: false, message: "The store refused it." };
      added.push(request);
      fields.push({ key: request.label.toLowerCase(), label: request.label, type: request.type ?? "text" });
      return { ok: true, field_id: `f-${added.length}`, label: request.label, type: request.type ?? "text" };
    },
    checkValues: (values) =>
      Object.keys(values)
        .filter((k) => !fields.some((f) => f.label.toLowerCase() === k.toLowerCase() || f.key === k))
        .map((k) => `There is no custom field "${k}".`),
    setValues: async (values) => {
      const written = Object.entries(values).map(([k, value]) => {
        const f = fields.find((x) => x.label.toLowerCase() === k.toLowerCase() || x.key === k)!;
        f.value = value;
        return { key: f.key, label: f.label, value };
      });
      return { ok: true, written };
    },
  };
  return { door, added, fields };
}

describe("custom_fields_add — the platform target every custom-fields section brings", () => {
  beforeEach(() => {
    __resetCustomFieldsDoors();
    jest.clearAllMocks();
  });

  it("is offered only while a section is mounted, worded with what that section holds", () => {
    expect(listAgentWritableTargets().some((t) => t.target.name === "custom_fields_add")).toBe(false);
    const unregister = registerCustomFieldsDoor(templatesDoor().door);
    const offered = listAgentWritableTargets().find((t) => t.target.name === "custom_fields_add");
    expect(offered?.policy).toBe("ask");
    expect(offered?.target.description).toContain('entity "message_template" (Message template');
    expect(offered?.target.description).toContain("Tone (text)");
    expect(offered?.target.description).toContain("number (Number)");
    unregister();
    expect(listAgentWritableTargets().some((t) => t.target.name === "custom_fields_add")).toBe(false);
  });

  it("adds the fields after the person approves, and tells the agent what landed", async () => {
    const { door, added } = templatesDoor();
    registerCustomFieldsDoor(door);
    const asked: unknown[] = [];
    const result = await applySurfaceWrite(
      "custom_fields_add",
      { fields: [{ label: "Recall interval", type: "number" }, { label: "Hygienist" }] },
      {
        origin: "agent",
        quiet: true,
        requestApproval: async (proposal) => {
          asked.push(proposal);
          expect(added).toHaveLength(0);
          return { kind: "approved" };
        },
      },
    );
    expect(asked).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(added.map((a) => a.label)).toEqual(["Recall interval", "Hygienist"]);
    if (result.ok) {
      expect(result.outcome?.summary).toBe(
        'Added 2 fields to Message template: "Recall interval" (number), "Hygienist" (text).',
      );
    }
  });

  it("refuses a bad request BEFORE the card, naming every problem", async () => {
    registerCustomFieldsDoor(templatesDoor().door);
    const requestApproval = jest.fn();
    const result = await applySurfaceWrite(
      "custom_fields_add",
      { fields: [{ label: "Tone" }, { label: "Insurance", type: "choice" }] },
      { origin: "agent", quiet: true, requestApproval },
    );
    expect(requestApproval).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("before_approval");
      expect(result.error).toContain('there is already a field named "Tone".');
      expect(result.error).toContain('"Insurance" cannot hold "choice".');
      expect(result.error).toContain("Nothing was changed.");
    }
  });

  it("returns the store's reason, before any card, to a person who may not add fields", async () => {
    const { door, added } = templatesDoor({ mayAdd: false });
    registerCustomFieldsDoor(door);
    const requestApproval = jest.fn();
    const result = await applySurfaceWrite(
      "custom_fields_add",
      { fields: [{ label: "Recall interval", type: "number" }] },
      { origin: "agent", quiet: true, requestApproval },
    );
    expect(requestApproval).not.toHaveBeenCalled();
    expect(added).toHaveLength(0);
    expect(!result.ok && result.error).toContain("Only an organization admin");
  });

  it("a part-way failure says what landed and what was not attempted", async () => {
    const { door } = templatesDoor({ failOn: "Hygienist" });
    registerCustomFieldsDoor(door);
    const result = await applySurfaceWrite(
      "custom_fields_add",
      { fields: [{ label: "Recall interval", type: "number" }, { label: "Hygienist" }, { label: "Chair" }] },
      { origin: "agent", quiet: true, requestApproval: async () => ({ kind: "approved" }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("apply");
      expect(result.error).toBe(
        'Added 1 of 3: "Recall interval". "Hygienist" was not added: The store refused it. Not attempted: "Chair".',
      );
    }
  });

  it("asks which section when two different kinds are open", () => {
    const a = templatesDoor().door;
    const b = { ...templatesDoor().door, entityToken: "crm_deal", state: () => ({ ...a.state(), entityToken: "crm_deal" }) };
    const { problems } = customFieldsProblems({ fields: [{ label: "Source" }] }, [a, b]);
    expect(problems).toEqual(['Several sections are open (message_template, crm_deal); name one with "entity".']);
    expect(customFieldsProblems({ entity: "crm_deal", fields: [{ label: "Source" }] }, [a, b]).problems).toEqual([]);
  });
});

describe("custom_fields_set and the custom_fields value", () => {
  beforeEach(() => {
    __resetCustomFieldsDoors();
    jest.clearAllMocks();
  });

  it("the value carries each field with this record's value", () => {
    registerCustomFieldsDoor(templatesDoor().door);
    expect(customFieldsScopeValue()).toEqual([
      {
        entity: "message_template",
        record_id: "9a4b2c1d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        fields: [{ name: "Tone", key: "tone", type: "text", value: "Warm" }],
      },
    ]);
  });

  it("sets a value after approval, and refuses an unknown field before the card", async () => {
    registerCustomFieldsDoor(templatesDoor().door);
    const offered = listAgentWritableTargets().find((t) => t.target.name === "custom_fields_set");
    expect(offered?.target.description).toContain('Tone (text) = "Warm"');
    const requestApproval = jest.fn(async () => ({ kind: "approved" as const }));
    const bad = await applySurfaceWrite("custom_fields_set", { values: { Chair: "3" } }, { origin: "agent", quiet: true, requestApproval });
    expect(requestApproval).not.toHaveBeenCalled();
    expect(!bad.ok && bad.error).toContain('There is no custom field "Chair".');
    const good = await applySurfaceWrite("custom_fields_set", { values: { tone: "Brisk" } }, { origin: "agent", quiet: true, requestApproval });
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(good.ok && good.outcome?.summary).toBe('Saved Tone = "Brisk".');
    expect(customFieldsScopeValue()[0]?.fields[0]?.value).toBe("Brisk");
  });
});

describe("a dormant copy's custom-fields door", () => {
  it("stays registered but is not offered while its copy is dormant", () => {
    __resetCustomFieldsDoors();
    let live = false;
    const unregister = registerCustomFieldsDoor({ ...templatesDoor().door, isLive: () => live });
    expect(listCustomFieldsDoors()).toHaveLength(0);
    expect(hasCustomFieldsDoors()).toBe(false);
    live = true;
    expect(listCustomFieldsDoors()).toHaveLength(1);
    expect(hasCustomFieldsDoors()).toBe(true);
    unregister();
  });
});
