"use client";

// features/education/family/components/StudentProgressView.tsx
//
// The read-only guardian detail: a linked student's cross-mode progress. It is a
// thin data wrapper over the SAME <StudyAnalyticsView> the self dashboard renders
// — fed by useGuardianStudentAnalytics (the gated guardian RPCs) with
// readOnly=true, so every study-action CTA is stripped and no navigation touches
// the student's own surfaces. Server-gated upstream (the [studentId] route calls
// guardian_can_view before mounting this); the RPCs re-check on every read.

import { StudyAnalyticsView } from "@/features/education/study/analytics/components/StudyAnalyticsView";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationFamilyScope } from "@/features/surfaces/manifests/education-family.manifest";
import { useGuardianStudentAnalytics } from "../useGuardianStudentAnalytics";

export function StudentProgressView({
  studentId,
  studentLabel,
}: {
  studentId: string;
  /** Display name / email of the student, for the heading. */
  studentLabel: string;
}) {
  const { analytics, mastery, gain, loading, error } =
    useGuardianStudentAnalytics(studentId);

  const possessive = studentLabel.endsWith("s")
    ? `${studentLabel}'`
    : `${studentLabel}'s`;

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-family"
      getScope={() => createEducationFamilyScope({
        view: "student_progress",
        linked_student_id: studentId,
        linked_student_label: studentLabel,
        linked_progress_loading: loading,
        ...(error ? { linked_progress_error: error } : {}),
      })}
    >
    <StudyAnalyticsView
      analytics={analytics}
      mastery={mastery}
      gain={gain}
      loading={loading}
      error={error}
      readOnly
      heading={`${possessive} progress`}
      backHref="/education/family"
      emptyHint={`${studentLabel} hasn't recorded any study activity yet. Mastery, accuracy, trends, and time studied will appear here once they start studying.`}
    />
    </SurfaceRuntimeProvider>
  );
}
