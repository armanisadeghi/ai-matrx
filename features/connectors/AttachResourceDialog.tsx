"use client";

/**
 * The overlay's container: binds `ResourceAttachPicker` (which knows nothing
 * about conversations) to `useConversationAttachments` (which owns the writes).
 *
 * Keeping the picker free of conversation state is what lets the same
 * component serve the composer rail, the Tools picker and the header summary
 * without a second copy.
 */

import { useConversationAttachments } from "./useConversationAttachments";
import { ResourceAttachPicker } from "./ResourceAttachPicker";
import type { AttachableResource, PendingAttachment } from "./attachable-resources";

export interface AttachResourceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  provider: string;
  providerName: string;
  attachable: readonly AttachableResource[];
}

export function AttachResourceDialog({
  isOpen,
  onClose,
  conversationId,
  provider,
  providerName,
  attachable,
}: AttachResourceDialogProps) {
  const attachments = useConversationAttachments(conversationId);
  const alreadyAttachedRefs = attachments.items
    .filter((item) => item.provider === provider)
    .map((item) => item.resource_ref);

  return (
    <ResourceAttachPicker
      isOpen={isOpen}
      onClose={onClose}
      provider={provider}
      providerName={providerName}
      attachable={attachable}
      alreadyAttachedRefs={alreadyAttachedRefs}
      onAttach={(picks: PendingAttachment[]) => attachments.attach(picks)}
    />
  );
}

export default AttachResourceDialog;
