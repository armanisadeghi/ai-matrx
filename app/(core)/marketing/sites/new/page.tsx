import { permanentRedirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * LEGACY: new-website intake moved to `/marketing/brands/new-website` (a static
 * child of the roster, where it cannot collide with a brand key). `?brand=`
 * pre-binds the new site to a client, so the whole query rides along.
 */
export default async function LegacyNewMarketingSiteRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value))
      value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  permanentRedirect(
    `/marketing/brands/new-website${search ? `?${search}` : ""}`,
  );
}
