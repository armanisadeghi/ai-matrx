// Per-kind Shape System page — /administration/kind-registry/[kind]
// (super-admin gated by the (admin) layout). Deep-linkable; tabs:
// Preview (live kind_example rows rendered through the REAL production
// BlockRenderer → applyIrKindRoute path) · Gate (browser-run dual gate,
// read-only) · Schema (fields + emitted_json_schema) · Assets (the kind's
// shape-doctor row + live skill / content-block / component / surface lists).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import KindDetailClient from "@/features/content-ir/admin/KindDetailClient";
import { gatherKindDetail } from "@/features/content-ir/admin/shape-doctor-server";

interface PageProps {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind } = await params;
  const slug = decodeURIComponent(kind);
  return {
    title: `${slug} — Kind Registry`,
    description: `Preview, gate, schema, and asset status for the "${slug}" kind.`,
  };
}

export default async function KindDetailPage({ params, searchParams }: PageProps) {
  const [{ kind }, sp] = await Promise.all([params, searchParams]);
  const detail = await gatherKindDetail(decodeURIComponent(kind));
  if (!detail) notFound();

  const initialTab = typeof sp.tab === "string" ? sp.tab : undefined;
  return <KindDetailClient detail={detail} initialTab={initialTab} />;
}
