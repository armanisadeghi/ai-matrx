// features/education/classes/hooks/useClassTests.ts
//
// The tests of a class (quizzes, midterms, finals) and the writes that make
// one. A test is a scope under the per-org "Test" scope type; test → class is
// the unit's own `part_of` edge marked `metadata.kind = "test"` (+ the optional
// date, which a member reads too); test → unit edges carry the role `covers`.
// An optional date also lands in the planner as an `education.study_goal`.
// Scope writes go through the canonical scope thunks, edges through
// `associationsService` (the one edge writer). No table, no parent column.

"use client";

import type { EntityTypeToken } from "@ai-matrx/associations";
import { associationsService } from "@/features/scopes/service/associationsService";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { selectAllScopeTypes } from "@/features/scopes/redux/selectors/admin";
import {
  createScope,
  deleteScope,
  updateScope,
} from "@/features/scopes/redux/thunks/scopeTreeMutations";
import type { Scope } from "@ai-matrx/records/scopes";
import { unwrapRecords } from "@/features/scopes/service/scopeDoors";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { studyService } from "@/features/education/study/service/studyService";
import {
  CLASS_PART_EDGE_ROLE,
  CLASS_TEST_COVERS_ROLE,
  CLASS_TEST_SCOPE_TYPE_SEED,
  CLASS_TEST_SCOPE_TYPE_SLUG,
} from "../constants";
import { partScopeSlug } from "../classParts";
import {
  sortTests,
  testCoverage,
  testDateOf,
  testEdgeMetadata,
  type ClassTest,
} from "../classTests";
import { ensureClassScopeType } from "./ensureClassScopeType";
import type { UseClassContentReturn } from "./useClassContent";
import type { UseClassPartsReturn } from "./useClassParts";

export interface TestInput {
  name: string;
  /** `YYYY-MM-DD` or null. */
  date: string | null;
  unitIds: string[];
}

export interface UseClassTestsReturn {
  tests: ClassTest[];
  /** "Test" / "Tests" — the type's own labels (renameable in the scopes UI). */
  nounSingular: string;
  nounPlural: string;
  createTest: (input: TestInput) => Promise<ClassTest>;
  updateTest: (testId: string, input: TestInput) => Promise<void>;
  /** Takes the test off the class and archives it (units and their items stay). */
  removeTest: (testId: string) => Promise<void>;
}

const SCOPE = "scope";

async function writeEdge(args: {
  sourceId: string;
  targetId: string;
  orgId?: string;
}): Promise<void> {
  const res = await associationsService.add({
    sourceType: SCOPE,
    sourceId: args.sourceId,
    targetType: SCOPE,
    targetId: args.targetId,
    role: CLASS_TEST_COVERS_ROLE,
    orgId: args.orgId,
  });
  if (!res.ok) throw new Error(res.error.message);
}

async function dropEdge(sourceId: string, targetId: string): Promise<void> {
  const res = await associationsService.remove({
    sourceType: SCOPE,
    sourceId,
    targetType: SCOPE,
    targetId,
    role: CLASS_TEST_COVERS_ROLE,
  });
  if (!res.ok) throw new Error(res.error.message);
}

