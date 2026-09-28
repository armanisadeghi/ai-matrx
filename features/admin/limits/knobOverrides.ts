// features/admin/limits/knobOverrides.ts
//
// The logic half of the admin Feature Knobs "every level" view: one key's
// platform default, every override any organization or person holds, and what
// a chosen organization + person actually gets. Arman 2026-09-26: "Use the
// Feature Knob system to create configurations that get set as the default for
// everyone in the admin dashboard, then overridden per-org and per-user as
// needed." — so a system admin sees and sets every level from one place.
//
// NOTHING HERE IS A NEW DOOR. Reads: `fetchPlatformKnobOverrides` (RLS
// `platform_admin_read`) and `fetchKnobDefinition` (`knob_index`, which admits a
// platform admin for any organization and any person). Writes: the door the KEY
// declares (`fetchKnobWriteDoor` + `writeKnobOverrideThroughDoor`) — the same
// path the organization Configuration page's exceptions use, so an `hr.` key
// still passes HR's own gate and files HR's own audit row.

import { knobChoiceLabel } from "@/lib/scoped-config/choices";
import { formatKnobValue, rungTitle } from "@/lib/scoped-config/ladder";
import {
  fetchKnobDefinition,
  fetchKnobWriteDoor,
  knobRefusalSentence,
  writeKnobOverrideThroughDoor,
  type PlatformKnobOverrideRow,
} from "@/lib/scoped-config/service";
import type { KnobScopeKindName, ScopedKnob } from "@/lib/scoped-config/types";

/** A person as the admin roster knows them. */
export type AdminPerson = {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  organizations: Array<{ id: string; name: string }>;
};

/** An organization as the admin roster knows it. */
export type AdminOrganization = { id: string; name: string; slug: string };

export type AdminKnobDirectory = {
  people: AdminPerson[];
  organizations: AdminOrganization[];
};

/** "Ana Ruiz" / "admin@admin.com" — a person is named, never shown as an id. */
export function personName(person: AdminPerson | undefined | null): string {
  if (!person) return "A person no longer on the roster";
  return person.display_name?.trim() || person.full_name?.trim() || person.email || "A person with no name or email";
}

/** A knob value in the registry's words ("On", "Never"), never its stored token. */
export function knobValueWords(knob: ScopedKnob, value: unknown): string {
  return knobChoiceLabel(knob, value) ?? formatKnobValue(value, knob.unit);
}

export type OverrideTableRow = {
  /** Stable identity: kind + organization + scope row. */
  id: string;
  kind: KnobScopeKindName;
  /** "Organization" / "Person" / "Table" … */
  levelLabel: string;
  /** Who the override is for, in words. */
  who: string;
  /** The organization it lives in (a person's override lives inside one). */
  organizationId: string;
  organizationName: string;
  scopeId: string;
  value: unknown;
  valueWords: string;
  setBy: string | null;
  setAt: string | null;
  note: string | null;
};

const LEVEL_ORDER: Record<string, number> = { organization: 0, user: 2 };

/** The rows of the override table, named from the roster, organizations first. */
export function overrideTableRows(
  knob: ScopedKnob,
  rows: PlatformKnobOverrideRow[],
  directory: AdminKnobDirectory,
): OverrideTableRow[] {
  const orgById = new Map(directory.organizations.map((org) => [org.id, org]));
  const personById = new Map(directory.people.map((person) => [person.id, person]));
  const orgName = (id: string) => orgById.get(id)?.name ?? "An organization no longer on the roster";
  return rows
    .map((row) => {
      const organizationName = orgName(row.organization_id);
      const who =
        row.scope_kind === "organization"
          ? organizationName
          : row.scope_kind === "user"
            ? personName(personById.get(row.scope_id))
            : `One ${rungTitle(row.scope_kind).toLowerCase()} in ${organizationName}`;
      return {
        id: `${row.scope_kind}:${row.organization_id}:${row.scope_id}`,
        kind: row.scope_kind,
        levelLabel: row.scope_kind === "user" ? "Person" : rungTitle(row.scope_kind),
        who,
        organizationId: row.organization_id,
        organizationName,
        scopeId: row.scope_id,
        value: row.value,
        valueWords: knobValueWords(knob, row.value),
        setBy: row.updated_by ? personName(personById.get(row.updated_by)) : null,
        setAt: row.updated_at,
        note: row.set_note,
      };
    })
    .sort(
      (a, b) =>
        (LEVEL_ORDER[a.kind] ?? 1) - (LEVEL_ORDER[b.kind] ?? 1) ||
        a.organizationName.localeCompare(b.organizationName) ||
        a.who.localeCompare(b.who),
    );
}

/** "3 overrides (1 organization, 2 people)" — what a collapsed row says. */
export function overrideCountWords(rows: Pick<OverrideTableRow, "kind">[]): string {
  if (rows.length === 0) return "No overrides";
  const orgs = rows.filter((row) => row.kind === "organization").length;
  const people = rows.filter((row) => row.kind === "user").length;
  const other = rows.length - orgs - people;
  const parts = [
    orgs ? `${orgs} organization${orgs === 1 ? "" : "s"}` : null,
    people ? `${people} ${people === 1 ? "person" : "people"}` : null,
    other ? `${other} other` : null,
  ].filter(Boolean);
  return `${rows.length} override${rows.length === 1 ? "" : "s"} (${parts.join(", ")})`;
}

