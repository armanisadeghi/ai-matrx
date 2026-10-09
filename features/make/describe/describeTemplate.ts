// features/make/describe/describeTemplate.ts — lane CHAIR-DESCRIBE (v7): the describe box's one pipe.
//
// ONE SENTENCE → ONE TEMPLATE SPEC → THE TEMPLATE FAMILY'S OWN INSTALL DOOR.
// Brief: common-docs projects/data-doctrine-adoption/v6/MANDATE-BRIEF-SENTENCE-TO-TEMPLATE.md.
//
// The spec is written by the mandate `make.describe_template` (its holder is the agent; this file never
// writes an instruction — agents-never-author-agents). What THIS file owns is mechanical:
//   1. the provision — the sentence, the organization's facts, its tables with their fields (drafted by
//      the store's own custom.template_from_tables), the closed vocabularies read from @ai-matrx/records
//      at call time, and today;
//   2. the keys a one-off spec carries for the install door and nobody else (catalogue id, version, the
//      template agent slot), filled in, never invented by the model;
//   3. the check — the package's describeCheck (automatic fixes, then validateTemplate "describe") — whose first problem is said in one line;
//   4. the declaration (custom.template_declare 'org') whose id the gallery's runTemplateDoor installs.
//
// Pure parts are exported for the guard; the doors take a client.

import {
  capabilitiesUsed,
  DEFAULT_TEMPLATE_AGENT,
  describeCheck,
  describeSpec,
  describeVocabulary,
  parseDescribeTemplate,
  safeReuses,
  templateDeclaration,
  type ExistingTable as PackageExistingTable,
  type TemplateSpec,
} from "@ai-matrx/records/templates";
import type { SupabaseClient } from "@supabase/supabase-js";

// The mandate's `vocabulary` value and the spec shape are the package's (describeVocabulary, describeSpec): one copy.
export { describeSpec, describeVocabulary };

export interface DescribeOrganization {
  name: string;
  industry: string | null;
  time_zone: string;
  working_hours: string | null;
}

export interface ExistingTable {
  id: string;
  name: string;
  fields: Array<{ key: string; label: string; kind: string; choices?: string[] }>;
}

/** Today in a time zone, YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The mandate's five variables (provision `make.describe_template`). */
export function describeVariables(sentence: string, organization: DescribeOrganization, tables: ExistingTable[], now = new Date()) {
  return {
    sentence,
    organization: JSON.stringify(organization),
    existing_tables: JSON.stringify(tables),
    vocabulary: JSON.stringify(describeVocabulary()),
    today: todayIn(organization.time_zone, now),
  };
}

/** What the mandate answers: the spec, one line per assumption, and the existing tables it meant. */
export interface DescribeAnswer {
  template: Record<string, unknown>;
  notes: string[];
  reuses: Array<{ token: string; existing_table_id: string }>;
}

/** The mandate answered, but not in a shape the browser can use. Marks the failure so the box says it plainly. */
export class AnswerRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnswerRefused";
  }
}

/** Narrow the mandate's JSON; a missing spec throws in one line. */
export function coerceDescribeAnswer(value: unknown): DescribeAnswer {
  const v = (value ?? {}) as Record<string, unknown>;
  const template = v.template;
  if (!template || typeof template !== "object" || Array.isArray(template)) throw new Error("The answer held no template.");
  const notes = Array.isArray(v.notes) ? v.notes.filter((n): n is string => typeof n === "string") : [];
  const reuses = Array.isArray(v.reuses) ? (v.reuses as DescribeAnswer["reuses"]).filter((r) => r && typeof r.token === "string") : [];
  // The agent's stored schema carries the deep parts as JSON text; the package's ONE deserializer opens them.
  return { template: parseDescribeTemplate(template as Record<string, unknown>), notes, reuses };
}

/**
 * The check's answer: `spec` is the spec AFTER the package's automatic fixes (what is declared and installed),
 * `autoFixes` one line per fix made. A failure is said in one line — the first problem that REMAINS after the
 * fixes, and how many more.
 */
