"use client";

import { TriangleAlertTapButton } from "@/components/icons/tap-buttons";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import { useOpenFlashcardStudyWindow } from "@/features/overlays/openers/flashcardStudyWindow";

interface FlashcardStudyWindowDevTriggerProps {
  setId: string;
  title?: string;
  disabled?: boolean;
}

/** Admin-only dev trigger — opens the sidebar study WindowPanel. */
export function FlashcardStudyWindowDevTrigger({
  setId,
  title,
  disabled = false,
}: FlashcardStudyWindowDevTriggerProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const openStudyWindow = useOpenFlashcardStudyWindow();

  if (!isAdmin) return null;

  return (
    <TriangleAlertTapButton
      variant="solid"
      disabled={disabled}
      ariaLabel="[DEV] Open study session in window panel"
      tooltip="[DEV] Open study session in window panel (sidebar + stats)"
      onClick={() =>
        openStudyWindow({
          setId,
          title: title ?? "Study",
        })
      }
    />
  );
}
