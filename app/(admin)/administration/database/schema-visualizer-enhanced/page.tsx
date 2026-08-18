"use client";

import { Suspense } from "react";
import { SchemaVisualizerLayout } from "@/features/administration/schema-visualizer/SchemaVisualizerLayout";

export default function EnhancedSchemaVisualizerPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading schema visualizer…
          </div>
        }
      >
        <SchemaVisualizerLayout />
      </Suspense>
    </div>
  );
}
