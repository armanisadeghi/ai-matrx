// The list reads metadata only and filters by subject; versions are one job's
// chain by source_id. A recording double of the supabase-js builder captures
// exactly what would be sent to PostgREST.

type Call = { schema?: string; from?: string; select?: string; eq: [string, unknown][]; is: [string, unknown][] };
const calls: Call[] = [];
let nextResult: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 };

function builder(call: Call) {
  const b = {
    select(cols: string) {
      call.select = cols;
      return b;
    },
    eq(col: string, v: unknown) {
      call.eq.push([col, v]);
      return b;
    },
    is(col: string, v: unknown) {
      call.is.push([col, v]);
      return b;
    },
    order() {
      return b;
    },
    limit() {
      return Promise.resolve(nextResult);
    },
    then(resolve: (v: unknown) => void) {
      return Promise.resolve(nextResult).then(resolve);
    },
  };
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema(schema: string) {
      return {
        from(table: string) {
          const call: Call = { schema, from: table, eq: [], is: [] };
          calls.push(call);
          return builder(call);
        },
      };
    },
  }),
}));
jest.mock("@/lib/scoped-config/service", () => ({
  fetchKnobIndex: jest.fn(),
  fetchKnobWriteDoor: jest.fn(),
  writeKnobOverrideThroughDoor: jest.fn(),
}));

import { fetchSavedSeoReports, fetchSeoReportVersions, chooseSeoReportTemplate } from "../service";
import * as knobs from "@/lib/scoped-config/service";

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: [], error: null, count: 0 };
});

it("the list never selects a body column", async () => {
  await fetchSavedSeoReports();
  const [call] = calls;
  expect(call.schema).toBe("chat");
  expect(call.from).toBe("artifact");
  const columns = call.select!.split(",").map((c) => c.trim());
  // No whole-metadata, no content/body, no star: only named summary paths.
  expect(columns).not.toContain("*");
  expect(columns).not.toContain("metadata");
  expect(call.select).not.toMatch(/content|body|markdown/);
  expect(columns).toEqual(
    expect.arrayContaining(["id", "title", "version", "updated_at", "created_by", "source_id"]),
  );
  expect(call.eq).toContainEqual(["source_system", "seo_report"]);
  expect(call.is).toContainEqual(["deleted_at", null]);
});

it("the agency list applies no subject or organization filter", async () => {
  await fetchSavedSeoReports({ subject: null });
  expect(calls[0].eq.map(([c]) => c)).toEqual(["source_system"]);
});

it("the site view lists only that site's reports", async () => {
  await fetchSavedSeoReports({ subject: { type: "site", id: "site-1" } });
  expect(calls[0].eq).toEqual(
    expect.arrayContaining([
      ["metadata->subject->>type", "site"],
      ["metadata->subject->>id", "site-1"],
    ]),
  );
});

it("reports the database total when there are more rows than the screen holds", async () => {
  nextResult = { data: [{ id: "a" }], error: null, count: 812 };
  const page = await fetchSavedSeoReports();
  expect(page.total).toBe(812);
  expect(page.rows).toHaveLength(1);
});

it("a read failure is thrown with its reason, never an empty list", async () => {
  nextResult = { data: null, error: { message: "permission denied" } };
  await expect(fetchSavedSeoReports()).rejects.toThrow("permission denied");
});

it("version history is every canvas item of the job, by source_id, without content", async () => {
  await fetchSeoReportVersions("job-1");
  const [call] = calls;
  expect(call.schema).toBe("canvas");
  expect(call.from).toBe("canvas_items");
  expect(call.select).not.toMatch(/content/);
  expect(call.eq).toEqual(
    expect.arrayContaining([
      ["source_system", "seo_report"],
      ["source_id", "job-1"],
    ]),
  );
});

it("choosing a template writes the knob at the chosen rung in the subject's organization", async () => {
  const door = { mayWrite: true, setDoor: "platform.knob_override_set" };
  (knobs.fetchKnobWriteDoor as jest.Mock).mockResolvedValue(door);
  (knobs.writeKnobOverrideThroughDoor as jest.Mock).mockResolvedValue({ ok: true });
  await chooseSeoReportTemplate({ organizationId: "org-9", rung: "site", scopeId: "site-1", templateId: "tpl-2" });
  expect(knobs.fetchKnobWriteDoor).toHaveBeenCalledWith({ fullKey: "seo.report.template_id", organizationId: "org-9" });
  expect(knobs.writeKnobOverrideThroughDoor).toHaveBeenCalledWith({
    door,
    feature: "seo",
    key: "report.template_id",
    scopeKind: "site",
    scopeId: "site-1",
    organizationId: "org-9",
    value: "tpl-2",
  });
});

it("a person the door refuses gets the door's sentence and nothing is written", async () => {
  (knobs.writeKnobOverrideThroughDoor as jest.Mock).mockClear();
  (knobs.fetchKnobWriteDoor as jest.Mock).mockResolvedValue({ mayWrite: false, authorityDetail: "Only owners or admins." });
  const result = await chooseSeoReportTemplate({ organizationId: "o", rung: "organization", scopeId: "o", templateId: "t" });
  expect(result).toEqual({ ok: false, reason: "forbidden", detail: "Only owners or admins." });
  expect(knobs.writeKnobOverrideThroughDoor).not.toHaveBeenCalled();
});
