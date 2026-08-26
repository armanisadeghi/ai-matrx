import { permanentRedirect } from "next/navigation";

/**
 * `/hr/inbox/{instance}?step={step}` — the deep-link form SPEC-NOTIFICATIONS
 * §2.15 still prints. The instance and step survive the redirect, so an old link
 * still opens the exact object rather than dumping the reader on a list.
 */
export default async function HrInboxDeepLinkRedirect({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string[] }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { slug } = await params;
    const query = await searchParams;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (typeof value === "string") search.set(key, value);
        else if (Array.isArray(value) && value[0]) search.set(key, value[0]);
    }
    const suffix = search.toString();
    permanentRedirect(`/hr/tasks/${slug.join("/")}${suffix ? `?${suffix}` : ""}`);
}
