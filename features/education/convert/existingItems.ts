// features/education/convert/existingItems.ts
//
// What a kit already holds, so generation never makes it twice (living-kit W2)
// and coverage can count it (W3). Reads every live card of every deck in the
// kit, or every live question of every quiz / practice test in it, through
// `readAllRows` (a list treated as complete is never a capped `.select()`).
//
// Membership: the kit's aids are `member` edges into the kit scope; a deck's
// cards are `member` edges into the deck; a question carries `assessment_id`.

import { readAllRows } from "@ai-matrx/data/db";
import { associationsService } from "@/features/scopes/service/associationsService";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { OUTLINE_SECTION_KEY } from "@/features/education/kits/outline/types";
import { isNearDuplicateQA, looseKey } from "./segmentedGenerate";

/** One existing card or question, as dedupe and coverage read it. */
export interface ExistingItem {
  /** Card front, or question prompt. */
  text: string;
  /** Card back, or the question's correct answer. */
  answer: string;
  /** `metadata.outline_section_id`, when the item was made against the outline. */
  sectionId: string | null;
  /** The deck or assessment it lives in. */
  artifactId: string;
}

export type ExistingKind = "cards" | "questions";

function sectionOf(metadata: Json | null): string | null {
  const m = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const v = (m as Record<string, unknown>)[OUTLINE_SECTION_KEY];
  return typeof v === "string" && v ? v : null;
}

/** The kit's member artifact ids of one resource type ("fc_set" | "assessment"). */
export async function kitMemberIds(kitId: string, resourceType: "fc_set" | "assessment"): Promise<string[]> {
  const edges = await associationsService.listForTargetsVisible("scope", [kitId]);
  if (!edges.ok) throw new Error("Could not read what this kit already holds.");
  return [
    ...new Set(
      edges.data.edges
        .filter((e) => e.sourceType === resourceType && e.role === "member")
        .map((e) => e.sourceId),
    ),
  ];
}

/** Every live card of these decks. */
export async function readDeckItems(setIds: readonly string[]): Promise<ExistingItem[]> {
  if (setIds.length === 0) return [];
  const edges = await associationsService.listForTargetsVisible("fc_set", [...setIds]);
  if (!edges.ok) throw new Error("Could not read the kit's decks.");
  const deckOf = new Map<string, string>();
  for (const e of edges.data.edges) {
    if (e.sourceType === "fc_card" && e.role === "member") deckOf.set(e.sourceId, e.targetId);
  }
  const ids = [...deckOf.keys()];
  const out: ExistingItem[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const rows = await readAllRows<{ id: string; front: string | null; back: string | null; metadata: Json | null }>(
      ({ from, to }) =>
        supabase
          .schema("education")
          .from("fc_card")
          .select("id,front,back,metadata", { count: "exact" })
          .in("id", ids.slice(offset, offset + 100))
          .is("deleted_at", null)
          .order("id")
          .range(from, to),
      { label: "education.fc_card kit items" },
    );
    for (const r of rows) {
      out.push({ text: r.front ?? "", answer: r.back ?? "", sectionId: sectionOf(r.metadata), artifactId: deckOf.get(r.id) ?? "" });
    }
  }
  return out;
}

/** Every live question of these assessments. */
export async function readQuestionItems(assessmentIds: readonly string[]): Promise<ExistingItem[]> {
  const out: ExistingItem[] = [];
  for (let offset = 0; offset < assessmentIds.length; offset += 100) {
    const rows = await readAllRows<{
      id: string;
      assessment_id: string;
      prompt: string | null;
      correct_answer: string | null;
      metadata: Json | null;
    }>(
      ({ from, to }) =>
        supabase
          .schema("education")
          .from("assessment_item")
          .select("id,assessment_id,prompt,correct_answer,metadata", { count: "exact" })
          .in("assessment_id", assessmentIds.slice(offset, offset + 100))
          .is("deleted_at", null)
          .order("id")
          .range(from, to),
      { label: "education.assessment_item kit items" },
    );
    for (const r of rows) {
      out.push({ text: r.prompt ?? "", answer: r.correct_answer ?? "", sectionId: sectionOf(r.metadata), artifactId: r.assessment_id });
    }
  }
  return out;
}

/** Everything of one kind the kit already holds, across all its member aids. */
export async function readExistingKitItems(kitId: string, kind: ExistingKind): Promise<ExistingItem[]> {
  if (kind === "cards") return readDeckItems(await kitMemberIds(kitId, "fc_set"));
  return readQuestionItems(await kitMemberIds(kitId, "assessment"));
}

/**
 * Is `item` a repeat of something the kit holds? Same normalized text, or a
 * near-duplicate question + answer (the rule every list target uses).
 */
export function repeatsExisting(
  item: { text: string; answer: string },
  existing: readonly { text: string; answer: string }[],
  keys: ReadonlySet<string> = new Set(existing.map((e) => looseKey(e.text))),
): boolean {
  if (keys.has(looseKey(item.text))) return true;
  const mine = { question: item.text, answer: item.answer };
  return existing.some((e) => isNearDuplicateQA({ question: e.text, answer: e.answer }, mine));
}

/** Keep only items that repeat nothing in `existing`. */
export function dropRepeats<T>(
  items: readonly T[],
  existing: readonly { text: string; answer: string }[],
  read: (item: T) => { text: string; answer: string },
): T[] {
  const keys = new Set(existing.map((e) => looseKey(e.text)));
  return items.filter((i) => !repeatsExisting(read(i), existing, keys));
}
