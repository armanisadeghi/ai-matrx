"use client";

import { SchemaVisualizerLayout } from "@/features/administration/schema-visualizer/SchemaVisualizerLayout";

export default function EnhancedSchemaVisualizerPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <SchemaVisualizerLayout />
    </div>
  );
}
