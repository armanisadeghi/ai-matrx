"use client";

import { ContainerDropProvider } from "@/components/official-candidate/container-drop/ContainerDropProvider";
import { DragOverlayPortal } from "@/components/official-candidate/container-drop/DragOverlayPortal";
import { SourceTray } from "@/components/official-candidate/container-drop/component-set-1/SourceTray";
import { DropZone } from "@/components/official-candidate/container-drop/component-set-1/DropZone";
import { AssignmentTracker } from "@/components/official-candidate/container-drop/component-set-1/AssignmentTracker";
import { DragOverlayContent } from "@/components/official-candidate/container-drop/component-set-1/DragOverlayContent";
import {
  DEFAULT_ITEMS,
  DEFAULT_CONTAINERS,
} from "@/components/official-candidate/container-drop/component-set-1/presets";

export default function ContainerDropDemoPage() {
  return (
    <ContainerDropProvider
      items={DEFAULT_ITEMS}
      containers={DEFAULT_CONTAINERS}
    >
      <div className="mx-auto w-full max-w-5xl p-6">
        <h1 className="mb-1 text-2xl font-bold text-foreground">
          Container Drop System
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Drag items from the source tray into containers. Items transform into
          compact chips on drop. Remove them with the X button or drag them out.
        </p>

        <SourceTray showAddForm />

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {DEFAULT_CONTAINERS.map((c) => (
            <DropZone key={c.id} containerId={c.id} />
          ))}
        </div>

        <AssignmentTracker />

        <DragOverlayPortal
          renderOverlay={(item, snapshot) => (
            <DragOverlayContent item={item} snapshot={snapshot} />
          )}
        />
      </div>
    </ContainerDropProvider>
  );
}