export function useClassTests(
  cls: { id: string; organizationId: string | null },
  content: UseClassContentReturn,
  parts: UseClassPartsReturn,
): UseClassTestsReturn {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const allTypes = useAppSelector(selectAllScopeTypes);
  const testTypes = allTypes.filter((t) => t.slug === CLASS_TEST_SCOPE_TYPE_SLUG);
  const ownType = testTypes.find((t) => t.organization_id === cls.organizationId);
  const nameById = new Map<string, string>(
    testTypes.flatMap((t) => t.scopes.map((s): [string, string] => [s.id, s.name])),
  );
  const { titleFor } = useEntityTitles(
    content.testLinks
      .filter((l) => !nameById.has(l.resourceId))
      .map((l) => ({ token: SCOPE, id: l.resourceId, label: null })),
  );

  const unitIds = parts.parts.map((p) => p.id);
  const testIds = content.testLinks.map((l) => l.resourceId);
  const coverage = testCoverage(parts.unitEdges, testIds, unitIds);
  const tests = sortTests(
    content.testLinks.map(
      (l): ClassTest => ({
        id: l.resourceId,
        name:
          nameById.get(l.resourceId) ??
          titleFor({ token: SCOPE, id: l.resourceId, label: null }),
        date: testDateOf(l),
        unitIds: coverage.get(l.resourceId) ?? [],
      }),
    ),
  );

  /** The part_of edge to the class, with the test marker and date. */
  async function fileUnderClass(testId: string, date: string | null) {
    return content.links.attach(
      SCOPE as EntityTypeToken,
      testId,
      undefined,
      testEdgeMetadata(date),
      { role: CLASS_PART_EDGE_ROLE },
    );
  }

  async function createTest(input: TestInput): Promise<ClassTest> {
    const org = cls.organizationId;
    if (!org)
      throw new Error("This class has no organization, so it cannot hold tests.");
    const name = input.name.trim();
    const typeId = await ensureClassScopeType(
      dispatch,
      store,
      org,
      CLASS_TEST_SCOPE_TYPE_SLUG,
      CLASS_TEST_SCOPE_TYPE_SEED,
    );
    const scope = (await dispatch(
      createScope({
        organization_id: org,
        scope_type_id: typeId,
        name,
        description: "",
        settings: {},
        slug: partScopeSlug(name, crypto.randomUUID().slice(0, 8)),
      }),
    ).then(unwrapRecords)) as Scope;
    try {
      const linked = await fileUnderClass(scope.id, input.date);
      if (!linked.ok)
        throw new Error(linked.error ?? "the class refused it");
      for (const unitId of input.unitIds)
        await writeEdge({ sourceId: scope.id, targetId: unitId, orgId: org });
      if (input.date) {
        const goal = await studyService.createGoal({
          title: name,
          targetDate: input.date,
          orgId: org,
          metadata: { itemType: "fc_card", testId: scope.id, classId: cls.id },
        });
        if (goal.error) throw new Error(goal.error);
      }
    } catch (err) {
      // Never leave a half-made test behind: archive it, then say what happened.
      await dispatch(deleteScope({ scope_id: scope.id })).then(unwrapRecords);
      throw new Error(
        `"${name}" could not be added to the class: ${err instanceof Error ? err.message : String(err)}.`,
        { cause: err },
      );
    }
    await Promise.all([content.reload(), parts.reloadMembership()]);
    return { id: scope.id, name, date: input.date, unitIds: [...input.unitIds] };
  }

  async function updateTest(testId: string, input: TestInput): Promise<void> {
    const current = tests.find((t) => t.id === testId);
    if (input.name.trim() !== current?.name)
      await dispatch(updateScope({ scope_id: testId, name: input.name.trim() })).then(
        unwrapRecords,
      );
    if ((current?.date ?? null) !== input.date) {
      const unlinked = await content.links.detach(
        SCOPE as EntityTypeToken,
        testId,
        CLASS_PART_EDGE_ROLE,
      );
      if (!unlinked.ok) throw new Error(unlinked.error ?? "the date could not be changed");
      const linked = await fileUnderClass(testId, input.date);
      if (!linked.ok) throw new Error(linked.error ?? "the date could not be changed");
    }
    const before = new Set(current?.unitIds ?? []);
    const after = new Set(input.unitIds);
    for (const id of after)
      if (!before.has(id))
        await writeEdge({ sourceId: testId, targetId: id, orgId: cls.organizationId ?? undefined });
    for (const id of before) if (!after.has(id)) await dropEdge(testId, id);
    await Promise.all([content.reload(), parts.reloadMembership()]);
  }

  async function removeTest(testId: string): Promise<void> {
    const unlinked = await content.links.detach(
      SCOPE as EntityTypeToken,
      testId,
      CLASS_PART_EDGE_ROLE,
    );
    if (!unlinked.ok)
      throw new Error(unlinked.error ?? "The test could not be taken off the class.");
    for (const id of tests.find((t) => t.id === testId)?.unitIds ?? [])
      await dropEdge(testId, id);
    await dispatch(deleteScope({ scope_id: testId })).then(unwrapRecords);
    await Promise.all([content.reload(), parts.reloadMembership()]);
  }

  return {
    tests,
    nounSingular: ownType?.label_singular || CLASS_TEST_SCOPE_TYPE_SEED.labelSingular,
    nounPlural: ownType?.label_plural || CLASS_TEST_SCOPE_TYPE_SEED.labelPlural,
    createTest,
    updateTest,
    removeTest,
  };
}
