// features/education/classes/classHubAgentWrites.ts
//
// Validation for the agent write targets on one class's hub
// (`matrx-user/education-class`). Pure — no React, no store — so every rule is
// testable. Every problem is a sentence the agent can act on, and a list that
// is partly wrong is refused whole, listing EVERY problem at once.
//
// `update_class` reuses My Classes' `parseUpdateClassesValue` (one class, no
// id — the hub IS the class), so both pages read a class object identically.

import { parseUpdateClassesValue, type ClassUpdatePlan, type CurrentClass } from "./classAgentWrites";
import { ASSIGNABLE_TOKENS, CLASS_CONTENT_TOKENS } from "./constants";
import type { AssignableToken } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The most items one hub list write may carry. */
export const MAX_HUB_ITEMS_PER_WRITE = 25;

/** Read `update_class`: one object of fields to change on THIS class. */
export function parseUpdateClassValue(
  value: unknown,
  current: CurrentClass,
  allOwned: readonly CurrentClass[],
): ClassUpdatePlan {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      'update_class expects a JSON OBJECT of the fields to change, e.g. { "description": "Honors chemistry" }.',
    );
  const fields = { ...(value as Record<string, unknown>) };
  if ("id" in fields && fields.id !== current.id && fields.id != null)
    throw new Error(
      `update_class changes only the class open on this page (${current.id}); remove "id" or use My Classes to change another class.`,
    );
  delete fields.id;
  try {
    const [plan] = parseUpdateClassesValue([{ ...fields, id: current.id }], allOwned);
    return plan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/update_classes(\[0\])?/g, "update_class"));
  }
}

export interface HubItem {
  token: string;
  id: string;
}

export interface HubAssignItem extends HubItem {
  token: AssignableToken;
  dueDate: string | null;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Accept a bare array, or `{ items: [...] }`. */
function readList(target: string, value: unknown): unknown[] {
  const list =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : value;
  if (!Array.isArray(list))
    throw new Error(
      `${target} expects a JSON ARRAY of { token, id } objects, e.g. [{ "token": "fc_set", "id": "…" }]; for one item send a list of one.`,
    );
  if (list.length === 0) throw new Error(`${target} needs at least one item.`);
  if (list.length > MAX_HUB_ITEMS_PER_WRITE)
    throw new Error(
      `${target} takes at most ${MAX_HUB_ITEMS_PER_WRITE} items per write; received ${list.length}. Split the list.`,
    );
  return list;
}

/**
 * Read a list of { token, id } items. `allowed` limits the tokens; `mustBeIn`
 * (keys `${token}:${id}`) requires each item to be present, `mustNotBeIn`
 * refuses items already present. Refuses the whole list with every problem.
 */
function parseItems(
  target: string,
  value: unknown,
  opts: {
    allowed: readonly string[];
    mustBeIn?: ReadonlySet<string>;
    mustBeInLabel?: string;
    mustNotBeIn?: ReadonlySet<string>;
    mustNotBeInLabel?: string;
    withDueDate?: boolean;
  },
): (HubItem & { dueDate?: string | null })[] {
  const list = readList(target, value);
  const problems: string[] = [];
  const seen = new Set<string>();
  const out: (HubItem & { dueDate?: string | null })[] = [];
  list.forEach((entry, i) => {
    const where = `${target}[${i}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${where} must be an object { token, id }.`);
      return;
    }
    const raw = entry as Record<string, unknown>;
    const token = typeof raw.token === "string" ? raw.token.trim() : "";
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    let ok = true;
    if (!opts.allowed.includes(token)) {
      problems.push(
        `${where}.token must be one of ${opts.allowed.map((t) => `"${t}"`).join(", ")}; received ${JSON.stringify(raw.token)}.`,
      );
      ok = false;
    }
    if (!UUID_RE.test(id)) {
      problems.push(`${where}.id must be the record's UUID; received ${JSON.stringify(raw.id)}.`);
      ok = false;
    }
    let dueDate: string | null | undefined;
    if (opts.withDueDate) {
      const due = raw.due_date;
      if (due === undefined || due === null || due === "") dueDate = null;
      else if (typeof due === "string" && isIsoDate(due.trim())) dueDate = due.trim();
      else {
        problems.push(
          `${where}.due_date must be a real date "YYYY-MM-DD" or null; received ${JSON.stringify(due)}.`,
        );
        ok = false;
      }
    }
    if (!ok) return;
    const key = `${token}:${id}`;
    if (seen.has(key)) {
      problems.push(`${where} repeats ${token} ${id}; send each item once.`);
      return;
    }
    seen.add(key);
    if (opts.mustBeIn && !opts.mustBeIn.has(key)) {
      problems.push(`${where} (${token} ${id}) is not in ${opts.mustBeInLabel}.`);
      return;
    }
    if (opts.mustNotBeIn?.has(key)) {
      problems.push(`${where} (${token} ${id}) is already in ${opts.mustNotBeInLabel}.`);
      return;
    }
    out.push({ token, id, ...(opts.withDueDate ? { dueDate: dueDate ?? null } : {}) });
  });
  if (problems.length > 0)
    throw new Error(
      `${target} was refused and nothing was changed:\n- ${problems.join("\n- ")}`,
    );
  return out;
}

export function parseAttachContentValue(
  value: unknown,
  attachedKeys: ReadonlySet<string>,
): HubItem[] {
  return parseItems("attach_content", value, {
    allowed: CLASS_CONTENT_TOKENS,
    mustNotBeIn: attachedKeys,
    mustNotBeInLabel: "study_content",
  });
}

export function parseDetachContentValue(
  value: unknown,
  attachedKeys: ReadonlySet<string>,
): HubItem[] {
  return parseItems("detach_content", value, {
    allowed: CLASS_CONTENT_TOKENS,
    mustBeIn: attachedKeys,
    mustBeInLabel: "study_content",
  });
}

export function parseAssignResourcesValue(value: unknown): HubAssignItem[] {
  return parseItems("assign_resources", value, {
    allowed: ASSIGNABLE_TOKENS,
    withDueDate: true,
  }).map((item) => ({
    token: item.token as AssignableToken,
    id: item.id,
    dueDate: item.dueDate ?? null,
  }));
}

export function parseUnassignResourcesValue(
  value: unknown,
  assignedKeys: ReadonlySet<string>,
): HubItem[] {
  return parseItems("unassign_resources", value, {
    allowed: ASSIGNABLE_TOKENS,
    mustBeIn: assignedKeys,
    mustBeInLabel: "assignments",
  });
}
