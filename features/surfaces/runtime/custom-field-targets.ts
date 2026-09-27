/**
 * features/surfaces/runtime/custom-field-targets.ts
 *
 * THE AGENT TWIN OF "ADD FIELD" (page-pass 2026-09-27, /chat/message-templates/<id>).
 *
 * `@ai-matrx/records-ui`'s `CustomFieldsSection` renders on any record page that
 * embeds `EntityCustomFields` (one line per page, 643 table types). A person on
 * that page could add a custom field; an agent on the same page could not —
 * nothing offered it. Declaring a target on every manifest would be 643 copies
 * of one sentence, so this is a PLATFORM target like `surface_feedback` and
 * `window_form_fields`: declared here once, belonging to no manifest, offered
 * whenever at least one custom-fields section is mounted, and routed by the
 * writeback seam (`surface-writeback.ts`) to the section's own door.
 *
 * The section owns the write: it hands its host a door (records-ui
 * `agentDoor` prop → `CustomFieldsAgentDoor`), which checks the whole request
 * against what it holds and adds each field through
 * `custom.entity_field_declare`, reading it back. This file only keeps the
 * mounted doors, words the target, and reports part-way results honestly.
 *
 * The door's shape is declared structurally here (not imported) so this seam
 * never depends on a package version; `EntityCustomFields` passes the real one.
 */
import type { SurfaceWriteTarget } from "@/features/surfaces/types";
import type { SurfaceWriteOutcome } from "./SurfaceRuntimeContext";

export const CUSTOM_FIELDS_TARGET_NAME = "custom_fields_add";
export const CUSTOM_FIELDS_MAX_PER_WRITE = 10;

export interface CustomFieldAddRequest {
  label: string;
  type?: string | undefined;
}

export type CustomFieldAddResult =
  | { ok: true; field_id: string; label: string; type: string }
  | { ok: false; message: string };

export interface CustomFieldsAgentState {
  entityToken: string;
  recordId: string;
  entityLabel: string | null;
  mayAdd: boolean | null;
  refusal: string | null;
  fields: ReadonlyArray<{ key: string; label: string; type: string }>;
  types: ReadonlyArray<{ value: string; label: string }>;
}

export interface CustomFieldsAgentDoor {
  entityToken: string;
  recordId: string;
  state: () => CustomFieldsAgentState;
  check: (requests: readonly CustomFieldAddRequest[]) => string[];
  addField: (request: CustomFieldAddRequest) => Promise<CustomFieldAddResult>;
}

export interface CustomFieldsWriteValue {
  entity?: string;
  record_id?: string;
  fields: CustomFieldAddRequest[];
}

// ── the mounted doors ─────────────────────────────────────────────────────────

let nextDoorId = 0;
const doors = new Map<number, CustomFieldsAgentDoor>();

/** Called by a mounted section (through `EntityCustomFields`). Returns unregister. */
export function registerCustomFieldsDoor(door: CustomFieldsAgentDoor): () => void {
  const id = ++nextDoorId;
  doors.set(id, door);
  return () => {
    doors.delete(id);
  };
}

export function listCustomFieldsDoors(): CustomFieldsAgentDoor[] {
  return [...doors.values()];
}

export function hasCustomFieldsDoors(): boolean {
  return doors.size > 0;
}

/** Test seam. */
export function __resetCustomFieldsDoors(): void {
  doors.clear();
}

// ── the target ────────────────────────────────────────────────────────────────

function describeDoor(door: CustomFieldsAgentDoor): string {
  const s = door.state();
  const what = s.entityLabel ?? s.entityToken;
  const held = s.fields.length > 0 ? s.fields.map((f) => `${f.label} (${f.type})`).join(", ") : "none yet";
  const may =
    s.mayAdd === true
      ? "you may add"
      : s.mayAdd === null
        ? "still checking who may add"
        : `adding is refused: ${s.refusal ?? "this person may not add a field here"}`;
  return `entity "${s.entityToken}" (${what}, record ${s.recordId}) — fields: ${held}; ${may}`;
}

const BASE_DESCRIPTION =
  "Add custom fields (new columns) to the kind of record shown on this page — SAVED immediately after the person approves, and every record of that kind gets the field (empty until filled in). " +
  'Value: { "entity": "<entity token, required only when more than one section is listed>", "fields": [{ "label": "<the field\'s name as a person reads it>", "type": "<one of the types below; default text>" }] } — 1 to ' +
  `${CUSTOM_FIELDS_MAX_PER_WRITE} fields. ` +
  "Refused before the person is asked: a name already used, a name asked for twice, an unknown type, or a person who may not add fields (the store's reason is returned). " +
  "This adds the FIELD only; it does not fill in a value.";

/** The target, worded with the sections that are mounted right now. */
export function customFieldsTarget(): SurfaceWriteTarget {
  const mounted = listCustomFieldsDoors();
  const types = mounted[0]?.state().types ?? [];
  const typeLine = types.length > 0 ? ` Types: ${types.map((t) => `${t.value} (${t.label})`).join(", ")}.` : "";
  const sections =
    mounted.length > 0 ? ` Sections on this page: ${mounted.map(describeDoor).join(" | ")}.` : "";
  return {
    name: CUSTOM_FIELDS_TARGET_NAME,
    label: "Add custom fields",
    description: `${BASE_DESCRIPTION}${typeLine}${sections}`,
    valueType: "object",
    mode: "entity",
    applyPolicy: "ask",
  };
}

