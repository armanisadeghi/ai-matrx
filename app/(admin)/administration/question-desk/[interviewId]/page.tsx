import { InterviewClient } from "@/features/question-desk/components/InterviewClient";

/**
 * The interview screen. `?q=<slug>` is the notification deep link's question —
 * `question_desk.answer_recorded` and the desk's own links both carry it, so
 * the route must open that exact question rather than the first open one.
 */
export default async function QuestionDeskInterviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ interviewId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { interviewId } = await params;
  const { q } = await searchParams;
  return <InterviewClient interviewId={interviewId} initialSlug={q} />;
}
