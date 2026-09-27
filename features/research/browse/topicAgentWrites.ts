// features/research/browse/topicAgentWrites.ts
//
// The pure parsers behind the topic list's agent write targets (create_topics /
// update_topics / delete_topics). Each reads the agent's WHOLE list and throws a
// sentence the agent can act on, before the person's approval card is shown;
// nothing here saves.

import {
  readCollectionList,
  refuseRepeats,
} from "@/features/surfaces/runtime/collection-write-targets";
import type { ResearchTopicListRow } from "./types";

const AUTONOMY = ["auto", "semi", "manual"] as const;
type Autonomy = (typeof AUTONOMY)[number];

export interface CreatePlan {
  name: string;
  description: string | null;
  autonomy_level: Autonomy;
}

export interface UpdatePlan {
  id: string;
  previousName: string;
  name?: string;
  description?: string | null;
  autonomy_level?: Autonomy;
  changed: string[];
}

function asObject(target: string, item: unknown, i: number): Record<string, unknown> {
  if (item === null || typeof item !== "object" || Array.isArray(item))
    throw new Error(`${target}: item ${i + 1} must be an object.`);
  return item as Record<string, unknown>;
}

function optionalString(target: string, obj: Record<string, unknown>, key: string, i: number) {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (v !== null && typeof v !== "string")
    throw new Error(`${target}: item ${i + 1} "${key}" must be a string.`);
  return v;
}

function autonomyOf(target: string, obj: Record<string, unknown>, i: number): Autonomy | undefined {
  const v = obj.autonomy_level;
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !(AUTONOMY as readonly string[]).includes(v))
    throw new Error(
      `${target}: item ${i + 1} autonomy_level must be "auto", "semi" or "manual"; received ${JSON.stringify(v)}.`,
    );
  return v as Autonomy;
}

export function parseCreateTopics(value: unknown): CreatePlan[] {
  const target = "create_topics";
  const plans = readCollectionList(target, "topics", value, 10).map((item, i) => {
    const obj = asObject(target, item, i);
    const name = optionalString(target, obj, "name", i)?.trim();
    if (!name) throw new Error(`${target}: item ${i + 1} needs a non-empty name.`);
    const description = optionalString(target, obj, "description", i)?.trim() || null;
    return { name, description, autonomy_level: autonomyOf(target, obj, i) ?? "semi" };
  });
  refuseRepeats(target, plans.map((p) => p.name), "name");
  return plans;
}

function idOf(target: string, item: unknown, i: number): string {
  if (typeof item === "string" && item.trim()) return item.trim();
  const obj = asObject(target, item, i);
  if (typeof obj.id !== "string" || !obj.id.trim())
    throw new Error(`${target}: item ${i + 1} needs an id (from topics).`);
  return obj.id.trim();
}

function known(target: string, rows: ResearchTopicListRow[], id: string): ResearchTopicListRow {
  const row = rows.find((r) => r.id === id);
  if (!row)
    throw new Error(
      `${target}: no topic with id "${id}" is on this page. Use an id from topics / topic_list.`,
    );
  return row;
}

export function parseUpdateTopics(value: unknown, rows: ResearchTopicListRow[]): UpdatePlan[] {
  const target = "update_topics";
  const plans = readCollectionList(target, "topics", value, 25).map((item, i) => {
    const obj = asObject(target, item, i);
    const id = idOf(target, obj, i);
    const row = known(target, rows, id);
    const plan: UpdatePlan = { id, previousName: row.name, changed: [] };
    const name = optionalString(target, obj, "name", i);
    if (name !== undefined) {
      if (!name?.trim()) throw new Error(`${target}: item ${i + 1} name may not be empty.`);
      plan.name = name.trim();
      plan.changed.push("name");
    }
    const description = optionalString(target, obj, "description", i);
    if (description !== undefined) {
      plan.description = description?.trim() || null;
      plan.changed.push("description");
    }
    const autonomy = autonomyOf(target, obj, i);
    if (autonomy !== undefined) {
      plan.autonomy_level = autonomy;
      plan.changed.push("autonomy_level");
    }
    if (plan.changed.length === 0)
      throw new Error(
        `${target}: item ${i + 1} changes nothing — send name, description or autonomy_level.`,
      );
    return plan;
  });
  refuseRepeats(target, plans.map((p) => p.id), "id");
  return plans;
}

export function parseDeleteTopics(value: unknown, rows: ResearchTopicListRow[]): ResearchTopicListRow[] {
  const target = "delete_topics";
  const ids = readCollectionList(target, "topics", value, 25).map((item, i) => idOf(target, item, i));
  refuseRepeats(target, ids, "id");
  return ids.map((id) => known(target, rows, id));
}
