"use client";

// features/education/classes/components/ClassTestView.tsx
//
// A test of a class: the units it covers, everything filed in them (decks,
// quizzes, notes, files — combined, deduped), the practice tests made for it,
// "Make a practice test" (owner) and "Study" (everyone in the class). A member
// sees the page read-only plus Study. Class access is the class's own
// (`edu_class_state`) — the page asks the same authority the hub does.

import Link from "next/link";
import { CalendarClock, ClipboardCheck } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { ReadFailure } from "@ai-matrx/design-system";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { Button } from "@/components/ui/button";
import { useClassAccess } from "../hooks/useClassAccess";
import { useClassTestMaterial } from "../hooks/useClassTestMaterial";
import { ContentGroups } from "./ClassHubView";
import { MakePracticeTestButton } from "./MakePracticeTestButton";

export function ClassTestView({ classId, testId }: { classId: string; testId: string }) {
  const access = useClassAccess(classId);
  const state = access.state;
  const canOpen = !!state && (state.isOwner || state.myStatus === "active");
  const cls = state ? { id: state.classId, organizationId: state.organizationId } : { id: classId, organizationId: null };
  const material = useClassTestMaterial(cls, testId, canOpen);
  const practice = useEntityTitles(
    material.practiceTestIds.map((id) => ({ token: "assessment", id, label: null })),
  );
  const classHref = `/education/classes/${classId}`;

  if (access.loading && !state) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (!state || !canOpen) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <AccessGate
          token="scope"
          id={classId}
          error={access.error}
          onRetry={() => void access.refresh()}
          fallbackHref="/education/classes"
          fallbackLabel="Classes"
        />
      </div>
    );
  }

  const test = material.test;
  const settled = !material.loading;

  return (
    <>
      <RecordPageHeader
        backHref={classHref}
        parents={[{ label: state.name, href: classHref }]}
        record={{ name: test?.name ?? "Test" }}
      />
      <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-5 p-4">
        {material.error ? (
          <ReadFailure error={material.error} what="this test" onRetry={() => void material.reload()} className="m-0" />
        ) : !settled ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !test ? (
          <p className="text-sm text-muted-foreground">This test is not part of this class.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {test.date && (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4" />
                  {test.date}
                </span>
              )}
              <span>{material.units.map((u) => u.name).join(" · ")}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" asChild>
                <Link href={`${classHref}/tests/${testId}/study`}>Study</Link>
              </Button>
              {state.isOwner && (
                <MakePracticeTestButton
                  cls={cls}
                  test={test}
                  sources={material.sources}
                  onMade={() => void material.reloadPracticeTests()}
                />
              )}
            </div>

            {material.practiceTestIds.length > 0 && (
              <section className="space-y-1.5">
                <h2 className="text-sm font-medium text-foreground">Practice tests</h2>
                <ul className="space-y-1.5">
                  {material.practiceTestIds.map((id) => (
                    <li key={id}>
                      <Link
                        href={`/education/practice-tests/${id}`}
                        className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
                      >
                        <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          {practice.titleFor({ token: "assessment", id, label: null })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">
                Material
                {material.items.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground">({material.items.length})</span>
                )}
              </h2>
              {material.groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing filed in these units yet.</p>
              ) : (
                <ContentGroups groups={material.groups} />
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
