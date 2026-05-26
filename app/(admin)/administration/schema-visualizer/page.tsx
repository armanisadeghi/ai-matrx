"use client";

import SchemaVisualizer from "@/features/administration/schema-visualizer";

export default function SchemaVisualizerPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <SchemaVisualizer />
    </div>
  );
}
