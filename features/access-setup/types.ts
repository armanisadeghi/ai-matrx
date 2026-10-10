// features/access-setup/types.ts
//
// The shapes the setup panel reads, parsed from the doors' JSON (iam.record_access_setup,
// hr.hr_review_cycle_access_setup) and the `access_setup` block a creating door returns.
// Parsing never throws: an unreadable answer becomes null and the caller says so.

export type SeatSource = "resolver" | "grant" | "added" | "fallback" | "role";

export interface SeatPerson {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface SeatHolder extends SeatPerson {
  source: SeatSource;
  removable: boolean;
}

export interface SeatCell {
  part: string;
  /** The declaration's level for this cell, as the door returns it (display only — never a gate here). */
  level: string;
  rows: string | null;
  /** The stage (or any of the stages) the cell opens at; null = always. */
  fromStage: string[] | null;
  reached: boolean;
}

export interface SeatView {
  key: string;
  required: boolean;
  many: boolean;
  resolver: string | null;
  mayChange: boolean;
  fallbackOnly: boolean;
  holders: SeatHolder[];
  excluded: SeatPerson[];
  cells: SeatCell[];
}

export interface RecordAccessSetup {
  entityType: string;
  recordId: string;
  organization: { id: string; name: string };
  mySeats: string[];
  myOrgRole: string | null;
  stagesReached: string[];
  seats: SeatView[];
  confirmed: { at: string; by: SeatPerson | null } | null;
  needsConfirm: boolean;
  candidates: SeatPerson[];
}

export interface CycleAccessSetup {
  cycle: { id: string; name: string; status: string };
  organization: { id: string; name: string };
  myOrgRole: string | null;
  seats: { key: string; holders: SeatHolder[]; fallbackOnly: boolean }[];
  knobs: { key: string; value: unknown }[];
  reviews: { reviewId: string; employeeName: string; managerName: string; unusual: boolean }[];
  needsConfirm: boolean;
}

/** What a creating door returns so the one client helper can open the panel. */
export interface AccessSetupAfterCreate {
  headType: string;
  ids: string[];
  cycleId: string | null;
  needsConfirm: boolean;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const recs = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const SOURCES: readonly SeatSource[] = ["resolver", "grant", "added", "fallback", "role"];
const source = (v: unknown): SeatSource => (SOURCES.includes(v as SeatSource) ? (v as SeatSource) : "resolver");

export function parsePerson(raw: Rec): SeatPerson | null {
  const userId = str(raw.user_id);
  if (!userId) return null;
  return { userId, name: str(raw.name) ?? str(raw.email) ?? "Someone", email: str(raw.email), avatarUrl: str(raw.avatar_url) };
}

function parseHolder(raw: Rec): SeatHolder | null {
  const p = parsePerson(raw);
  return p ? { ...p, source: source(raw.source), removable: raw.removable === true } : null;
}

function parseOrg(raw: unknown): { id: string; name: string } | null {
  if (!isRec(raw)) return null;
  const id = str(raw.id);
  return id ? { id, name: str(raw.name) ?? "this organization" } : null;
}

function parseCell(raw: Rec): SeatCell | null {
  const part = str(raw.part);
  if (!part) return null;
  const from = raw.from_stage;
  return {
    part,
    level: str(raw.level) ?? "viewer",
    rows: str(raw.rows),
    fromStage: typeof from === "string" ? [from] : Array.isArray(from) ? strs(from) : null,
    reached: raw.reached !== false,
  };
}

export function parseRecordAccessSetup(raw: Rec): RecordAccessSetup | null {
  const organization = parseOrg(raw.organization);
  const entityType = str(raw.entity_type);
  const recordId = str(raw.record_id);
  if (!organization || !entityType || !recordId) return null;
  const confirmed = isRec(raw.confirmed) && str(raw.confirmed.at)
    ? { at: str(raw.confirmed.at) as string, by: isRec(raw.confirmed.by) ? parsePerson(raw.confirmed.by) : null }
    : null;
  return {
    entityType,
    recordId,
    organization,
    mySeats: strs(raw.my_seats),
    myOrgRole: str(raw.my_org_role),
    stagesReached: strs(raw.stages_reached),
    seats: recs(raw.seats).flatMap((s) => {
      const key = str(s.key);
      if (!key) return [];
      return [{
        key,
        required: s.required === true,
        many: s.many === true,
        resolver: str(s.resolver),
        mayChange: s.may_change === true,
        fallbackOnly: s.fallback_only === true,
        holders: recs(s.holders).map(parseHolder).filter((h): h is SeatHolder => h !== null),
        excluded: recs(s.excluded).map(parsePerson).filter((p): p is SeatPerson => p !== null),
        cells: recs(s.cells).map(parseCell).filter((c): c is SeatCell => c !== null),
      }];
    }),
    confirmed,
    needsConfirm: raw.needs_confirm === true,
    candidates: recs(raw.candidates).map(parsePerson).filter((p): p is SeatPerson => p !== null),
  };
}

export function parseCycleAccessSetup(raw: Rec): CycleAccessSetup | null {
  const organization = parseOrg(raw.organization);
  const c = isRec(raw.cycle) ? raw.cycle : null;
  const cycleId = c ? str(c.id) : null;
  if (!organization || !c || !cycleId) return null;
  return {
    cycle: { id: cycleId, name: str(c.name) ?? "Review cycle", status: str(c.status) ?? "open" },
    organization,
    myOrgRole: str(raw.my_org_role),
    seats: recs(raw.seats).flatMap((s) => {
      const key = str(s.key);
      return key
        ? [{ key, fallbackOnly: s.fallback_only === true, holders: recs(s.holders).map(parseHolder).filter((h): h is SeatHolder => h !== null) }]
        : [];
    }),
    knobs: recs(raw.knobs).flatMap((k) => (str(k.key) ? [{ key: str(k.key) as string, value: k.value }] : [])),
    reviews: recs(raw.reviews).flatMap((r) => {
      const reviewId = str(r.review_id);
      return reviewId
        ? [{ reviewId, employeeName: str(r.employee_name) ?? "Employee", managerName: str(r.manager_name) ?? "Manager", unusual: r.unusual === true }]
        : [];
    }),
    needsConfirm: raw.needs_confirm === true,
  };
}

/** The `access_setup` block of a creating door's answer, or null when it carries none. */
export function parseAfterCreate(raw: unknown): AccessSetupAfterCreate | null {
  if (!isRec(raw)) return null;
  const headType = str(raw.head_type);
  const ids = strs(raw.ids);
  if (!headType || ids.length === 0) return null;
  return { headType, ids, cycleId: str(raw.cycle_id), needsConfirm: raw.needs_confirm === true };
}
