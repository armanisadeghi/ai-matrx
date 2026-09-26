import { notFound } from "next/navigation";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import {
  IntelligenceTargetRoute,
  intelligencePageTitle,
} from "@/features/mandates/feature-intelligence/IntelligenceTargetRoute";
import { unassignedTarget } from "@/features/mandates/feature-intelligence/placement";
import { registryDomain } from "@/features/mandates/feature-intelligence/taxonomy";

/**
 * /intelligence/[domain]/unassigned — a registry Domain's AI jobs that no
 * registry Feature holds yet (features/mandates/feature-intelligence,
 * `placement.ts`). The segment is the Domain id (`education`, `marketing`).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature: domain } = await params;
  return createDynamicRouteMetadata("/mandates", {
    title: registryDomain(domain)
      ? intelligencePageTitle(unassignedTarget(domain))
      : "Intelligence",
    description: "AI jobs no registry feature holds yet.",
    letter: "IN",
  });
}

export default async function DomainUnassignedRoute({
  params,
  searchParams,
}: {
  params: Promise<{ feature: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ feature: domain }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!registryDomain(domain)) notFound();
  return (
    <IntelligenceTargetRoute
      target={unassignedTarget(domain)}
      path={`/intelligence/${domain}/unassigned`}
      query={query}
    />
  );
}
