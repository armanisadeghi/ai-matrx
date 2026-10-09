// Realistic data-home rows for the DATA-HOME-3A tests: a person in several organizations, with the
// duplicate names many companies really have ("Client Intake" in more than one).
import type { DataHomeRow } from "../dataHomeRows";

const ORGS = {
  harbor: { id: "11111111-1111-4111-8111-111111111111", name: "Harbor Dental Group" },
  titanium: { id: "22222222-2222-4222-8222-222222222222", name: "Titanium Roofing" },
  rincon: { id: "33333333-3333-4333-8333-333333333333", name: "Rincon Plumbing Co" },
} as const;
export { ORGS };

let n = 0;
export function row(partial: Partial<DataHomeRow> & { name: string }): DataHomeRow {
  n += 1;
  const org = ORGS.harbor;
  const base: DataHomeRow = {
    id: `table:${org.id}:row-${n}`,
    itemId: `row-${n}`,
    name: partial.name,
    kind: "table",
    organizationId: org.id,
    organizationName: org.name,
    tableId: `row-${n}`,
    parentName: null,
    updatedAt: "2026-09-30T12:00:00.000Z",
    createdBy: null,
    createdByName: null,
    mine: false,
    team: false,
    member: true,
    sharedWithMe: false,
    visibility: "internal",
    system: false,
    access: "org",
    records: null,
    changedBy: null,
    details: "",
    href: `/data/row-${n}`,
    publicHref: null,
    publicLabel: null,
    trouble: null,
    platformOwned: false,
    foundation: false,
    syncedFrom: null,
  };
  return { ...base, ...partial, id: partial.id ?? `${partial.kind ?? "table"}:${partial.organizationId ?? org.id}:row-${n}` };
}

export function corpus(): DataHomeRow[] {
  return [
    row({ name: "Patient Recall List", updatedAt: "2026-09-29T10:00:00.000Z", mine: true, access: "mine" }),
    row({ name: "Harbor Hygiene Schedule", updatedAt: "2026-09-20T10:00:00.000Z" }),
    row({ name: "Client Intake", kind: "form", parentName: "Patient Recall List", updatedAt: "2026-09-28T10:00:00.000Z" }),
    row({
      name: "Client Intake",
      organizationId: ORGS.titanium.id,
      organizationName: ORGS.titanium.name,
      kind: "form",
      updatedAt: "2026-09-27T10:00:00.000Z",
    }),
    row({
      name: "Roof Inspections",
      organizationId: ORGS.titanium.id,
      organizationName: ORGS.titanium.name,
      updatedAt: "2026-09-30T09:00:00.000Z",
      mine: true,
      access: "mine",
    }),
    row({
      name: "Job Board",
      kind: "dashboard",
      organizationId: ORGS.rincon.id,
      organizationName: ORGS.rincon.name,
      updatedAt: "2026-08-01T10:00:00.000Z",
      member: false,
      sharedWithMe: true,
      access: "shared",
    }),
    row({
      name: "Public Price Sheet",
      organizationId: ORGS.rincon.id,
      organizationName: ORGS.rincon.name,
      visibility: "public",
      member: false,
      access: "public",
      updatedAt: "2026-07-01T10:00:00.000Z",
    }),
  ];
}

/** 3,000 rows across 48 organizations — the many-company bound the spec tests at. */
export function bigCorpus(): DataHomeRow[] {
  const words = ["Intake", "Schedule", "Invoices", "Leads", "Crew", "Inspections", "Warranty", "Estimates", "Suppliers", "Permits"];
  const out: DataHomeRow[] = [];
  for (let i = 0; i < 3000; i += 1) {
    const org = i % 48;
    out.push(
      row({
        name: `${words[i % words.length]} ${Math.floor(i / 10)}`,
        organizationId: `org-${org}`,
        organizationName: org === 7 ? "Harbor Dental Group" : `Service Company ${org}`,
        kind: i % 5 === 0 ? "form" : "table",
        updatedAt: new Date(Date.parse("2026-09-30T00:00:00.000Z") - i * 3_600_000).toISOString(),
      }),
    );
  }
  out.push(row({ name: "Harbor Dental Recall", organizationId: "org-1", organizationName: "Service Company 1" }));
  return out;
}
