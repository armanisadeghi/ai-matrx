import { SummaryDetail } from "@/features/education/onboard/components/SummaryDetail";

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SummaryDetail id={id} />;
}
