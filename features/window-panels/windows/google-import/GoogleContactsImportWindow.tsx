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

import { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { GoogleContactsImportPanel } from "@/features/connectors/import/GoogleContactsImportPanel";
import { DirectoryReview } from "@/features/google-workspace/directory/DirectoryReview";
import { canUseGoogleOAuthInternalTest } from "@/features/marketing/google/internal-test-reviewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAdminFeature,
  selectUserEmail,
} from "@/lib/redux/selectors/userSelectors";
import type { GoogleContactsImportInitialView } from "@/features/overlays/openers/googleImportWindows";

export interface GoogleContactsImportWindowProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string | null;
  initialExternalId: string | null;
  initialView?: GoogleContactsImportInitialView;
}

export default function GoogleContactsImportWindow({
  isOpen,
  onClose,
  organizationId,
  initialExternalId,
  initialView = "contacts",
}: GoogleContactsImportWindowProps) {
  const isSuperAdmin = useAppSelector((s) =>
    selectAdminFeature(s, "google.internal-review"),
  );
  const email = useAppSelector(selectUserEmail);
  const canReviewDirectory = canUseGoogleOAuthInternalTest(isSuperAdmin, email);
  const [tabState, setTabState] = useState<{
    launchView: GoogleContactsImportInitialView;
    selected: GoogleContactsImportInitialView;
  }>(() => ({ launchView: initialView, selected: initialView }));
  if (
    tabState.launchView !== initialView ||
    (!canReviewDirectory && tabState.selected !== "contacts")
  ) {
    setTabState({
      launchView: initialView,
      selected: canReviewDirectory ? initialView : "contacts",
    });
  }
  const activeTab = canReviewDirectory ? tabState.selected : "contacts";
  if (!isOpen) return null;
  return (
    <WindowPanel
      id="google-contacts-import"
      overlayId="googleContactsImportWindow"
      title="Import from Google Contacts"
      // V-23 / R35 — the panel's subject rides in the address, so the link in
      // the URL reopens the SAME import, not a blank one:
      // `?panels=google_contacts_import:<externalId>:o-<organizationId>`.
      urlSyncId={initialExternalId ?? "googleContactsImportWindow"}
      urlSyncArgs={organizationId ? { o: organizationId } : undefined}
      onClose={onClose}
      width={640}
      height={680}
      minWidth={360}
      minHeight={360}
      bodyClassName="overflow-hidden"
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "contacts" || value === "directory") {
            setTabState((current) => ({ ...current, selected: value }));
          }
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {canReviewDirectory ? (
          <TabsList fill className="mx-2 mt-2">
            <TabsTrigger value="contacts">
              Google Contacts
            </TabsTrigger>
            <TabsTrigger value="directory">
              Directory
            </TabsTrigger>
          </TabsList>
        ) : null}
        <TabsContent
          value="contacts"
          className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <GoogleContactsImportPanel
            organizationId={organizationId}
            initialExternalId={initialExternalId}
          />
        </TabsContent>
        {canReviewDirectory ? (
          <TabsContent
            value="directory"
            className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
          >
            <DirectoryReview organizationId={organizationId} />
          </TabsContent>
        ) : null}
      </Tabs>
    </WindowPanel>
  );
}
