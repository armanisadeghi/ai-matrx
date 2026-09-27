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

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Building2, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListController } from "@/lib/entity-list/config";
import {
  useOpenLiveRunWindow,
  type LiveRunWindowHandle,
} from "@/features/overlays/openers/liveRunWindow";
import { useAssessmentGeneration } from "../data/useAssessmentGeneration";
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
  const userId = useAppSelector(selectUserId);
  const authReady = useAppSelector(selectAuthReady);
  const loginHref = useLoginHref();
  const newHref = `/education/${config.base}/new`;
  // THE one generation path, shared with the New form — the agent's
  // generate_<plural> target runs it here, metered exactly the same.
  const generation = useAssessmentGeneration(config);
  const generator = { run: generation.run, check: generation.check };

  // An agent-started generation streams into the floating live-run window,
  // never a spinner (THE FLOATING LAW).
  const openLiveRun = useOpenLiveRunWindow();
  const liveRun = useRef<LiveRunWindowHandle | null>(null);
  const { conversationId, isGenerating } = generation;
  useEffect(() => {
    if (!isGenerating || !conversationId) return;
    if (liveRun.current) liveRun.current.update({ conversationId });
    else
      liveRun.current = openLiveRun({
        conversationId,
        label: `Generating a ${config.noun}`,
        workingMessage: `Writing the ${config.noun}'s questions…`,
        completeMessage: `The ${config.noun} is saved in your list.`,
      });
  }, [isGenerating, conversationId, openLiveRun, config.noun]);
  useEffect(() => {
    if (!isGenerating) liveRun.current = null;
  }, [isGenerating]);

  const listConfig = userId
    ? buildAssessmentListConfig({ config, userId, useRowActions: ROW_ACTIONS[kind] })
    : null;

  // Navigation is a link. In the tab row the label hides on a phone (the
  // accessible name stays); the empty state always shows it.
  const createButton = (showLabel: boolean) => (
    <Button asChild size="sm" className="h-11 lg:h-7">
      <Link href={newHref} aria-label={`New ${config.noun}`}>
        <Plus className="h-4 w-4" />
        <span className={showLabel ? undefined : "max-sm:sr-only"}>New {config.noun}</span>
      </Link>
    </Button>
  );

  // Each lane's empty state offers what fits THAT lane: a new quiz lands in
  // Mine, so only Mine offers New; every other lane points to the lanes that
  // do hold quizzes (a member's empty Mine names My Orgs, one tap away).
  const emptyAction = (list: EntityListController<AssessmentListItem>) => {
    const lane = list.query.scope.kind;
    const counts = list.counts.byKind;
    const plural = config.pluralLabel.toLowerCase();
    const doors = (
      [
        { kind: "mine", label: "Mine", icon: User },
        { kind: "orgs", label: "My Orgs", icon: Building2 },
      ] as const
    ).filter((d) => d.kind !== lane && (counts[d.kind] ?? 0) > 0);
    const hint =
      lane === "mine" && (counts.orgs ?? 0) > 0
        ? `Your organizations share ${counts.orgs} ${counts.orgs === 1 ? config.noun : plural} with you.`
        : lane === "public"
          ? `Nobody has published a ${config.noun} yet.`
          : lane === "shared"
            ? `Nobody has shared a ${config.noun} with you directly.`
            : null;
    return (
      <div className="flex flex-col items-center gap-3">
        {hint ? <p className="max-w-sm text-sm text-muted-foreground">{hint}</p> : null}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {doors.map((d) => (
            <Button
              key={d.kind}
              size="sm"
              variant="outline"
              className="h-11 lg:h-8"
              onClick={() =>
                list.setScope(d.kind === "orgs" ? { kind: "orgs", organizationId: null } : { kind: "mine" })
              }
            >
              <d.icon className="h-4 w-4" />
              See {d.label} ({counts[d.kind]})
            </Button>
          ))}
          {lane === "mine" ? createButton(true) : null}
        </div>
      </div>
    );
  };

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
            buildQuizWriteHandlers({ list, userId, generator }),
        }
      : {
          surfaceName: "matrx-user/education-practice-tests",
          getScope,
          getWriteHandlers: (list: EntityListSurfaceController<AssessmentListItem>) =>
            buildPracticeTestWriteHandlers({ list, userId, generator }),
        };

  return (
    <>
      <EducationToolHeader title={config.pluralLabel} />
      <generation.Gates />
      {listConfig ? (
        <EntityListPage
          config={listConfig}
          // The education layout already starts every route below the header.
          clearsShellHeader={false}
          headerActions={createButton(false)}
          emptyAction={emptyAction}
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
