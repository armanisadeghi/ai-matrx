"use client";

/**
 * Draggable card primitives — the mounter for two components that lost theirs.
 *
 * `TransformableCard` (430 lines) and `EnhancedDraggableCardBody` (337 lines)
 * were built, tested, and reachable only from
 * `/legacy/demo/component-demo/draggables/transformable-cards-demo`. That route
 * died with the `(legacy)` route group, which left both primitives with no
 * runtime consumer anywhere in the repo — `pnpm check:unwired` reported them as
 * unfinished for exactly that reason. This page is their new home.
 *
 * Both require `DraggableCardProvider`: it owns card registration, container
 * bounds, and group membership, and both components call `useDraggableCard()`.
 */

import React, { useState } from "react";
import { Boxes, Move, Minimize2 } from "lucide-react";
import { DraggableCardProvider } from "@/components/ui/draggable-card-context";
import {
  TransformableCard,
  TransformableCardContainer,
} from "@/components/ui/transformable-card";
import {
  EnhancedDraggableCardBody,
  EnhancedDraggableCardContainer,
  DropContainer,
} from "@/components/ui/enhanced-draggable-card";

const SNAP_POINTS = [
  { x: 40, y: 40 },
  { x: 360, y: 40 },
  { x: 40, y: 260 },
  { x: 360, y: 260 },
];

function SectionHeading({
  icon: Icon,
  title,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  note: string;
}) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border pb-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground translate-y-0.5" />
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground truncate">{note}</p>
    </div>
  );
}

function CardFace({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-3 w-56">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground leading-snug">{body}</p>
    </div>
  );
}

export default function DraggableCardsDemoPage() {
  const [lastAssigned, setLastAssigned] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, string>>({});

  const trackPosition = (id: string) => (position: { x: number; y: number }) =>
    setPositions((prev) => ({
      ...prev,
      [id]: `${Math.round(position.x)}, ${Math.round(position.y)}`,
    }));

  return (
    <DraggableCardProvider>
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto max-w-5xl px-4 py-4 space-y-6">
          <header className="space-y-1">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-muted-foreground" />
              <h1 className="text-base font-semibold text-foreground">
                Draggable card primitives
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Live mounts for <code>TransformableCard</code> and{" "}
              <code>EnhancedDraggableCardBody</code>. Both lost their only
              consumer when the <code>(legacy)</code> route group was deleted.
            </p>
          </header>

          <section className="space-y-2">
            <SectionHeading
              icon={Minimize2}
              title="TransformableCard"
              note="drag freely; collapses to its pill view"
            />
            <TransformableCardContainer className="h-[340px] rounded-md border border-border bg-card overflow-hidden">
              <TransformableCard
                id="transformable-brief"
                initialPosition={{ x: 32, y: 32 }}
                onPositionChange={trackPosition("transformable-brief")}
                className="bg-background border border-border rounded-md shadow-sm"
                pillView={
                  <span className="px-3 py-1 text-xs">Research brief</span>
                }
              >
                <CardFace
                  title="Research brief"
                  body="Drag me anywhere in this frame. Collapse me and the pill view takes over."
                />
              </TransformableCard>

              <TransformableCard
                id="transformable-notes"
                initialPosition={{ x: 320, y: 150 }}
                onPositionChange={trackPosition("transformable-notes")}
                className="bg-background border border-border rounded-md shadow-sm"
                pillView={<span className="px-3 py-1 text-xs">Notes</span>}
              >
                <CardFace
                  title="Notes"
                  body="A second card proves independent position state and z-ordering on focus."
                />
              </TransformableCard>
            </TransformableCardContainer>
          </section>

          <section className="space-y-2">
            <SectionHeading
              icon={Move}
              title="EnhancedDraggableCardBody"
              note="snap points plus drop containers"
            />
            <EnhancedDraggableCardContainer className="h-[380px] rounded-md border border-border bg-card overflow-hidden">
              <div className="absolute inset-x-3 bottom-3 flex gap-3">
                <DropContainer
                  id="drop-inbox"
                  label="Inbox"
                  className="flex-1 h-24 rounded-md border border-dashed border-border bg-muted/40"
                  onCardAssigned={setLastAssigned}
                />
                <DropContainer
                  id="drop-archive"
                  label="Archive"
                  className="flex-1 h-24 rounded-md border border-dashed border-border bg-muted/40"
                  onCardAssigned={setLastAssigned}
                />
              </div>

              <EnhancedDraggableCardBody
                id="enhanced-alpha"
                group="demo"
                initialPosition={{ x: 40, y: 40 }}
                snapPoints={SNAP_POINTS}
                onPositionChange={trackPosition("enhanced-alpha")}
                className="bg-background border border-border rounded-md shadow-sm"
              >
                <CardFace
                  title="Alpha"
                  body="Release me near a corner to snap, or over a container to assign."
                />
              </EnhancedDraggableCardBody>

              <EnhancedDraggableCardBody
                id="enhanced-beta"
                group="demo"
                initialPosition={{ x: 360, y: 40 }}
                snapPoints={SNAP_POINTS}
                onPositionChange={trackPosition("enhanced-beta")}
                className="bg-background border border-border rounded-md shadow-sm"
              >
                <CardFace
                  title="Beta"
                  body="Same group as Alpha, so container assignment tracks both."
                />
              </EnhancedDraggableCardBody>
            </EnhancedDraggableCardContainer>
          </section>

          <section className="rounded-md border border-border bg-card p-3">
            <p className="text-xs font-medium text-foreground">Live state</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
              {Object.entries(positions).map(([id, value]) => (
                <div key={id} className="flex gap-1.5 min-w-0">
                  <dt className="text-muted-foreground truncate">{id}</dt>
                  <dd className="text-foreground tabular-nums">{value}</dd>
                </div>
              ))}
              <div className="flex gap-1.5 min-w-0">
                <dt className="text-muted-foreground">last assigned</dt>
                <dd className="text-foreground truncate">
                  {lastAssigned ?? "none"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </DraggableCardProvider>
  );
}
