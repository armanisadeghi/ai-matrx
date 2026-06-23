"use client";

import React, { useCallback, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  openOverlay,
  closeOverlay,
  selectIsOverlayOpen,
  selectOpenInstances,
} from "@/lib/redux/slices/overlaySlice";
import { openOverlayInstance } from "@/lib/redux/thunks/overlayThunks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Layers, Plus, X, Info } from "lucide-react";

// ============================================================================
// DEMO CONTENT SAMPLES
// ============================================================================

const SAMPLES = [
  {
    id: "sample-a",
    label: "Markdown Basics",
    content: `# Markdown Basics

This is **instance A**. It has its own isolated state.

## Features
- Independent open/close
- Independent content
- Multiple can coexist

\`\`\`ts
dispatch(openOverlay({ overlayId: 'fullScreenEditor', instanceId: myUuid, data: { content: '...' } }));
\`\`\`
`,
  },
  {
    id: "sample-b",
    label: "Code Walkthrough",
    content: `# Instanced Overlay Architecture

This is **instance B** — a completely separate editor.

## How It Works

Each instance has its own \`instanceId\`:

\`\`\`ts
// Singleton (default behavior, unchanged)
dispatch(openOverlay({ overlayId: 'fullScreenEditor', data: { content } }));

// Instanced (multiple independent copies)
const id = crypto.randomUUID();
dispatch(openOverlayInstance({
  overlayId: 'fullScreenEditor',
  instanceId: id,
  data: { content },
}));
\`\`\`

Both can be open **simultaneously** with independent state.
`,
  },
  {
    id: "sample-c",
    label: "Schema Defaults",
    content: `# Schema Registry

Registered overlays get **default data merging** via \`openOverlayInstance\`.

## Schema for \`fullScreenEditor\`

\`\`\`ts
fullScreenEditor: {
  defaults: {
    content: '',
    tabs: ['write', 'matrx_split', 'markdown', 'wysiwyg', 'preview'],
    initialTab: 'matrx_split',
    showSaveButton: true,
    showCopyButton: true,
  },
},
\`\`\`

Caller data **overrides** schema defaults. No schema = no merging.
`,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function OverlayInstancesDemo() {
  const dispatch = useAppDispatch();

  // Stable UUIDs per sample — generated once per page load, never regenerated.
  // This is what makes "reopen" work: same UUID → same instance → saved content restored.
  const instanceIdsRef = useRef<Record<string, string>>({});
  const getInstanceId = (sampleId: string): string => {
    if (!instanceIdsRef.current[sampleId]) {
      instanceIdsRef.current[sampleId] = crypto.randomUUID();
    }
    return instanceIdsRef.current[sampleId];
  };

  const openInstances = useAppSelector((s) =>
    selectOpenInstances(s, "fullScreenEditor"),
  );

  // Is the singleton currently open? Used to decide whether to open or just
  // surface it (we don't re-dispatch so we never reset its internal state).
  const isSingletonOpen = useAppSelector((s) =>
    selectIsOverlayOpen(s, "fullScreenEditor", "default"),
  );

  // Open the singleton (default) instance.
  // Only dispatches on first open — if it's already open, does nothing so the
  // component stays mounted with all its internal state intact.
  const openSingleton = useCallback(() => {
    if (isSingletonOpen) return; // already open — don't reset it
    dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        data: {
          content: `# Singleton Editor\n\nThis is the classic singleton behavior.\nOnly one copy exists at a time.\n\nEdit this content, save it, close it, and reopen — your edits persist.`,
          mode: "free",
          conversationId: undefined,
          messageId: undefined,
          onSave: undefined,
          tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
          initialTab: "matrx_split",
          analysisData: undefined,
          title: "Singleton Editor",
          showSaveButton: true,
          showCopyButton: true,
        },
      }),
    );
  }, [dispatch, isSingletonOpen]);

  // Open (or re-open) a named instance using a stable UUID.
  // On first click: creates the instance with initial content.
  // On subsequent clicks: openOverlayInstance detects existing overlayDataSlice
  // state and reopens with the last-saved content — no reset.
  const openInstance = useCallback(
    (sample: (typeof SAMPLES)[0]) => {
      const instanceId = getInstanceId(sample.id);
      dispatch(
        openOverlayInstance({
          overlayId: "fullScreenEditor",
          instanceId,
          data: {
            content: sample.content,
            title: sample.label,
            showSaveButton: true,
            showCopyButton: true,
            initialTab: "matrx_split",
          },
        }),
      );
    },
    [dispatch],
  );

  // Close a specific instance
  const closeInstance = useCallback(
    (instanceId: string) => {
      dispatch(closeOverlay({ overlayId: "fullScreenEditor", instanceId }));
    },
    [dispatch],
  );

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Instanced Overlay System</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Demonstrates singleton vs. multi-instance overlays using the same{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              fullScreenEditor
            </code>{" "}
            overlay type.
          </p>
        </div>

        <Separator />

        {/* Live instance tracker */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Open instances:</span>
          {openInstances.length === 0 ? (
            <Badge variant="secondary">None</Badge>
          ) : (
            openInstances.map(({ instanceId }) => (
              <Badge
                key={instanceId}
                variant="default"
                className="flex items-center gap-1 cursor-pointer"
                onClick={() => closeInstance(instanceId)}
              >
                {instanceId === "default"
                  ? "singleton"
                  : instanceId.slice(0, 8)}
                <X className="h-3 w-3" />
              </Badge>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Singleton card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Singleton (classic behavior)
              </CardTitle>
              <CardDescription>
                Uses{" "}
                <code className="text-xs">
                  instanceId = &apos;default&apos;
                </code>
                . All existing dispatch sites work unchanged. Opening again
                while open simply updates the content.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={openSingleton}
                className="w-full"
                variant="default"
                disabled={isSingletonOpen}
              >
                {isSingletonOpen ? "Already Open" : "Open Singleton Editor"}
              </Button>
              <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Uses <code>instanceId = &apos;default&apos;</code>. The
                  component is never remounted while open — close it, edit,
                  save, reopen and your saved content is restored from Redux.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Instanced card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Instanced (new capability)
              </CardTitle>
              <CardDescription>
                Each click opens a fully independent editor with its own UUID.
                All instances can be open simultaneously — they don&apos;t
                interfere.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {SAMPLES.map((sample) => {
                const instanceId = instanceIdsRef.current[sample.id];
                const alreadyTracked = !!instanceId;
                return (
                  <Button
                    key={sample.id}
                    onClick={() => openInstance(sample)}
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {alreadyTracked
                      ? `Reopen: ${sample.label}`
                      : `Open: ${sample.label}`}
                  </Button>
                );
              })}
              <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground mt-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Uses <code>openOverlayInstance</code> thunk which generates a
                  UUID, merges schema defaults, writes to{" "}
                  <code>overlayDataSlice</code>, and returns the{" "}
                  <code>instanceId</code> to the caller.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How it works reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="font-medium">overlaySlice</p>
                <p className="text-xs text-muted-foreground">
                  State shape:{" "}
                  <code>
                    Record&lt;overlayId, Record&lt;instanceId, {"{"} isOpen,
                    data {"}"}&gt;&gt;
                  </code>
                  . The <code>selectOpenInstances(state, overlayId)</code>{" "}
                  selector returns all open instances for a given type.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium">overlayDataSlice</p>
                <p className="text-xs text-muted-foreground">
                  Keyed by <code>overlayId:instanceId</code> (e.g.{" "}
                  <code>fullScreenEditor:uuid-123</code>). Stores rich, mutable
                  state per instance. Direct Redux dispatch updates it from
                  anywhere.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium">OverlayController</p>
                <p className="text-xs text-muted-foreground">
                  Renders each open instance via{" "}
                  <code>
                    {`htmlPreviewInstances.map(({ instanceId, data }) => ...)`}
                  </code>
                  . Each gets a stable <code>key=instanceId</code> for correct
                  React reconciliation.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
