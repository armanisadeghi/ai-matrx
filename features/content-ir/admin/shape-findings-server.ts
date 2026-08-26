/**
 * Server payload for ONE finding code's resolution surface
 * (/administration/utilities/kind-registry/findings/[code]).
 *
 * Same doctor, same run shape as the board — `runLiveShapeDoctor` is the ONE
 * gather; this module only asks it a narrower question and adds the evidence a
 * human needs to DECIDE, which the board's one-line-per-finding list never
 * carried.
 *
 * The evidence is per-code. `duplicate-skill` is the built exemplar: it needs
 * both competing skill bodies, what else each skill teaches, and the kind_edge
 * containment relationship that usually settles it. Every other code renders
 * the finding list with its door to the affected kind — the shape of this
 * payload is deliberately "findings + optional per-code evidence" so the next
 * code to get a real resolver slots in without a bespoke page.
 */

import "server-only";

import type { FindingCode, ShapeFinding } from "@/features/content-ir/registry/shape-doctor";
import {
  attributeSkillsToKinds,
  kindSkillOwner,
} from "@/features/content-ir/registry/shape-doctor";
import { runLiveShapeDoctor } from "@/features/content-ir/admin/shape-doctor-server";
import {
  countKindMentions,
  parentKindSlugs,
  recommendOwner,
  skillNamedForKind,
  type DuplicateSkillCandidate,
  type DuplicateSkillCase,
  type SkillSyntax,
} from "@/features/content-ir/admin/duplicate-skill-analysis";

export interface FindingCodePayload {
  code: FindingCode;
  findings: ShapeFinding[];
  /** Present only for `duplicate-skill`. */
  duplicateSkillCases: DuplicateSkillCase[];
  /** Loud degradation notes from the doctor run — shown, never swallowed. */
  warnings: string[];
  generatedAt: string;
}

export async function gatherFindingCodePayload(
  code: FindingCode,
): Promise<FindingCodePayload> {
  const { report, db, warnings } = await runLiveShapeDoctor();
  const findings = report.findings.filter((f) => f.code === code);

  return {
    code,
    findings,
    duplicateSkillCases:
      code === "duplicate-skill" ? buildDuplicateSkillCases(db) : [],
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

type DoctorDb = Awaited<ReturnType<typeof runLiveShapeDoctor>>["db"];

function buildDuplicateSkillCases(db: DoctorDb): DuplicateSkillCase[] {
  const knownKinds = new Set(db.kinds.map((k) => k.kind));
  const teachings = attributeSkillsToKinds(db.renderBlockSkills, knownKinds);
  const skillBySlug = new Map(db.renderBlockSkills.map((s) => [s.skillId, s]));
  const kindIdBySlug = new Map(db.kinds.map((k) => [k.kind, k.id]));
  const slugByKindId = new Map(db.kinds.map((k) => [k.id, k.kind]));

  // Everything a skill teaches, per syntax — the "what else does this skill do"
  // half of the evidence.
  const teachesBySkill = new Map<string, Map<SkillSyntax, Set<string>>>();
  for (const t of teachings) {
    const bySyntax = teachesBySkill.get(t.skillId) ?? new Map<SkillSyntax, Set<string>>();
    const set = bySyntax.get(t.syntax) ?? new Set<string>();
    set.add(t.kind);
    bySyntax.set(t.syntax, set);
    teachesBySkill.set(t.skillId, bySyntax);
  }

  // ── WHY THIS IS DERIVED FROM THE TEACHINGS, NOT FROM `findings` ─────────
  //
  // A case that an admin has RESOLVED raises no finding — so keying this list
  // off the findings made the decision disappear the instant it was made, and
  // "Clear declaration" (the undo, rendered inside the case) became
  // unreachable: a control that exists but can never be shown. An admin who
  // mis-declared an owner had no door back, which is exactly the dead end
  // common-docs/policies/no-dead-ends.md forbids.
  //
  // The honest source is the CONTESTED SET: every kind taught by two or more
  // skills in one syntax, whether or not an owner has been declared. Resolved
  // cases stay listed, badged with their owner, and remain reversible — which
  // also makes this page the standing record of every ownership decision.
  const contestedBySlug = new Map<string, Map<SkillSyntax, string[]>>();
  for (const t of teachings) {
    const bySyntax = contestedBySlug.get(t.kind) ?? new Map<SkillSyntax, string[]>();
    const list = bySyntax.get(t.syntax) ?? [];
    list.push(t.skillId);
    bySyntax.set(t.syntax, list);
    contestedBySlug.set(t.kind, bySyntax);
  }

  const cases: DuplicateSkillCase[] = [];
  for (const kindSlug of [...contestedBySlug.keys()].sort()) {
    const kindRow = db.kinds.find((k) => k.kind === kindSlug);
    if (!kindRow) continue;
    const parents = parentKindSlugs(kindSlug, kindIdBySlug, slugByKindId, db.edges);
    const bySyntax = contestedBySlug.get(kindSlug)!;

    for (const [syntax, skillIds] of bySyntax) {
      if (skillIds.length < 2) continue;
      const declaredOwner = kindSkillOwner(kindRow.metadata, syntax);

      const candidates: DuplicateSkillCandidate[] = skillIds
        .sort()
        .map((skillId) => {
          const skill = skillBySlug.get(skillId);
          const body = skill?.body ?? "";
          const teaches = [
            ...(teachesBySkill.get(skillId)?.get(syntax) ?? new Set<string>()),
          ].sort();
          return {
            skillId,
            label: skill?.label ?? skillId,
            body,
            teaches,
            namedForThisKind: skillNamedForKind(skillId, kindSlug),
            // A container relationship only counts when the skill actually
            // teaches the parent kind — merely being someone's child is not
            // evidence about THIS skill.
            containerKinds: parents.filter((p) => teaches.includes(p)),
            mentions: countKindMentions(body, kindSlug),
          };
        });

      const { owner, rationale } = recommendOwner(kindSlug, candidates);
      cases.push({
        kind: kindSlug,
        kindLabel: kindRow.label,
        kindDefinitionId: kindRow.id,
        syntax,
        declaredOwner,
        declaredStale:
          declaredOwner !== null && !candidates.some((c) => c.skillId === declaredOwner),
        candidates,
        recommendedOwner: owner,
        rationale,
      });
    }
  }
  return cases;
}
