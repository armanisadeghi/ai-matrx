"use client";

// User-level Custom Dictionary settings tab. Renders the shared DictionaryManager
// scoped to the signed-in user's personal dictionary.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { DictionaryManager } from "@/features/dictionary/components/DictionaryManager";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";

export default function DictionaryTab() {
  const userId = useAppSelector(selectUserId);

  if (!userId) {
    return (
      <div className="p-4 md:p-6 text-sm text-muted-foreground">
        Sign in to manage your personal dictionary.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-3">
      {/* The personal dictionary corrects how names and jargon are spoken back
          (TTS) and steers chat models toward preferred spellings. Not yet used
          for speech-to-text: no surface sends it to a transcription model.
          Organization and scope dictionaries live in their own settings. */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">Personal dictionary</h2>
        <MandateDoorLink feature="dictionary" label="Dictionary intelligence" />
      </div>
      <DictionaryManager level="user" ownerId={userId} ownerName="Personal" canEdit />
    </div>
  );
}
