// features/education/classes/hooks/useClassTestMaterial.ts
//
// One test of a class and the material of its covered units, combined and
// deduped: the class's content + units + tests, then everything filed in ANY
// covered unit. Read by the test page and its Study route (owner and member).

"use client";

import { useEffect, useState } from "react";
import { associationsService } from "@/features/scopes/service/associationsService";
import { groupsInPart } from "../classParts";
import {
  itemsInUnits,
  practiceTestSources,
  testDeckIds,
  type ClassTest,
} from "../classTests";
import type { ClassContentItem } from "../types";
import { useClassContent, type ClassContentGroup } from "./useClassContent";
import { useClassParts } from "./useClassParts";
import { useClassTests } from "./useClassTests";

export interface UseClassTestMaterialReturn {
  test: ClassTest | null;
  /** The covered units, in class order. */
  units: { id: string; name: string }[];
  /** Content groups holding only what the covered units hold. */
  groups: ClassContentGroup[];
  /** Every item in the covered units, once. */
  items: ClassContentItem[];
  /** The files, documents and notes among them. */
  sources: ClassContentItem[];
  /** The decks among them. */
  deckIds: string[];
  /** The assessments filed under this test (its practice tests). */
  practiceTestIds: string[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  reloadPracticeTests: () => Promise<void>;
}

export function useClassTestMaterial(
  cls: { id: string; organizationId: string | null },
  testId: string,
  enabled: boolean,
): UseClassTestMaterialReturn {
  const content = useClassContent(enabled ? cls.id : null, cls.organizationId);
  const parts = useClassParts(cls, content);
  const tests = useClassTests(cls, content, parts);
  const test = tests.tests.find((t) => t.id === testId) ?? null;
  const covered = parts.parts.filter((p) => test?.unitIds.includes(p.id));

  const items = itemsInUnits(content.groups, parts.membership, covered.map((p) => p.id));
  const keys = new Set(items.map((i) => `${i.token}:${i.entityId}`));
  const groups = groupsInPart(content.groups, keys);

  const [practice, setPractice] = useState<{ testId: string; ids: string[] } | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  async function readPractice(): Promise<void> {
    const res = await associationsService.listForTargets("scope", [testId]);
    if (!res.ok) {
      console.error("[useClassTestMaterial] reading practice tests failed:", res.error);
      setPracticeError(res.error.message);
      return;
    }
    setPracticeError(null);
    setPractice({
      testId,
      ids: res.data.edges
        .filter((e) => e.role == null && e.sourceType === "assessment")
        .map((e) => e.sourceId),
    });
  }
  useEffect(() => {
    if (enabled) void readPractice();
    // readPractice closes over testId only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, enabled]);

  return {
    test,
    units: covered,
    groups,
    items,
    sources: practiceTestSources(items),
    deckIds: testDeckIds(items),
    practiceTestIds: practice?.testId === testId ? practice.ids : [],
    loading: content.loading || parts.membershipLoading,
    error: content.error ?? parts.membershipError ?? practiceError,
    reload: async () => {
      await content.reload();
      await parts.reloadMembership();
    },
    reloadPracticeTests: readPractice,
  };
}
