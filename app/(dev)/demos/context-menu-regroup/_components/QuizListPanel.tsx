"use client";

// The real /education/quizzes list row: the canonical list table
// (`EntityListTable` → MatrxDataTable → its ONE NonEditableContextMenu), the
// real quiz list config and the real quiz row actions. Only the rows are
// fixtures — nothing here reads or writes the database. A right-click on a
// row therefore opens exactly the menu a quiz row opens on /education/quizzes
// (the page's surface-bound agents follow this demo route instead).

import { EntityListTable } from "@/lib/entity-list/components/EntityListTable";
import { EMPTY_FACETS } from "@/lib/entity-list/types";
import type { EntityListController } from "@/lib/entity-list/config";
import { KIND_CONFIG } from "@/features/education/assessment/components/kindConfig";
import { makeAssessmentRowActions } from "@/features/education/assessment/components/home/useAssessmentRowActions";
import {
  buildAssessmentListConfig,
  type AssessmentListItem,
} from "@/features/education/assessment/components/home/assessmentList";

const useQuizRowActions = makeAssessmentRowActions(KIND_CONFIG.quiz);

const DEMO_USER = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-09-26T17:20:00.000Z";

export const QUIZ_ROWS: AssessmentListItem[] = [
  {
    id: "5b6f0c1e-2d47-4f3a-9a51-7c2e8f4d1a01",
    organization_id: "00000000-0000-4000-8000-0000000000a1",
    created_by: DEMO_USER,
    created_at: "2026-09-20T15:04:00.000Z",
    updated_at: NOW,
    deleted_at: null,
    visibility: "personal",
    assessment_kind: "quiz",
    title: "Unit 2 review: cell structure and transport",
    description: "Membranes, organelles, diffusion and osmosis.",
    status: "ready",
    topic: "AP Biology",
    source_title: null,
    exam_type: "AP",
    depth: "applied",
    time_limit_seconds: null,
    question_count: 12,
    my_attempts: 2,
    my_best_score: 0.83,
    my_last_result_id: "9d3c4a77-51b2-4c7e-8f10-2b6e1d9c0a02",
    my_can_edit: true,
    archived: false,
  },
  {
    id: "5b6f0c1e-2d47-4f3a-9a51-7c2e8f4d1a02",
    organization_id: "00000000-0000-4000-8000-0000000000a1",
    created_by: DEMO_USER,
    created_at: "2026-09-18T10:12:00.000Z",
    updated_at: "2026-09-25T09:41:00.000Z",
    deleted_at: null,
    visibility: "personal",
    assessment_kind: "quiz",
    title: "Photosynthesis and cellular respiration",
    description: null,
    status: "ready",
    topic: "AP Biology",
    source_title: null,
    exam_type: "AP",
    depth: "recall",
    time_limit_seconds: null,
    question_count: 10,
    my_attempts: 0,
    my_best_score: null,
    my_last_result_id: null,
    my_can_edit: true,
    archived: false,
  },
];

const config = buildAssessmentListConfig({
  config: KIND_CONFIG.quiz,
  userId: DEMO_USER,
  useRowActions: useQuizRowActions,
});

export function QuizListPanel() {
  // The row actions read only `refresh` / `removeRow` from the list controller
  // (Archive / Restore); the fixture list has nothing to refresh.
  const list = {
    refresh: () => undefined,
    removeRow: () => undefined,
  } as unknown as EntityListController<AssessmentListItem>;
  const { actions, modals } = useQuizRowActions(list);
  return (
    <div className="min-h-[150px] overflow-hidden rounded-md border border-border bg-card">
      <EntityListTable<AssessmentListItem>
        config={config}
        actions={actions}
        rows={QUIZ_ROWS}
        total={QUIZ_ROWS.length}
        page={1}
        pageSize={25}
        sort="updated"
        direction="desc"
        filters={{}}
        facets={EMPTY_FACETS}
        isLoading={false}
        isFetching={false}
        density="compact"
        showSharedColumns={false}
        hiddenColumns={[]}
        onSaveEdits={async () => undefined}
        onQueryChange={() => undefined}
        pageToolbarSlot={null}
      />
      {modals}
    </div>
  );
}