export type DescribeCheck =
  | { ok: true; spec: TemplateSpec; autoFixes: string[] }
  | { ok: false; line: string; problems: Array<{ at: string; says: string }>; spec: TemplateSpec; autoFixes: string[] };

/** describeCheck (automatic fixes, then validateTemplate "describe" profile) on the mandate's template. */
export function checkDescribeTemplate(template: Record<string, unknown>, existingTables: ExistingTable[] = []): DescribeCheck {
  const r = describeCheck(template, { existingTables: existingTables as PackageExistingTable[] });
  if (!r.problems.length) return { ok: true, spec: r.spec, autoFixes: r.autoFixes };
  const [first] = r.problems;
  const more = r.problems.length - 1;
  return {
    ok: false,
    line: `${first?.says ?? "The setup did not pass the store's check."}${more > 0 ? ` (+${more} more)` : ""}`,
    problems: r.problems,
    spec: r.spec,
    autoFixes: r.autoFixes,
  };
}

/**
 * THE BOX NEVER CHANGES A TABLE THE PERSON ALREADY HAS: run BEFORE the check and the bind. A reuse whose table the template
 * declares with any field the existing table lacks (or a renamed field, a changed kind or choices) becomes a NEW table with
 * its own name, and a note says so; only link-only reuses remain to bind. The package owns the rule (safeReuses).
 */
export function applySafeReuses(answer: DescribeAnswer, existing: ExistingTable[]): { template: Record<string, unknown>; reuses: DescribeAnswer["reuses"]; notes: string[] } {
  const r = safeReuses(describeSpec(answer.template), answer.reuses, existing as PackageExistingTable[]);
  return { template: r.spec as unknown as Record<string, unknown>, reuses: r.reuses, notes: r.notes };
}

/**
 * REUSE, NEVER DUPLICATE: each table the mandate said it meant (`reuses`) binds to the organization's own
 * table (`bindsTo`) — the install makes no second one, adds only the fields it lacks and links the new
 * tables to it. A reuse that names a token the spec lacks, or a table the organization does not have, binds
 * nothing (the table is made, as the spec says).
 */
export function bindReuses(spec: TemplateSpec, reuses: DescribeAnswer["reuses"], existing: ExistingTable[]): TemplateSpec {
  if (!reuses.length) return spec;
  const byId = new Map(existing.map((t) => [t.id, t]));
  const want = new Map(reuses.filter((r) => byId.has(r.existing_table_id)).map((r) => [r.token, byId.get(r.existing_table_id)!]));
  return {
    ...spec,
    tables: spec.tables.map((t) => {
      const e = want.get(t.token);
      return e ? { ...t, bindsTo: { tableId: e.id, fields: e.fields.map((f) => f.key).filter(Boolean) } } : t;
    }),
  };
}

/**
 * The declaration custom.template_declare('org') takes: the checked spec, plus the keys the install door
 * needs and a one-off spec does not own — a catalogue id unique to this run, and the template agent slot
 * (the platform's default reader, no variables; the describe box runs no host agent step). It is declared
 * `ephemeral`: on no template shelf until the person presses "Save as my template".
 */
export function describeDeclaration(spec: TemplateSpec, organizationId: string, stamp: string): Record<string, unknown> {
  const full = {
    ...spec,
    ephemeral: true,
    catalogueId: `DESCRIBE-${stamp}`.slice(0, 64),
    strengths: [],
    // The describe profile works `requires` out; the gallery card reads it.
    requires: [...capabilitiesUsed(spec)],
    agent: { platformAgent: { id: DEFAULT_TEMPLATE_AGENT.id, name: DEFAULT_TEMPLATE_AGENT.name }, name: DEFAULT_TEMPLATE_AGENT.name, variables: [] },
  } as unknown as TemplateSpec;
  return templateDeclaration(full as never, organizationId) as unknown as Record<string, unknown>;
}

