// features/education/assessment/components/home/assessmentListSurface.ts
//
// The quiz / practice-test list's agent surface: the scope it emits (built
// from the page the list already rendered — never a fetch) and the write
// handlers, which save through the same service calls the product uses
// (assessmentService.createAssessment / updateAssessment, Trash's archive and
// restore). A write reads only the assessments its value names.
// Worked example: features/flashcards/components/home/deckSurface.ts.

import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import type {
  SurfaceWriteHandlerEntry,
  SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { xmlElement, xmlList } from "@/features/surfaces/runtime/context-bundle";
import {
  createAssessmentListScope,
  type AssessmentListSummaryRow,
  type MyAssessmentSummary,
} from "@/features/surfaces/manifests/_assessment-list.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { archiveRecord, restoreFromTrash } from "@/features/trash/service";
import { assessmentService } from "../../data/assessmentService";
import { fetchOwnAssessmentsFor } from "../../data/assessmentListService";
import type { AssessmentPatch } from "../../data/types";
import { KIND_CONFIG, type KindConfig } from "../kindConfig";
import {
  parseCreateAssessmentsValue,
  parseDeleteAssessmentsValue,
  parseUpdateAssessmentsValue,
  type AssessmentWriteFields,
  type CurrentAssessment,
} from "./assessmentAgentWrites";
import { distinctTopic, type AssessmentListItem } from "./assessmentList";

type Controller = EntityListSurfaceController<AssessmentListItem>;

const LIST_MAX_ROWS = 25;

/** The condensed page on screen — one XML bundle, first 25 rows. */
export function buildAssessmentListBundle(list: Controller): string {
  return xmlList(
    "assessments",
    list.rows,
    (row) =>
      xmlElement("assessment", {
        id: row.id,
        title: row.title,
        topic: distinctTopic(row),
        questions: row.question_count,
        depth: row.depth,
        exam: row.exam_type,
        status: row.status === "ready" ? null : row.status,
        visibility: row.visibility,
        updated: row.updated_at.slice(0, 10),
        archived: row.archived || null,
      }),
    {
      maxRows: LIST_MAX_ROWS,
      attrs: {
        lane: list.query.scope.kind,
        matching: list.total,
        sort: `${list.view.sort} ${list.view.direction}`,
        search: list.query.search.trim() || null,
        archive: list.query.archived,
      },
    },
  );
}

const toSummary = (r: AssessmentListItem): AssessmentListSummaryRow => ({
  id: r.id,
  title: r.title,
  topic: r.topic,
  question_count: r.question_count,
  depth: r.depth,
  exam_type: r.exam_type,
  status: r.status,
  visibility: r.visibility,
  updated_at: r.updated_at,
  archived: r.archived,
});

export function buildAssessmentListScope(input: {
  list: Controller;
  userId: string;
}): SurfaceScopePayload {
  const { list, userId } = input;
  const loaded = !list.isLoading && !list.error;
  const search = list.query.search.trim();
  return createAssessmentListScope({
    assessments_loaded: loaded,
    visibility_filter: list.query.scope.kind,
    list_sort: `${list.view.sort} ${list.view.direction}`,
    archive_filter: list.query.archived,
    list_filters: list.query.filters,
    ...(loaded
      ? {
          assessment_count: list.total,
          assessment_list: buildAssessmentListBundle(list),
          visible_assessments: list.rows.map(toSummary),
          visible_assessment_ids: list.rows.map((r) => r.id),
          my_assessments: list.rows
            .filter((r) => r.created_by === userId)
            .map(
              (r): MyAssessmentSummary => ({
                id: r.id,
                title: r.title,
                topic: r.topic,
                exam_type: r.exam_type,
                depth: r.depth,
                description: r.description,
                archived: r.archived,
              }),
            ),
        }
      : {}),
    ...(list.error ? { load_error: list.error.message } : {}),
    ...(search ? { search_query: search } : {}),
  });
}

/** Ids and titles a write value mentions — what the write must read to check. */
function mentioned(value: unknown): { ids: string[]; titles: string[] } {
  const items = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { assessments?: unknown }).assessments)
      ? (value as { assessments: unknown[] }).assessments
      : [];
  const ids: string[] = [];
  const titles: string[] = [];
  for (const item of items.slice(0, 50)) {
    if (typeof item === "string") ids.push(item);
    else if (item && typeof item === "object") {
      const r = item as Record<string, unknown>;
      if (typeof r.id === "string") ids.push(r.id);
      if (typeof r.title === "string") titles.push(r.title);
    }
  }
  return { ids, titles };
}

function toPatch(fields: AssessmentWriteFields): AssessmentPatch {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) patch[k] = v;
  return patch as AssessmentPatch;
}

