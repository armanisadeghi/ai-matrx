"use client";

/**
 * GmailComposeWindow — the compose panel's WINDOW presentation.
 *
 * 🚨 A PANEL WRAPS THE CANONICAL COMPONENT. This file is chrome and nothing
 * else: `GmailComposePanel` is the compose surface wherever it appears, and
 * this window mounts it verbatim. A body written here would be a second
 * compose screen that drifts from the first.
 *
 * A WINDOW on purpose (google-native PLAN §5.1 — the window is the default
 * presentation, and Arman's words on 2026-09-17 were "the default is the
 * window"): the record stays visible and usable behind it while the message is
 * written, which is the whole reason to write the message from the record.
 * A modal would hide the very facts the writer is quoting.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { callbackManager } from "@/utils/callbackManager";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { GmailComposePanel } from "@/features/crm/gmail/GmailComposePanel";
import type { GmailDraftedBy } from "@/features/crm/gmail/types";

export interface GmailComposeWindowProps {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
  organizationId: string;
  partyLabel: string;
  dealId?: string | null;
  dealLabel?: string | null;
  projectId?: string | null;
  initialTo?: string | null;
  initialSubject?: string | null;
  initialBody?: string | null;
  draftedBy?: GmailDraftedBy | null;
  /**
   * The opener's `onSent` handler, as an id — functions never cross Redux.
   * Fired once, after the message is sent AND recorded, so the host can
   * refresh the timeline it is showing behind this window.
   */
  sentCallbackId?: string | null;
}

export default function GmailComposeWindow({
  isOpen,
  onClose,
  partyId,
  organizationId,
  partyLabel,
  dealId,
  dealLabel,
  projectId,
  initialTo,
  initialSubject,
  initialBody,
  draftedBy,
  sentCallbackId,
}: GmailComposeWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id={`gmail-compose-window-${partyId}`}
      overlayId="gmailComposeWindow"
      title={`Email ${partyLabel}`}
      width={620}
      height={660}
      minWidth={440}
      minHeight={480}
      position="center"
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {/* A window answers for itself; without this a right-click here is
          answered by whatever page is open behind it. The entity is the
          record the message is about. */}
      <NonEditableContextMenu
        sourceFeature="crm"
        contentSource={{ type: "raw" }}
        entity={{ type: "party", id: partyId, title: partyLabel }}
      >
        <GmailComposePanel
          partyId={partyId}
          organizationId={organizationId}
          partyLabel={partyLabel}
          dealId={dealId}
          dealLabel={dealLabel}
          projectId={projectId}
          initialTo={initialTo}
          initialSubject={initialSubject}
          initialBody={initialBody}
          draftedBy={draftedBy}
          onSent={(interactionId) => {
            if (sentCallbackId) {
              callbackManager.trigger(sentCallbackId, { interactionId });
            }
          }}
          onClose={onClose}
        />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
