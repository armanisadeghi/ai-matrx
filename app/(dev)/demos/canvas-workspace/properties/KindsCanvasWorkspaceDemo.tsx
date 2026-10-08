"use client";

/**
 * /demos/canvas-workspace/properties — the properties-panel proof.
 *
 * The canvas is a plain grid of the platform's registered shapes (real rows
 * from `content_ir.kind_definition`); the Properties tab lists the same rows
 * so the panel's fading, hover-scrollbar list is exercised with real data.
 * Selecting a row on either side selects it on both, and the Selected tab
 * shows that shape's stored fields.
 */

import { useState } from "react";
import { Shapes } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorNotice } from "@ai-matrx/design-system";
import { ChatCanvasWorkspace } from "@ai-matrx/chat/canvas/workspace/ChatCanvasWorkspace";
import type { CanvasWorkspaceLayout } from "@ai-matrx/chat/canvas/workspace/workspace-cookies";

export interface DemoKindRow {
  id: string;
  kind: string;
  label: string;
  version: number;
  is_active: boolean;
}

const TITLE = "Registered shapes";

export function KindsCanvasWorkspaceDemo({
  workspaceId,
  kinds,
  loadError,
  initialLayout,
}: {
  workspaceId: string;
  kinds: DemoKindRow[];
  loadError: string | null;
  initialLayout: CanvasWorkspaceLayout;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = kinds.find((k) => k.id === selectedId) ?? null;

  const list = (
    <ul className="flex flex-col">
      {kinds.map((kind) => (
        <li key={kind.id}>
          <button
            type="button"
            onClick={() => setSelectedId(kind.id)}
            className={cn(
              "flex h-6 w-full items-center gap-1.5 rounded px-1 text-left text-xs text-foreground/80 hover:bg-accent",
              kind.id === selectedId && "bg-accent text-foreground",
            )}
          >
            <span className="text-muted-foreground">#</span>
            <span className="min-w-0 flex-1 truncate">{kind.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const selectedTab = selected ? (
    <dl className="space-y-2 px-1 text-xs">
      <div>
        <dt className="text-muted-foreground">Label</dt>
        <dd className="text-foreground">{selected.label}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Kind</dt>
        <dd className="font-mono text-foreground">{selected.kind}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Version</dt>
        <dd className="text-foreground">{selected.version}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="text-foreground">{selected.is_active ? "Active" : "Inactive"}</dd>
      </div>
    </dl>
  ) : (
    <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
      <span className="text-xs text-foreground">Nothing selected</span>
      <span className="text-[11px] text-muted-foreground">Click a shape to see it here.</span>
    </div>
  );

  return (
    <ChatCanvasWorkspace
      id={workspaceId}
      title={TITLE}
      byline="By you"
      initialLayout={initialLayout}
      getCanvasContext={() => ({
        key: "registered_shapes",
        type: "json",
        label: TITLE,
        value: {
          count: kinds.length,
          selected: selected ? { kind: selected.kind, label: selected.label } : null,
          shapes: kinds.map((k) => ({ kind: k.kind, label: k.label })),
        },
      })}
      contextChip={{
        id: "registered-shapes",
        contextKey: "registered_shapes",
        icon: Shapes,
        label: TITLE,
        word: "Shapes",
        detail: `${kinds.length}`,
        hint: "The agent sees this list of shapes with every message.",
        onOpen: () => setSelectedId(null),
      }}
      properties={{
        tabs: [
          { id: "properties", label: "Properties", content: list },
          { id: "selected", label: "Selected", content: selectedTab },
        ],
      }}
      canvas={
        <div className="h-full overflow-y-auto bg-muted/40 p-6">
          {loadError ? (
            <ErrorNotice
              className="mb-4"
              title="The shapes could not be read"
              message={loadError}
              operation="Read content_ir.kind_definition"
            />
          ) : null}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {kinds.map((kind) => (
              <button
                key={kind.id}
                type="button"
                onClick={() => setSelectedId(kind.id)}
                className={cn(
                  "rounded-lg border border-border bg-card p-3 text-left text-sm shadow-sm hover:border-primary/50",
                  kind.id === selectedId && "border-primary ring-1 ring-primary",
                )}
              >
                <span className="block truncate font-medium text-foreground">{kind.label}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">{kind.kind}</span>
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}
