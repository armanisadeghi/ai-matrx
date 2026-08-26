import { OrganizationPerformanceReviewsPage } from "@/features/employee-performance-reviews/components/OrganizationPerformanceReviewsPage";

export default async function PerformanceReviewsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  return <OrganizationPerformanceReviewsPage orgSlugOrId={orgId} />;
}
