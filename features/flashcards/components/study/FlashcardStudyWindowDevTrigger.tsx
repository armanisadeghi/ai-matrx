"use client";

import { TriangleAlertTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdminDebugger } from "@/lib/redux/slices/userSlice";
import { useOpenFlashcardStudyWindow } from "@/features/overlays/openers/flashcardStudyWindow";
import { SHOW_DEV_CONTROLS } from "@/lib/dev/devControls";

interface FlashcardStudyWindowDevTriggerProps {
  setId: string;
  title?: string;
  disabled?: boolean;
}

/** Dev-only trigger (development builds, admin seat) — opens the sidebar study WindowPanel. */
export function FlashcardStudyWindowDevTrigger({
  setId,
  title,
  disabled = false,
}: FlashcardStudyWindowDevTriggerProps) {
  const isAdmin = useAppSelector(selectIsAdminDebugger);
  const openStudyWindow = useOpenFlashcardStudyWindow();

  if (!SHOW_DEV_CONTROLS || !isAdmin) return null;

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
