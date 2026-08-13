// features/administration/schema-visualizer/SchemaVisualizerLayout.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DynamicResizableLayout } from "@/components/matrx/resizable/DynamicResizableLayout";
import SchemaVisualizer from ".";
import { useSchemaVisualizerStore } from "./store";
import { SchemaDetails } from "./SchemaDetails";
import { SchemaActions } from "./SchemaActions";
import type { SelectedElement } from "./types-standalone";

function parseSelectedElement(raw: string | null): SelectedElement | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const candidate = value as Record<string, unknown>;
    if (
      (candidate.type === "table" ||
        candidate.type === "field" ||
        candidate.type === "relationship") &&
      typeof candidate.tableName === "string"
    ) {
      return value as SelectedElement;
    }
  } catch {
    return null;
  }
  return null;
}

export function SchemaVisualizerLayout() {
  const searchParams = useSearchParams();
  const { isDetailsOpen, hydrateFromUrl } = useSchemaVisualizerStore();
  const selectedParam = searchParams.get("selected");

  useEffect(() => {
    hydrateFromUrl(parseSelectedElement(selectedParam));
  }, [hydrateFromUrl, selectedParam]);

  const panels = [
    {
      content: <SchemaActions />,
      defaultSize: 20,
      minSize: 10,
      maxSize: 30,
      collapsible: true,
    },
    {
      content: <SchemaVisualizer />,
      defaultSize: isDetailsOpen ? 50 : 70,
      minSize: 30,
      maxSize: isDetailsOpen ? 60 : 80,
    },
    {
      content: <SchemaDetails />,
      defaultSize: isDetailsOpen ? 30 : 10,
      minSize: 10,
      maxSize: 50,
      collapsible: true,
    },
  ];

  return (
    <DynamicResizableLayout
      key={isDetailsOpen ? "details-open" : "details-closed"}
      panels={panels}
      direction="horizontal"
      className="bg-background"
    />
  );
}