export type EffectiveAnswer = {
  value: unknown;
  valueWords: string;
  /** Which layer decided it, in words. */
  decidedBy: string;
  origin: string;
};

/**
 * What ONE person in ONE organization actually gets for this key, and which
 * layer decided it — `knob_index`'s own resolution, never recomputed here.
 */
export function effectiveAnswer(
  resolved: ScopedKnob,
  context: { organizationName: string; person: AdminPerson | null },
): EffectiveAnswer {
  const origin = resolved.origin as string;
  const decidedBy =
    origin === "user"
      ? `${personName(context.person)}'s own override`
      : origin === "organization"
        ? `${context.organizationName}'s organization override`
        : origin === "platform_default"
          ? "the platform default"
          : origin === "missing"
            ? "nothing — this key has no value at any level"
            : `a ${rungTitle(origin).toLowerCase()} override in ${context.organizationName}`;
  return {
    value: resolved.effective_value,
    valueWords: knobValueWords(resolved, resolved.effective_value),
    decidedBy,
    origin,
  };
}

/** Resolve a key for an organization (+ optional person) through `knob_index`. */
export async function resolveKnobFor(options: {
  knob: ScopedKnob;
  organizationId: string;
  userId: string | null;
}): Promise<ScopedKnob> {
  const resolved = await fetchKnobDefinition({
    organizationId: options.organizationId,
    feature: options.knob.feature,
    key: options.knob.key,
    userId: options.userId ?? undefined,
  });
  if (!resolved) {
    throw new Error(`${options.knob.full_key} has no registry row for that organization, so there is no answer to show.`);
  }
  return resolved;
}

/**
 * Set (value) or remove (null) one override at the organization or person
 * level, through the door the key declares. Returns null on success, or the
 * door's refusal as one sentence.
 */
export async function writeAdminKnobOverride(options: {
  knob: ScopedKnob;
  kind: KnobScopeKindName;
  organizationId: string;
  scopeId: string;
  value: unknown;
}): Promise<string | null> {
  const door = await fetchKnobWriteDoor({
    fullKey: options.knob.full_key,
    organizationId: options.organizationId,
  });
  const result = await writeKnobOverrideThroughDoor({
    door,
    feature: options.knob.feature,
    key: options.knob.key,
    scopeKind: options.kind,
    scopeId: options.scopeId,
    organizationId: options.organizationId,
    value: options.value,
    note: options.value === null ? "Removed from the admin Feature Knobs register" : "Set from the admin Feature Knobs register",
  });
  return result.ok ? null : knobRefusalSentence(result as { reason?: string | null; detail?: string | null });
}

/**
 * The value an admin's typed draft means for this key. Closed choices never
 * reach here (they are picked, not typed).
 */
export function parseAdminDraft(knob: ScopedKnob, raw: string): { value?: unknown; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: `${knob.label} needs a value` };
  switch (knob.value_type) {
    case "number":
    case "integer": {
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) return { error: `${knob.label} needs a number` };
      if (knob.value_type === "integer" && !Number.isInteger(parsed)) return { error: `${knob.label} needs a whole number` };
      return { value: parsed };
    }
    case "boolean":
      return { value: trimmed === "true" };
    case "json":
      try {
        return { value: JSON.parse(trimmed) };
      } catch {
        return { error: `${knob.label} needs valid JSON` };
      }
    default:
      return { value: trimmed };
  }
}

let directoryPromise: Promise<AdminKnobDirectory> | null = null;

/**
 * The admin roster for naming and picking: people from `/api/admin/users`
 * (super-admin gated, the Accounts console's own door) and organizations from
 * that same console's directory door. Loaded once per page.
 */
export function loadAdminKnobDirectory(force = false): Promise<AdminKnobDirectory> {
  if (directoryPromise && !force) return directoryPromise;
  directoryPromise = (async () => {
    const [usersResponse, orgsResponse] = await Promise.all([
      fetch("/api/admin/users", { cache: "no-store" }),
      fetch("/api/admin/users/organizations", { cache: "no-store" }),
    ]);
    const usersJson = (await usersResponse.json()) as { users?: AdminPerson[]; error?: string };
    const orgsJson = (await orgsResponse.json()) as {
      directory?: { organizations: AdminOrganization[] };
      error?: string;
    };
    if (!usersResponse.ok) throw new Error(usersJson.error ?? `The people roster could not be read (HTTP ${usersResponse.status}).`);
    if (!orgsResponse.ok) throw new Error(orgsJson.error ?? `The organization directory could not be read (HTTP ${orgsResponse.status}).`);
    return {
      people: (usersJson.users ?? []).map((user) => ({
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        full_name: user.full_name,
        organizations: (user.organizations ?? []).map((org) => ({ id: org.id, name: org.name })),
      })),
      organizations: (orgsJson.directory?.organizations ?? []).map((org) => ({ id: org.id, name: org.name, slug: org.slug })),
    };
  })();
  directoryPromise.catch(() => {
    directoryPromise = null;
  });
  return directoryPromise;
}
