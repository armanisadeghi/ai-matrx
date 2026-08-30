// features/scopes/host/associationsHostPortsImpl.tsx
//
// The HEAVY half of the `@ai-matrx/associations` UI-port bindings — everything
// here parses `WindowPanel`, which must NEVER sit in a route/boot bundle
// (features/window-panels FEATURE.md → Bundle invariant). `AssociationsHost`
// reaches this module through the PACKAGE's own lazy seam
// (`lazyWindowShell` / `lazyPickerOverride`, @ai-matrx/associations 0.6.0);
// the chunk loads only when an association window or the file picker override
// actually renders. There is no hand-written `next/dynamic` glue here or
// there any more — the split is the package's job.

"use client";

import { useId, type ReactNode } from "react";
import {
  useAssociationPickerBridge,
  type AssociationPickerProps,
} from "@ai-matrx/associations/react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { FilePickerWindow } from "@/features/resource-manager/resource-picker/FilePickerWindow";

/**
 * The `windowShell.Window` binding.
 *
 * C22 note — why this port is bound at all when the package ships a real
 * draggable window (`DefaultWindowShell`, 0.6.0): `WindowPanel` is this app's
 * WINDOW MANAGER, not merely a window. It docks to the tray, persists across
 * reloads through the workspace store, and shares one z-order with every
 * other panel the user has open. That is app identity the package cannot own.
 * Everything else about the surface — chrome, drag, resize, clamping — the
 * package would happily provide; only the manager integration is ours.
 */
export function AssociationsWindowShellImpl({
  id,
  title,
  onClose,
  children,
}: {
  id: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Unique per mounted instance — two panels sharing an id fight over one
  // Redux entry and the first unmount kills drag for the survivor.
  const instanceId = useId();
  return (
    <WindowPanel
      id={`${id}:${instanceId}`}
      title={title}
      onClose={onClose}
      mobilePresentationOverride="card"
      // The window portals to <body>. Radix surfaces set
      // `pointer-events: none` on <body> while open and can leave it set for
      // a tick after closing — re-assert for our own subtree.
      className="pointer-events-auto"
      width={440}
      height={580}
      minWidth={330}
      minHeight={380}
      position="center"
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col gap-2 p-3">{children}</div>
    </WindowPanel>
  );
}

/**
 * The per-token picker override for `file` — files never open the generic
 * candidate sheet: the ONE canonical file picker in a non-blocking draggable
 * window (upload + pick, toggling attach/detach).
 *
 * C22 note: this binding injects the canonical picker COMPONENT and nothing
 * else. Every failure semantic — partial batches, refused attaches, the
 * created-but-unattached report and where the file actually lives, the
 * errorSink routing — lives in the package's `useAssociationPickerBridge`
 * (0.6.0). It used to be ~50 lines of hand-written loops and toast copy here,
 * which is exactly the massaging C22 bans.
 */
export function FileAssociationPickerImpl(props: AssociationPickerProps) {
  const bridge = useAssociationPickerBridge(props, {
    itemNoun: "file",
    createdLocationLabel: "your Files",
    openCreatedLocation: {
      label: "Open Files",
      onClick: () => window.open("/files", "_blank", "noopener,noreferrer"),
    },
  });
  return (
    <FilePickerWindow
      open={props.open}
      onClose={() => props.onOpenChange(false)}
      scopeId={`association:${props.containerLabel ?? "container"}`}
      title={
        props.containerLabel ? `Add to ${props.containerLabel}` : "Add files"
      }
      onUpload={async (files) => {
        await bridge.attachMany(
          files.map((file) => ({ id: file.fileId, name: file.name })),
        );
      }}
      onPick={async (selection) => {
        await bridge.toggle({
          id: selection.fileId,
          name: selection.details.filename || "File",
        });
      }}
    />
  );
}
