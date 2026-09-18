/**
 * features/window-panels/windows/google-import/GoogleTasksImportWindow.tsx
 *
 * The `googleTasksImportWindow` overlay entry — the WINDOW presentation of
 * "Import from Google Tasks". The lazily loaded boundary that binds the window
 * SHELL above the canonical panel body
 * (`features/connectors/import/GoogleTasksImportPanel`), the same shape the
 * Detail primitive's window uses. Phone width comes from the registry's
 * `mobilePresentation: "drawer"`.
 */

"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { GoogleTasksImportPanel } from "@/features/connectors/import/GoogleTasksImportPanel";

export interface GoogleTasksImportWindowProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string | null;
  projectId: string | null;
}

export default function GoogleTasksImportWindow({
  isOpen,
  onClose,
  organizationId,
  projectId,
}: GoogleTasksImportWindowProps) {
  if (!isOpen) return null;
  return (
    <WindowPanel
      id="google-tasks-import"
      overlayId="googleTasksImportWindow"
      title="Import from Google Tasks"
      // V-23 / R35 — see the Contacts panel: the destination project and org
      // ride in `?panels=google_tasks_import:<projectId>:o-<organizationId>`.
      urlSyncId={projectId ?? "googleTasksImportWindow"}
      urlSyncArgs={organizationId ? { o: organizationId } : undefined}
      onClose={onClose}
      width={620}
      height={660}
      minWidth={360}
      minHeight={360}
      bodyClassName="overflow-hidden"
    >
      <GoogleTasksImportPanel
        organizationId={organizationId}
        projectId={projectId}
      />
    </WindowPanel>
  );
}
