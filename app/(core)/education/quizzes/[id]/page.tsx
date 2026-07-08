// /education/quizzes/[id] — the quiz detail + shareable take URL. `?start=1`
// renders the taker directly; `?phase=`/`?gain=` drive learning-gain takings.
// Gated by the quiz's view access (P7 useAccess, client-side) + RLS.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentDetail } from "@/features/education/assessment/components/AssessmentDetail";
import type { ResultPhase } from "@/features/education/assessment/data/types";

export const metadata: Metadata = toolMetadata("quizzes");

export default async function QuizDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const start = sp.start === "1" || sp.start === "true";
  const phase = (typeof sp.phase === "string" ? sp.phase : "standalone") as ResultPhase;
  const gain = typeof sp.gain === "string" ? sp.gain : null;
  return (
    <AssessmentDetail
      assessmentId={id}
      start={start}
      phase={phase}
      gainGroupId={gain}
    />
  );
}
