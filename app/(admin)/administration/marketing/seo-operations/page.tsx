import type { Metadata } from "next";
import { SeoOperationsClient } from "@/features/admin/seo-operations/SeoOperationsClient";

/**
 * SEO Operations — the one console over every SEO automation, mandate, and
 * agent (Arman's ruling, 2026-08-26): nothing recurring gets switched on until
 * it can be triggered here by hand, watched live, and its results judged.
 * Admin gating is the (admin) layout's job — never re-gate here.
 */

export const metadata: Metadata = {
  title: "SEO Operations",
  description:
    "Every SEO automation and agent in one place: run any of them manually, watch the run live, and judge the results before trusting a schedule.",
};

export default function SeoOperationsPage() {
  return <SeoOperationsClient />;
}