type HandlerInput = { list: Controller; userId: string; config: KindConfig };
type CollectionOps = Omit<Parameters<typeof collectionWriteHandlers>[0], "plural" | "singular">;

/**
 * create_quizzes / update_quizzes / delete_quizzes on /education/quizzes.
 * The plural is a literal at each call site so `check:surface-write-handlers`
 * can read the target names statically.
 */
export function buildQuizWriteHandlers(input: Omit<HandlerInput, "config">): SurfaceWriteHandlers {
  const input2 = { ...input, config: KIND_CONFIG.quiz };
  const bound = bindOps(input2, "quizzes");
  // Every check and apply reads the assessments the value names first.
  const quizHandlers = collectionWriteHandlers(
    {
      plural: "quizzes",
      singular: "quiz",
      create: bound.ops.create,
      update: bound.ops.update,
      delete: bound.ops.delete,
    },
    refuseSurfaceWrite,
  );
  const quizOut: SurfaceWriteHandlers = {};
  for (const [name, handler] of Object.entries(quizHandlers)) {
    const entry = handler as SurfaceWriteHandlerEntry;
    quizOut[name] = {
      validate: async (value) => {
        await bound.load(value);
        await entry.validate?.(value);
      },
      apply: async (value) => {
        await bound.load(value);
        return entry.apply(value);
      },
    };
  }
  return quizOut;
}

/** create_practice_tests / update_practice_tests / delete_practice_tests on /education/practice-tests. */
export function buildPracticeTestWriteHandlers(
  input: Omit<HandlerInput, "config">,
): SurfaceWriteHandlers {
  const input2 = { ...input, config: KIND_CONFIG.practice_test };
  const bound = bindOps(input2, "practice_tests");
  const practiceTestHandlers = collectionWriteHandlers(
    {
      plural: "practice_tests",
      singular: "practice_test",
      create: bound.ops.create,
      update: bound.ops.update,
      delete: bound.ops.delete,
    },
    refuseSurfaceWrite,
  );
  const practiceOut: SurfaceWriteHandlers = {};
  for (const [name, handler] of Object.entries(practiceTestHandlers)) {
    const entry = handler as SurfaceWriteHandlerEntry;
    practiceOut[name] = {
      validate: async (value) => {
        await bound.load(value);
        await entry.validate?.(value);
      },
      apply: async (value) => {
        await bound.load(value);
        return entry.apply(value);
      },
    };
  }
  return practiceOut;
}

/** The create / update / delete operations over the person's own assessments of one kind. */
function bindOps(
  input: HandlerInput,
  plural: string,
): { load: (value: unknown) => Promise<void>; ops: CollectionOps } {
  const { list, userId, config } = input;
  let current: CurrentAssessment[] = [];
  const load = async (value: unknown) => {
    current = await fetchOwnAssessmentsFor({ userId, kind: config.kind, ...mentioned(value) });
  };
  const afterWrite = () => list.refresh();
  const ops: CollectionOps = {
    create: {
      parse: (value) => parseCreateAssessmentsValue(plural, value, current),
      run: async (fields) => {
        const res = await assessmentService.createAssessment({
          assessmentKind: config.kind,
          title: fields.title,
          description: fields.description ?? null,
          topic: fields.topic ?? null,
          examType: fields.exam_type ?? null,
          depth: fields.depth ?? null,
          status: "draft",
          sourceKind: fields.topic ? "topic" : null,
          metadata: { question_count: 0 },
        });
        if (res.error || !res.data) throw new Error(res.error ?? "not saved");
        afterWrite();
        return { id: res.data.id, name: res.data.title };
      },
      nameOf: (fields) => fields.title,
    },
    update: {
      parse: (value) => parseUpdateAssessmentsValue(plural, value, current),
      run: async (plan) => {
        if (plan.archived === false) await restoreFromTrash("assessment", plan.id);
        let name = plan.patch.title ?? plan.previousTitle;
        if (Object.keys(plan.patch).length > 0) {
          const res = await assessmentService.updateAssessment(plan.id, toPatch(plan.patch));
          if (res.error || !res.data) throw new Error(res.error ?? "not saved");
          name = res.data.title;
        }
        if (plan.archived === true) await archiveRecord("assessment", plan.id, config.noun);
        afterWrite();
        return { id: plan.id, name };
      },
      nameOf: (plan) => plan.previousTitle,
      changedOf: (plan) => plan.changed,
    },
    delete: {
      parse: (value) => parseDeleteAssessmentsValue(plural, value, current),
      run: async (found) => {
        await archiveRecord("assessment", found.id, config.noun);
        afterWrite();
        return { id: found.id, name: found.title };
      },
      nameOf: (found) => found.title,
    },
  };
  return { load, ops };
}
