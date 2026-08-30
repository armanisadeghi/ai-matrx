// features/scopes/host/associationsHostPortsImpl.tsx
//
// The HEAVY half of the `@ai-matrx/associations` UI-port bindings — everything
// here parses `WindowPanel`, which must NEVER sit in a route/boot bundle
// (features/window-panels FEATURE.md → Bundle invariant). `AssociationsHost`
// reaches this module through ONE `next/dynamic({ ssr: false })` edge per
// exported component; the chunk loads only when an association window or the
// file picker override actually renders.

"use client";

import { useId, type ReactNode } from "react";
import type { AssociationPickerProps } from "@ai-matrx/associations";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { FilePickerWindow } from "@/features/resource-manager/resource-picker/FilePickerWindow";
import { toast } from "@/lib/toast";

/**
 * The `windowShell.Window` binding — the exact non-blocking shell the
 * pre-extraction `AssociationWindow` mounted: draggable/resizable WindowPanel
 * on desktop, non-modal card on mobile, page behind stays interactive.
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
 * window (upload + pick, toggling attach/detach). Registered via the
 * package's `pickerOverrides` port; behavior lifted verbatim from the
 * pre-extraction `AssociationPicker` file branch.
 */
export function FileAssociationPickerImpl(props: AssociationPickerProps) {
  return (
    <FilePickerWindow
      open={props.open}
      onClose={() => props.onOpenChange(false)}
      scopeId={`association:${props.containerLabel ?? "container"}`}
      title={
        props.containerLabel ? `Add to ${props.containerLabel}` : "Add files"
      }
      onUpload={async (files) => {
        const failures: string[] = [];
        for (const file of files) {
          try {
            const result = await props.onAttach(file.fileId, file.name);
            if (!result.ok) failures.push(file.name);
          } catch (error: unknown) {
            console.error(
              "[AssociationPicker] uploaded file association failed",
              { fileId: file.fileId, error },
            );
            failures.push(file.name);
          }
        }
        if (failures.length > 0) {
          toast.error(
            `${failures.length} uploaded ${failures.length === 1 ? "file was" : "files were"} not added`,
            {
              description:
                "The upload is safe in Files. You can retry the association here.",
              action: {
                label: "Open Files",
                onClick: () =>
                  window.open("/files", "_blank", "noopener,noreferrer"),
              },
            },
          );
        }
      }}
      onPick={async (selection) => {
        // A silent no-op pick is the QA F1 bug class (feedback 35d311a9): the
        // attach RPC can refuse (403) and the row would just look inert.
        // Scream exactly like the package's generic candidate list does.
        const name = selection.details.filename || "File";
        if (props.attachedIds.has(selection.fileId)) {
          const res = await props.onDetach(selection.fileId);
          if (!res.ok) {
            toast.error(
              `Couldn't detach "${name}"` +
                (res.error ? `: ${res.error}` : ""),
            );
          }
        } else {
          const res = await props.onAttach(selection.fileId, name);
          if (!res.ok) {
            toast.error(
              `Couldn't attach "${name}"` +
                (res.error ? `: ${res.error}` : ""),
            );
          }
        }
      }}
    />
  );
}
