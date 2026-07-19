import { PageWorkspace } from "@/features/marketing/components/pages/PageWorkspace";

export default async function MarketingPageDetail({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  return <PageWorkspace pageId={pageId} />;
}
