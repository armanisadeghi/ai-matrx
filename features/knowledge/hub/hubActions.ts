/**
 * features/knowledge/hub/hubActions.ts — what the hub's bulk bar and peek DO,
 * as plain functions over injected doors (so the page and the tests call the
 * same code):
 *
 *   File under…  → one association per item through the ONE association door
 *                  (`associationsService.add`, little → big: the item is the
 *                  source, the container the target). The sentence names the
 *                  container by its REGISTRY label ("Project", "Scope"…).
 *   Keep         → Sources only: the Source save door (`POST /sources/{id}/keep`).
 *                  Other kinds are already kept; the sentence says so.
 *   Trash        → the ONE archive (`archiveRecord`): the record leaves the
 *                  list and is restorable from Trash.
 *
 * A Segment is never filed or trashed on its own — the action applies to the
 * Source it belongs to. Every outcome is counted and said; partial failure
 * names what failed.
 */

import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";

export interface ActionTarget {
  entity: string;
  id: string;
  title: string;
  organization_id?: string | null;
}

/** The record an action applies to: a Segment acts on its Source. */
export function actionTarget(hit: KnowledgeHit): ActionTarget {
  if (hit.entity === "segment" && hit.segment?.source_id)
    return {
      entity: "processed_document",
      id: hit.segment.source_id,
      title: hit.segment.source_title || hit.title,
      organization_id: hit.organization_id,
    };
  return { entity: hit.entity, id: hit.id, title: hit.title, organization_id: hit.organization_id };
}

export function uniqueTargets(hits: KnowledgeHit[]): ActionTarget[] {
  const seen = new Set<string>();
  const out: ActionTarget[] = [];
  for (const h of hits) {
    const t = actionTarget(h);
    const k = `${t.entity}:${t.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export interface ActionOutcome {
  ok: number;
  failed: { target: ActionTarget; message: string }[];
  /** The one sentence the toast shows. */
  sentence: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function failureTail(failed: ActionOutcome["failed"]): string {
  if (!failed.length) return "";
  const first = failed[0];
  const more = failed.length > 1 ? ` and ${failed.length - 1} more` : "";
  return ` ${plural(failed.length, "item")} could not be: "${first.target.title}" — ${first.message}${more}.`;
}

// ─── File under ─────────────────────────────────────────────────────────────

export interface FileUnderContainer {
  token: string;
  id: string;
  title: string;
}

export type AddAssociation = (args: {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  orgId?: string;
  label?: string;
}) => Promise<{ ok: true; data: { id: string } } | { ok: false; error: { message: string } }>;

export interface FileUnderDoors {
  add: AddAssociation;
  /** Registry label for a token ("Project"). */
  labelFor: (token: string) => string;
}

export async function fileUnder(
  hits: KnowledgeHit[],
  container: FileUnderContainer,
  doors: FileUnderDoors,
): Promise<ActionOutcome> {
  const targets = uniqueTargets(hits);
  const failed: ActionOutcome["failed"] = [];
  let ok = 0;
  for (const t of targets) {
    try {
      const res = await doors.add({
        sourceType: t.entity,
        sourceId: t.id,
        targetType: container.token,
        targetId: container.id,
        ...(t.organization_id ? { orgId: t.organization_id } : {}),
        label: container.title,
      });
      if (res.ok) ok += 1;
      else failed.push({ target: t, message: res.error.message });
    } catch (err) {
      failed.push({ target: t, message: err instanceof Error ? err.message : String(err) });
    }
  }
  const where = `${doors.labelFor(container.token)} "${container.title}"`;
  const sentence = ok
    ? `Filed ${plural(ok, "item")} under ${where}.${failureTail(failed).replace("could not be", "could not be filed")}`
    : `Nothing was filed under ${where}.${failureTail(failed).replace("could not be", "could not be filed")}`;
  return { ok, failed, sentence };
}

// ─── Keep (Sources) ─────────────────────────────────────────────────────────

export type KeepSourceDoor = (id: string, organizationId: string | null) => Promise<void>;

export async function keepItems(hits: KnowledgeHit[], keep: KeepSourceDoor): Promise<ActionOutcome> {
  const targets = uniqueTargets(hits);
  const sources = targets.filter((t) => t.entity === "processed_document");
  const others = targets.length - sources.length;
  const failed: ActionOutcome["failed"] = [];
  let ok = 0;
  for (const t of sources) {
    try {
      await keep(t.id, t.organization_id ?? null);
      ok += 1;
    } catch (err) {
      failed.push({ target: t, message: err instanceof Error ? err.message : String(err) });
    }
  }
  const parts: string[] = [];
  if (ok) parts.push(`Kept ${plural(ok, "Source")}.`);
  if (others) parts.push(`${plural(others, "other item")} ${others === 1 ? "is" : "are"} already kept — only Sources wait to be kept.`);
  if (!ok && !others && !failed.length) parts.push("Nothing to keep.");
  return { ok, failed, sentence: `${parts.join(" ")}${failureTail(failed).replace("could not be", "could not be kept")}`.trim() };
}

// ─── Trash ──────────────────────────────────────────────────────────────────

export type ArchiveDoor = (token: string, id: string, noun: string) => Promise<void>;

export async function trashItems(hits: KnowledgeHit[], archive: ArchiveDoor): Promise<ActionOutcome> {
  const targets = uniqueTargets(hits);
  const failed: ActionOutcome["failed"] = [];
  let ok = 0;
  for (const t of targets) {
    try {
      await archive(t.entity, t.id, `"${t.title}"`);
      ok += 1;
    } catch (err) {
      failed.push({ target: t, message: err instanceof Error ? err.message : String(err) });
    }
  }
  const sentence = ok
    ? `Moved ${plural(ok, "item")} to Trash — restore from Trash any time.${failureTail(failed).replace("could not be", "could not be moved")}`
    : `Nothing was moved to Trash.${failureTail(failed).replace("could not be", "could not be moved")}`;
  return { ok, failed, sentence };
}
