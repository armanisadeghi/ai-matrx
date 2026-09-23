// features/research/admin/template-detail.test.ts
//
// A RESEARCH TEMPLATE'S SETTINGS ARE LABELLED FIELDS, NEVER RAW JSON.
//
// The try-everything guide (2026-09-23, step 21) opened a template's own
// `/detail/research_template/<id>` page and found five settings columns —
// keyword templates, default tags, default search params, agent config,
// metadata — each dumped as a `JSON.stringify` block under a machine-cased
// heading ("AGENT CONFIG" over `{"updater_agent_id":"6e8c33ce-…"}"). This
// suite fails against the generic `fieldsFromRow` composition every
// unregistered jsonb column gets, and passes once `researchTemplateDetailFields`
// (this file's own curated list, wired in as `research_template`'s
// `refineDetail` in `features/item-presentation/registry.tsx`) is what the
// page actually renders.
import { researchTemplateDetailFields } from "./template-detail";
import type { DetailRow } from "@/lib/detail/types";

const ROW: DetailRow = {
  id: "dd53f982-a851-4701-9368-505982260271",
  name: "Company Research",
  description: "Comprehensive research on a company including services, leadership, reviews.",
  is_system: true,
  keyword_templates: ["${name}", "${name} reviews", "${name} services"],
  default_tags: ["overview", "services", "leadership"],
  default_search_params: { country: "us" },
  agent_config: {
    updater_agent_id: "6e8c33ce-6a62-44b3-bc3a-57c9579b9ed2",
    auto_tagger_agent_id: "dee57c6c-bd06-45ee-9a9d-c9d9b4f2cfe5",
  },
  autonomy_level: "semi",
  metadata: { template_type: "company" },
  version: 3,
  visibility: "public",
  created_at: "2026-02-18T11:31:00.000Z",
  updated_at: "2026-08-18T22:57:00.000Z",
};

function field(fields: ReturnType<typeof researchTemplateDetailFields>, key: string) {
  return fields.find((f) => f.key === key);
}

describe("researchTemplateDetailFields — labelled settings, never a JSON block", () => {
  it("never renders a field in monospace — no field carries `mono: true`", () => {
    // `mono: true` is exactly the generic formatter's marker for "this is a
    // JSON.stringify dump" (`lib/detail/format.ts`). A curated field list has
    // no reason to ever set it.
    const fields = researchTemplateDetailFields(ROW);
    for (const f of fields) {
      expect(f.mono).not.toBe(true);
    }
  });

  it("joins keyword templates and default tags into one line of English, with a count in the label", () => {
    const fields = researchTemplateDetailFields(ROW);
    const keywords = field(fields, "keyword_templates");
    expect(keywords?.label).toBe("Keyword templates (3)");
    expect(keywords?.text).toBe("${name}, ${name} reviews, ${name} services");
    expect(keywords?.text).not.toContain("[");

    const tags = field(fields, "default_tags");
    expect(tags?.label).toBe("Default tags (3)");
    expect(tags?.text).toBe("overview, services, leadership");
  });

  it("unpacks default_search_params into one labelled field per key, not a JSON object", () => {
    const fields = researchTemplateDetailFields(ROW);
    const country = field(fields, "default_search_params:country");
    expect(country).toBeDefined();
    expect(country?.label).toBe("Country");
    expect(country?.text).toBe("us");
    // No field anywhere carries the raw braces.
    for (const f of fields) {
      expect(f.text).not.toMatch(/^\{/);
    }
  });

  it("renders every configured agent role as a real door, labelled by what it does — never a bare id in a bracket", () => {
    const fields = researchTemplateDetailFields(ROW);
    const updater = field(fields, "updater_agent_id");
    expect(updater?.label).toBe("Research Report Updater");
    expect(updater?.ref).toEqual({
      token: "agent",
      id: "6e8c33ce-6a62-44b3-bc3a-57c9579b9ed2",
    });
    const tagger = field(fields, "auto_tagger_agent_id");
    expect(tagger?.label).toBe("Auto-Tagger Agent");
    // An agent role the template never configured is simply absent — not a
    // field reading "null" or an empty bracket.
    expect(field(fields, "page_summary_agent_id")).toBeUndefined();
  });

  it("unpacks metadata the same way, and reads the human words for kind, autonomy and visibility", () => {
    const fields = researchTemplateDetailFields(ROW);
    expect(field(fields, "metadata:template_type")?.text).toBe("company");
    expect(field(fields, "is_system")?.text).toBe("Built into the platform");
    expect(field(fields, "autonomy_level")?.text).toBe("Semi-automatic");
    expect(field(fields, "name")?.text).toBe("Company Research");
  });
});