// ── the value ─────────────────────────────────────────────────────────────────

/**
 * Every problem with the value, all at once — the shape, which section it
 * means, and the section's own check. `[]` means it may go to the person.
 */
export function customFieldsProblems(
  value: unknown,
  mounted: readonly CustomFieldsAgentDoor[] = listCustomFieldsDoors(),
): { problems: string[]; door: CustomFieldsAgentDoor | null; fields: CustomFieldAddRequest[] } {
  const none = { door: null, fields: [] as CustomFieldAddRequest[] };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...none, problems: ['Send an object: { "entity"?: "<token>", "fields": [{ "label", "type"? }] }. Nothing was changed.'] };
  }
  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  const unknownKeys = Object.keys(record).filter((k) => !["entity", "record_id", "fields"].includes(k));
  if (unknownKeys.length > 0) {
    problems.push(`It does not take ${unknownKeys.map((k) => `"${k}"`).join(", ")} — only entity, record_id and fields.`);
  }
  const rawFields = record.fields;
  const fields: CustomFieldAddRequest[] = [];
  if (!Array.isArray(rawFields) || rawFields.length === 0) {
    problems.push('"fields" must be a list of 1 or more { "label", "type"? }.');
  } else {
    if (rawFields.length > CUSTOM_FIELDS_MAX_PER_WRITE) {
      problems.push(`At most ${CUSTOM_FIELDS_MAX_PER_WRITE} fields per write; this asked for ${rawFields.length}.`);
    }
    rawFields.forEach((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        problems.push(`Field ${index + 1} must be an object { "label", "type"? }.`);
        return;
      }
      const f = raw as Record<string, unknown>;
      const extra = Object.keys(f).filter((k) => k !== "label" && k !== "type");
      if (extra.length > 0) {
        problems.push(`Field ${index + 1} does not take ${extra.map((k) => `"${k}"`).join(", ")} — only label and type.`);
      }
      if (f.type !== undefined && typeof f.type !== "string") {
        problems.push(`Field ${index + 1}: "type" must be a string.`);
      }
      fields.push({
        label: typeof f.label === "string" ? f.label : "",
        ...(typeof f.type === "string" ? { type: f.type } : {}),
      });
    });
  }

  let door: CustomFieldsAgentDoor | null = null;
  const entity = typeof record.entity === "string" ? record.entity.trim() : "";
  const recordId = typeof record.record_id === "string" ? record.record_id.trim() : "";
  if (mounted.length === 0) {
    problems.push("No custom-fields section is open on this page.");
  } else {
    const matches = mounted.filter(
      (d) => (!entity || d.entityToken === entity) && (!recordId || d.recordId === recordId),
    );
    // Two sections for ONE entity add to the same kind — any of them serves.
    const tokens = new Set(matches.map((d) => d.entityToken));
    if (matches.length === 0) {
      problems.push(
        `No open section matches${entity ? ` entity "${entity}"` : ""}${recordId ? ` record ${recordId}` : ""}. Open sections: ${mounted.map((d) => d.entityToken).join(", ")}.`,
      );
    } else if (tokens.size > 1) {
      problems.push(`Several sections are open (${[...tokens].join(", ")}); name one with "entity".`);
    } else {
      door = matches[0];
    }
  }
  if (door && fields.length > 0) problems.push(...door.check(fields));
  return { problems, door, fields };
}

function refusalSentence(problems: readonly string[]): string {
  return `${problems.join(" ")} Nothing was changed.`;
}

export function validateCustomFieldsWrite(value: unknown): void {
  const { problems } = customFieldsProblems(value);
  if (problems.length > 0) throw new Error(refusalSentence(problems));
}

/**
 * Add each field in order. A part-way failure says exactly what landed and
 * what was not attempted, so a retry never adds a field twice.
 */
export async function applyCustomFieldsWrite(value: unknown): Promise<SurfaceWriteOutcome> {
  const { problems, door, fields } = customFieldsProblems(value);
  if (problems.length > 0 || !door) throw new Error(refusalSentence(problems));
  const added: Array<{ field_id: string; label: string; type: string }> = [];
  for (let i = 0; i < fields.length; i += 1) {
    const result = await door.addField(fields[i]);
    if (!result.ok) {
      const rest = fields.slice(i + 1).map((f) => `"${f.label.trim()}"`);
      const landed = added.length > 0 ? `Added ${added.length} of ${fields.length}: ${added.map((a) => `"${a.label}"`).join(", ")}. ` : "";
      throw new Error(
        `${landed}"${fields[i].label.trim()}" was not added: ${result.message}` +
          (rest.length > 0 ? ` Not attempted: ${rest.join(", ")}.` : ""),
      );
    }
    added.push({ field_id: result.field_id, label: result.label, type: result.type });
  }
  const what = door.state().entityLabel ?? door.entityToken;
  return {
    summary: `Added ${added.length} field${added.length === 1 ? "" : "s"} to ${what}: ${added.map((a) => `"${a.label}" (${a.type})`).join(", ")}.`,
    data: { entity: door.entityToken, fields: added },
  };
}
