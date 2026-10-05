"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import SitemapViewer from "@/features/registered-results/components/SitemapViewer";

export default function SitemapViewerPage() {
  const router = useRouter();
  const brokerId = "SITEMAP_DATA";

  const handleBack = () => {
    router.back();
  };

  return (
    <div className="relative">
      <div className="fixed top-4 left-4 z-50">
        <Button
          icon={<ArrowLeft />}
          onClick={handleBack}
          variant="outline"
        >
          Back
        </Button>
      </div>

      <SitemapViewer nodeData={null} brokerId={brokerId} />
    </div>
  );
}
