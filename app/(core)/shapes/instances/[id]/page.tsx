// /shapes/instances/[id] — the canonical kind-instance PERMALINK resolver.
//
// This path IS the sharing-registry `url_path_template` for
// `content_ir_kind_instance` (`/shapes/instances/{id}`), which became
// link-shareable on 2026-08-13 — so this route must resolve for a GRANTEE who
// can open only this row, not the shape studio around it.
//
// It therefore DISPATCHES on the instance's kind (the polymorphic-token
// pattern — one token, many kinds):
//
//   • a kind with a registered presentation → render that report in place
//     (today: `keyword_relationship_research` → KeywordResearchReport, the very
//     same component the /s/[token] lens and the owner workbench render);
//   • every other kind → the previous behavior, a redirect to the kind's
//     Instances tab with the row pre-selected (`/shapes/[kind]/instances?i=`).
//
// A row the viewer cannot read resolves through <AccessGate>, which states the
// TRUE reason (denied / deleted / signed-out) and offers to request access —
// never a bare notFound(). Keep the template and this route in lockstep — see
// `shapeInstancePermalink` in studio/constants.ts.
//
// NOTE: the static `instances` segment wins over the sibling dynamic
// `[kind]` segment by App Router precedence, so `/shapes/instances/...`
// never resolves as a kind named "instances".

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { shapeInstancesHref } from "@/features/content-ir/studio/constants";
import KeywordResearchReport from "@/features/marketing/seo/keyword-research/components/KeywordResearchReport";
import {
  loadKeywordMetricsForArtifact,
  loadKindInstance,
} from "@/features/marketing/seo/keyword-research/data/server";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { createClient } from "@/utils/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { record } = await loadKindInstance(supabase, decodeURIComponent(id));
  return { title: record?.title ?? "Shape instance" };
}

export default async function ShapeInstancePermalinkPage({
  params,
}: PageProps) {
  const id = decodeURIComponent((await params).id);
  const supabase = await createClient();
  const { record, error } = await loadKindInstance(supabase, id);

  if (!record) {
    return (
      <AccessGate
        token="content_ir_kind_instance"
        id={id}
        error={error}
        fallbackHref="/marketing/keyword-research"
        fallbackLabel="Keyword Research"
      />
    );
  }

  if (record.keywordResearch) {
    const artifact = record.keywordResearch;
    const keywords = await loadKeywordMetricsForArtifact(supabase, artifact);
    return (
      <main className="h-full overflow-y-auto bg-textured p-4 sm:p-6">
        <KeywordResearchReport
          artifact={artifact}
          keywords={keywords}
          generatedAt={record.createdAt}
          actions={
            <>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/marketing/keyword-research?keyword=${encodeURIComponent(artifact.primary_keyword)}`}
                >
                  Open workbench
                </Link>
              </Button>
              <ShareButton
                resourceType="content_ir_kind_instance"
                resourceId={record.id}
                resourceName={
                  record.title ?? `Keyword research: ${artifact.primary_keyword}`
                }
              />
            </>
          }
        />
      </main>
    );
  }

  redirect(`${shapeInstancesHref(record.kind)}?i=${encodeURIComponent(id)}`);
}
