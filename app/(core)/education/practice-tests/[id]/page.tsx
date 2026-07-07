// /education/practice-tests/[id] — the test detail + shareable take URL.
// `?start=1` renders the timed taker; `?phase=`/`?gain=` drive learning-gain.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentDetail } from "@/features/education/assessment/components/AssessmentDetail";
import type { ResultPhase } from "@/features/education/assessment/data/types";

export const metadata: Metadata = toolMetadata("practice-tests");

export default async function PracticeTestDetailPage({
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