// ─── the doors ──────────────────────────────────────────────────────────────

/** The organization's facts: its name and, when its settings carry them, industry, time zone and hours. */
export async function readOrganizationFacts(client: SupabaseClient, organizationId: string): Promise<DescribeOrganization> {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { data } = await client.schema("iam").from("organizations").select("name, settings").eq("id", organizationId).maybeSingle();
  const row = (data ?? {}) as { name?: string; settings?: Record<string, unknown> | null };
  const st = row.settings ?? {};
  const text = (k: string) => (typeof st[k] === "string" && (st[k] as string).trim() ? (st[k] as string).trim() : null);
  return {
    name: row.name?.trim() || "My organization",
    industry: text("industry"),
    time_zone: text("timezone") ?? text("time_zone") ?? browserZone,
    working_hours: text("working_hours") ?? text("hours"),
  };
}

/**
 * The organization's own tables with their fields, drafted by the store (custom.template_from_tables, no
 * rows) — the same door "Save as template" reads. Capped: a describe answer needs names, not a census.
 */
export async function readExistingTables(
  client: SupabaseClient,
  organizationId: string,
  tables: Array<{ id: string; name: string }>,
): Promise<ExistingTable[]> {
  const pick = tables.slice(0, 25);
  if (!pick.length) return [];
  const drafted = await client.schema("custom").rpc("template_from_tables", {
    p_organization_id: organizationId,
    p_table_ids: pick.map((t) => t.id),
    p_include_rows: false,
    p_rows_per_table: 0,
  });
  if (drafted.error) return pick.map((t) => ({ id: t.id, name: t.name, fields: [] }));
  const spec = ((drafted.data ?? {}) as { spec?: { tables?: Array<{ name: string; fields?: Array<Record<string, unknown>> }> } }).spec;
  const byName = new Map((spec?.tables ?? []).map((t) => [t.name, t]));
  return pick.map((t) => ({
    id: t.id,
    name: t.name,
    fields: (byName.get(t.name)?.fields ?? []).map((f) => ({
      key: String(f.key ?? ""),
      label: String(f.label ?? ""),
      kind: String(f.parityType ?? ""),
      ...(Array.isArray(f.choices) ? { choices: f.choices as string[] } : {}),
    })),
  }));
}

/** Declare the checked spec as the organization's own template; its id is what the install door takes. */
export async function declareDescribeSpec(client: SupabaseClient, organizationId: string, spec: TemplateSpec, stamp: string): Promise<string> {
  let declaration: Record<string, unknown>;
  try {
    declaration = describeDeclaration(spec, organizationId, stamp);
  } catch (err) {
    throw new Error(`The setup could not be planned: ${err instanceof Error ? err.message : String(err)}`);
  }
  const declared = await client.schema("custom").rpc("template_declare", { p_scope: "org", p_spec: declaration as never });
  if (declared.error) throw new Error(declared.error.message);
  return (declared.data as unknown as { template_id: string }).template_id;
}

/**
 * REATTACH, NEVER REBUILD: the Space the Space Builder made for this run, when its step was started before (a reload, a
 * paused tab, a stream that dropped while the server kept building). The first page the agent created in this organization,
 * by this person, since the step started. Null when none landed yet.
 */
export async function findBuiltSpace(client: SupabaseClient, organizationId: string, sinceMs: number): Promise<{ id: string; title: string } | null> {
  const { data: session } = await client.auth.getSession();
  const me = session.session?.user.id;
  if (!me) return null;
  const { data } = await client
    .schema("content")
    .from("document")
    .select("id, title")
    .eq("organization_id", organizationId)
    .eq("created_by", me)
    .eq("last_origin", "agent")
    .is("deleted_at", null)
    .gte("created_at", new Date(sinceMs - 5_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(1);
  const row = (data ?? [])[0] as { id: string; title: string | null } | undefined;
  return row ? { id: row.id, title: row.title ?? "" } : null;
}
