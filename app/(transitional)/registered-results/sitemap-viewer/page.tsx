"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function SitemapViewerPage() {
  const router = useRouter();

  return (
    <div className="relative p-6 max-w-2xl">
      <Button
        onClick={() => router.back()}
        variant="outline"
        size="sm"
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>
      <h1 className="text-lg font-semibold">Sitemap viewer (removed)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This registered-results viewer depended on the deleted legacy workflow
        results components. It will be rebuilt when the workflows-xyflow system
        is restored.
      </p>
    </div>
  );
}
