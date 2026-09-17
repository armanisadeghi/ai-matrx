/**
 * features/window-panels/windows/google-import/GoogleContactsImportWindow.tsx
 *
 * The `googleContactsImportWindow` overlay entry — the WINDOW presentation of
 * "Import from Google Contacts" (Arman, 2026-09-17: "The default is the
 * window"). This file is the lazily loaded boundary that binds the window
 * SHELL above the panel body, exactly as `windows/detail/DetailWindow.tsx`
 * does for the Detail primitive; the body itself
 * (`features/connectors/import/GoogleContactsImportPanel`) is the canonical
 * component and is never re-implemented here.
 *
 * Phone width comes from the registry's `mobilePresentation: "drawer"`.
 */

"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { GoogleContactsImportPanel } from "@/features/connectors/import/GoogleContactsImportPanel";

export interface GoogleContactsImportWindowProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string | null;
  initialExternalId: string | null;
}

export default function GoogleContactsImportWindow({
  isOpen,
  onClose,
  organizationId,
  initialExternalId,
}: GoogleContactsImportWindowProps) {
  if (!isOpen) return null;
  return (
    <WindowPanel
      id="google-contacts-import"
      overlayId="googleContactsImportWindow"
      title="Import from Google Contacts"
      onClose={onClose}
      width={640}
      height={680}
      minWidth={360}
      minHeight={360}
      bodyClassName="overflow-hidden"
    >
      <GoogleContactsImportPanel
        organizationId={organizationId}
        initialExternalId={initialExternalId}
      />
    </WindowPanel>
  );
}
