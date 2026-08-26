/**
 * THE DUPLICATE-SKILL DECISION, made decidable.
 *
 * A `duplicate-skill` red says two skills teach one kind. It does NOT say which
 * one is wrong — and the naive reading ("delete one") is usually the wrong
 * repair. The observed pattern across all 11 live cases on 2026-08-26 is that
 * one skill is named for a CONTAINER kind and merely demonstrates the ITEM kind
 * it embeds:
 *
 *   kind_ner_canonicalization_result  →  shows an `ner_entity_ref` inside itself
 *   kind_ner_entity_ref               →  IS the ner_entity_ref skill
 *
 * The container skill must keep showing its children; the item skill is the
 * owner. This module turns that into evidence an admin can read and a
 * recommendation they can accept or overrule — never an automatic write.
 *
 * PURE. No React, no DB, no server imports — so it is unit-testable and shared
 * between the server gather and the client resolver.
 */

import type { DoctorKindEdge } from "@/features/content-ir/registry/shape-doctor";

export type SkillSyntax = "json" | "xml";

export interface DuplicateSkillCandidate {
  skillId: string;
  label: string;
  /** Full skill body — the material both the reader and the diff view need. */
  body: string;
  /** Every kind this skill teaches in this syntax, sorted. */
  teaches: string[];
  /** The skill_id follows R9 naming for THIS kind (`kind_<slug>`). */
  namedForThisKind: boolean;
  /**
   * Kinds this skill also teaches that the contested kind is a `kind_edge`
   * CHILD of. Non-empty = this skill is a CONTAINER that embeds the kind.
   */
  containerKinds: string[];
  /** Occurrences of `"__kind": "<kind>"` in the body — teaching intensity. */
  mentions: number;
}

export interface DuplicateSkillCase {
  kind: string;
  kindLabel: string;
  kindDefinitionId: string;
  syntax: SkillSyntax;
  /** Currently declared owner from `metadata.skill_owner`, if any. */
  declaredOwner: string | null;
  /** A declared owner that no longer teaches the kind — the red stays up. */
  declaredStale: boolean;
  candidates: DuplicateSkillCandidate[];
  /** What the evidence suggests. NEVER applied automatically. */
  recommendedOwner: string | null;
  /** Why — shown verbatim next to the recommendation. */
  rationale: string;
}

/** Does `skillId` follow the R9 naming convention for `kind`? */
export function skillNamedForKind(skillId: string, kind: string): boolean {
  const normalized = skillId.replace(/-/g, "_");
  return normalized === `kind_${kind}` || normalized === `kind_${kind}_xml`;
}

/** Kinds that embed `kind` as a child, per the live `kind_edge` graph. */
export function parentKindSlugs(
  kind: string,
  kindIdBySlug: ReadonlyMap<string, string>,
  slugByKindId: ReadonlyMap<string, string>,
  edges: readonly DoctorKindEdge[],
): string[] {
  const id = kindIdBySlug.get(kind);
  if (!id) return [];
  const parents = new Set<string>();
  for (const edge of edges) {
    if (edge.childDefinitionId !== id) continue;
    const parent = slugByKindId.get(edge.parentDefinitionId);
    // A self-recursive edge is not evidence of containment by another kind.
    if (parent && parent !== kind) parents.add(parent);
  }
  return [...parents].sort();
}

export function countKindMentions(body: string, kind: string): number {
  const escaped = kind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (body.match(new RegExp(`"__kind"\\s*:\\s*"${escaped}"`, "g")) ?? []).length;
}

/**
 * The recommendation, in one place so it can be argued with and tested.
 *
 * 1. Exactly one candidate is BOTH named for the kind AND embeds it in no
 *    container it also teaches → that is the owner; every other candidate is a
 *    container demonstrating a child.
 * 2. Otherwise, exactly one candidate teaches this kind and no container of it
 *    → the same conclusion by the weaker signal (naming is only a convention).
 * 3. Otherwise no recommendation. Two genuine rivals is a real editorial call,
 *    and inventing a winner would be worse than saying "you decide".
 */
export function recommendOwner(
  kind: string,
  candidates: readonly DuplicateSkillCandidate[],
): { owner: string | null; rationale: string } {
  const named = candidates.filter(
    (c) => c.namedForThisKind && c.containerKinds.length === 0,
  );
  if (named.length === 1) {
    const others = candidates.filter((c) => c.skillId !== named[0].skillId);
    return {
      owner: named[0].skillId,
      rationale: `${named[0].skillId} is named for "${kind}" and teaches it standalone. ${others
        .map(
          (c) =>
            `${c.skillId} ${
              c.containerKinds.length > 0
                ? `teaches ${c.containerKinds.join(", ")}, which embed${c.containerKinds.length === 1 ? "s" : ""} "${kind}" — it demonstrates the child, it does not own it`
                : `also mentions "${kind}"`
            }`,
        )
        .join("; ")}.`,
    };
  }

  const standalone = candidates.filter((c) => c.containerKinds.length === 0);
  if (standalone.length === 1) {
    return {
      owner: standalone[0].skillId,
      rationale: `${standalone[0].skillId} is the only candidate that does not also teach a container of "${kind}". The others embed it as a child.`,
    };
  }

  return {
    owner: null,
    rationale:
      candidates.every((c) => c.containerKinds.length > 0)
        ? `Every candidate teaches a kind that embeds "${kind}" — none of them owns it standalone. The honest fix is probably a dedicated skill for "${kind}", not a winner among these.`
        : `More than one candidate teaches "${kind}" standalone. This is a real editorial call — read both bodies below and decide.`,
  };
}
