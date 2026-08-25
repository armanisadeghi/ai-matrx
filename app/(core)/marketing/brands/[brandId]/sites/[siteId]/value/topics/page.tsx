import { redirect } from "next/navigation";

/**
 * Compatibility door for receipts and saved links created before the
 * user-facing vocabulary settled on Offering. The database remains seo.topic.
 */
export default async function RetiredTopicTreePage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ brandId, siteId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((entry) => next.append(key, entry));
    else if (value !== undefined) next.set(key, value);
  }
  const suffix = next.size > 0 ? `?${next.toString()}` : "";
  redirect(
    `/marketing/brands/${brandId}/sites/${siteId}/value/offerings${suffix}`,
  );
}
