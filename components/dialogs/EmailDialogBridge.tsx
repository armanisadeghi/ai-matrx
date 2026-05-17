"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closeOverlay,
  selectIsOverlayOpen,
  selectOverlayData,
} from "@/lib/redux/slices/overlaySlice";
import { toast } from "@/lib/toast-service";
import { EmailInputDialog } from "./EmailInputDialog";

/**
 * Bridges the `emailDialog` overlay to `EmailInputDialog`.
 *
 * `EmailInputDialog` needs `onSubmit` as a prop, which can't travel through
 * Redux. So this bridge subscribes to the overlay's open state + data,
 * resolves the submit logic locally, and renders the dialog underneath.
 *
 * Dispatchers pass `{ content, metadata }` via `openOverlay("emailDialog")`.
 * On submit, we POST to `/api/chat/email-response` with that content + the
 * metadata + the user-entered email. On success or cancel, the overlay
 * closes.
 *
 * Used by unauthenticated "Email to me" flows in:
 *   - components/content-actions/contentActionRegistry.ts
 *   - features/cx-chat/actions/messageActionRegistry.ts
 *   - features/agents/components/messages-display/message-options/messageActionRegistry.ts
 */
interface EmailDialogOverlayData {
  content: string;
  metadata?: Record<string, unknown> | null;
  title?: string;
}

export function EmailDialogBridge() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((s) => selectIsOverlayOpen(s, "emailDialog"));
  const data = useAppSelector(
    (s) => selectOverlayData(s, "emailDialog") as EmailDialogOverlayData | null,
  );

  const handleClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: "emailDialog" }));
  }, [dispatch]);

  const handleSubmit = useCallback(
    async (email: string) => {
      if (!data?.content) {
        toast.error("Nothing to email — content is empty.");
        return;
      }
      const response = await fetch("/api/chat/email-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          content: data.content,
          metadata: {
            ...(data.metadata ?? {}),
            ...(data.title ? { title: data.title } : {}),
            timestamp: new Date().toLocaleString(),
          },
        }),
      });
      const payload = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !payload.success) {
        throw new Error(payload.msg || "Failed to send email");
      }
      toast.success("Email sent!");
    },
    [data],
  );

  if (!isOpen) return null;
  return (
    <EmailInputDialog
      isOpen
      onClose={handleClose}
      onSubmit={handleSubmit}
      title="Email this response"
      description="Enter your email address to receive this content."
      submitLabel="Send to Email"
    />
  );
}

export default EmailDialogBridge;
