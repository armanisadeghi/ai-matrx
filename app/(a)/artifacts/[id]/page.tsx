"use client";

import { use } from "react";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CmsArtifactDetail } from "@/features/artifacts/components/CmsArtifactDetail";

interface CmsDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CmsDetailPage({ params }: CmsDetailPageProps) {
  const { id } = use(params);

  return (
    <>
      <PageSpecificHeader>
        <div className="flex items-center gap-3 w-full px-2">
          <Link href="/cms">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Content Library</span>
            </Button>
          </Link>
          <div className="flex items-center gap-2 ml-auto mr-auto">
            <LayoutGrid className="h-5 w-5 text-primary flex-shrink-0" />
            <h1 className="text-base font-bold text-foreground">
              Artifact Detail
            </h1>
          </div>
        </div>
      </PageSpecificHeader>

      <div className="h-[calc(100dvh-var(--header-height)*2)] w-full overflow-auto bg-textured">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 py-6 max-w-[1400px]">
          <CmsArtifactDetail artifactId={id} />
        </div>
      </div>
    </>
  );
}
