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
 * THE CONTRACT, learned the hard way (two production iterations got these wrong
 * and the page looked broken):
 *
 *  1. Each card OWNS its chrome and its size — `min-h-80 w-80 p-6` plus its own
 *     background, border and shadow. Passing a `className` with more padding,
 *     another background or another border fights it; the card renders bare.
 *  2. Each card's wrapper contains ONLY an absolutely-positioned motion layer,
 *     so the wrapper has ZERO height and collapses out of flow. Flex/grid
 *     layout can never separate two cards — they all pile onto the same origin
 *     and spill over whatever follows them on the page. The consumer MUST give
 *     them a `relative` container with an explicit height and place each card
 *     with `initialPosition`, which is a coordinate in that container.
 *  3. A card is 320px wide and 320–384px tall before content, so the container
 *     has to be tall enough to hold them or it hides the primitive it exists
 *     to show — and it needs `overflow-hidden` or a dragged card escapes onto
 *     the rest of the page.
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
  { x: 24, y: 24 },
  { x: 420, y: 24 },
  { x: 24, y: 200 },
  { x: 420, y: 200 },
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

/** Bare content. The card supplies padding, background, border and shadow. */
function CardFace({ title, body }: { title: string; body: string }) {
  return (
    <>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1.5 text-xs leading-snug opacity-70">{body}</p>
    </>
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
              Each card brings its own 320px frame — this page adds none.
            </p>
          </header>

          <section className="space-y-2">
            <SectionHeading
              icon={Minimize2}
              title="TransformableCard"
              note="drag to reposition; click the pill to collapse and restore"
            />
            <p className="text-xs text-amber-600 dark:text-amber-500">
              One card only, deliberately. Unlike its sibling,{" "}
              <code>TransformableCard</code> wraps its motion layer in a{" "}
              <code>relative</code> div, so each card anchors to its own
              zero-height wrapper instead of this container and{" "}
              <code>initialPosition</code> cannot separate two of them — they
              stack on the same origin. Mounting a second one here would
              misrepresent the primitive.
            </p>
            <TransformableCardContainer className="h-[460px] overflow-hidden rounded-md border border-border bg-card">
              <div className="absolute inset-0">
                <TransformableCard
                  id="transformable-brief"
                  initialPosition={{ x: 24, y: 24 }}
                  onPositionChange={trackPosition("transformable-brief")}
                  pillView={
                    <span className="px-2 text-sm">Research brief</span>
                  }
                >
                  <CardFace
                    title="Research brief"
                    body="Drag me anywhere in this frame. Collapse me and the pill view takes over; the pill is draggable too, and restores the full card."
                  />
                </TransformableCard>

              </div>
            </TransformableCardContainer>
          </section>

          <section className="space-y-2">
            <SectionHeading
              icon={Move}
              title="EnhancedDraggableCardBody"
              note="snap points, plus drop containers that claim a card"
            />
            <EnhancedDraggableCardContainer className="h-[620px] overflow-hidden rounded-md border border-border bg-card">
              <div className="absolute inset-0">
                <EnhancedDraggableCardBody
                  id="enhanced-alpha"
                  group="demo"
                  initialPosition={{ x: 24, y: 24 }}
                  snapPoints={SNAP_POINTS}
                  onPositionChange={trackPosition("enhanced-alpha")}
                >
                  <CardFace
                    title="Alpha"
                    body="Release me near a snap point to settle, or over a container below to be assigned to it."
                  />
                </EnhancedDraggableCardBody>

                <EnhancedDraggableCardBody
                  id="enhanced-beta"
                  group="demo"
                  initialPosition={{ x: 420, y: 24 }}
                  snapPoints={SNAP_POINTS}
                  onPositionChange={trackPosition("enhanced-beta")}
                >
                  <CardFace
                    title="Beta"
                    body="Same group as Alpha. A card assigned to a container gets a ring; the container reports which card it claimed."
                  />
                </EnhancedDraggableCardBody>
              </div>

              <div className="absolute inset-x-4 bottom-4 flex gap-4">
                <DropContainer
                  id="drop-inbox"
                  label="Inbox"
                  className="flex-1 h-28 rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground"
                  onCardAssigned={setLastAssigned}
                />
                <DropContainer
                  id="drop-archive"
                  label="Archive"
                  className="flex-1 h-28 rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground"
                  onCardAssigned={setLastAssigned}
                />
              </div>
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
