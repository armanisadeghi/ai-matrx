// features/education/assessment/components/AssessmentHome.tsx
//
// The list-first home for the Quizzes AND Practice Tests tools
// (/education/quizzes + /education/practice-tests — never a forced detail
// page). One component, `kind`-parameterized via KIND_CONFIG, on the canonical
// list shell (`EntityListPage`) over the server-side
// `education.assessment_list_scoped` RPC: lanes with real counts, search, sort
// and filter on every column, saved view preferences, the archive axis, a
// per-row right-click menu, Copy / Copy for AI and phone cards. Each list is
// its own agent surface (matrx-user/education-quizzes |
// matrx-user/education-practice-tests). The list's config, row actions and
// surface live in ./home/. Worked example: features/flashcards/components/home/.

"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAuthReady, selectUserId } from "@/lib/redux/selectors/userSelectors";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import type { AssessmentKind } from "../data/types";
import { KIND_CONFIG, type KindConfig } from "./kindConfig";
import { buildAssessmentListConfig, type AssessmentListItem } from "./home/assessmentList";
import { makeAssessmentRowActions } from "./home/useAssessmentRowActions";
import {
  buildAssessmentListScope,
  buildPracticeTestWriteHandlers,
  buildQuizWriteHandlers,
} from "./home/assessmentListSurface";

// One row-actions hook per kind, made once — a hook's identity must not
// change between renders.
const ROW_ACTIONS = {
  quiz: makeAssessmentRowActions(KIND_CONFIG.quiz),
  practice_test: makeAssessmentRowActions(KIND_CONFIG.practice_test),
} satisfies Record<AssessmentKind, unknown>;

export function AssessmentHome({ kind }: { kind: AssessmentKind }) {
  const config: KindConfig = KIND_CONFIG[kind];
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const authReady = useAppSelector(selectAuthReady);
  const loginHref = useLoginHref();
  const [isPending, startTransition] = useTransition();
  const newHref = `/education/${config.base}/new`;

  const listConfig = userId
    ? buildAssessmentListConfig({ config, userId, useRowActions: ROW_ACTIONS[kind] })
    : null;

  const createButton = (
    <Button
      size="sm"
      className="h-11 lg:h-7"
      disabled={isPending}
      onClick={() => startTransition(() => router.push(newHref))}
    >
      <Plus className="h-4 w-4" />
      <span className="max-sm:sr-only">New {config.noun}</span>
    </Button>
  );

  // Literal surface names and builders per kind, so the surface checks can
  // read which targets each page registers.
  const getScope = (list: EntityListSurfaceController<AssessmentListItem>) =>
    buildAssessmentListScope({ list, userId: userId ?? "" });
  const surface = !userId
    ? undefined
    : kind === "quiz"
      ? {
          surfaceName: "matrx-user/education-quizzes",
          getScope,
          getWriteHandlers: (list: EntityListSurfaceController<AssessmentListItem>) =>
            buildQuizWriteHandlers({ list, userId }),
        }
      : {
          surfaceName: "matrx-user/education-practice-tests",
          getScope,
          getWriteHandlers: (list: EntityListSurfaceController<AssessmentListItem>) =>
            buildPracticeTestWriteHandlers({ list, userId }),
        };

  return (
    <>
      <EducationToolHeader title={config.pluralLabel} />
      {listConfig ? (
        <EntityListPage
          config={listConfig}
          // The education layout already starts every route below the header.
          clearsShellHeader={false}
          headerActions={createButton}
          emptyAction={createButton}
          surface={surface}
        />
      ) : authReady && !userId ? (
        <div className="flex h-full items-center justify-center px-4">
          <div className="max-w-sm rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Sign in to see your {config.pluralLabel.toLowerCase()} and create new ones.
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link href={loginHref}>Sign in</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <SuspenseLoader message={`Loading your ${config.pluralLabel.toLowerCase()}`} />
        </div>
      )}
    </>
  );
}
