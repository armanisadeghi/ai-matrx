"use client";

// User-level Custom Dictionary settings tab. Renders the shared DictionaryManager
// scoped to the signed-in user's personal dictionary.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { DictionaryManager } from "@/features/dictionary/components/DictionaryManager";

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
      <div>
        <h2 className="text-base font-semibold text-foreground">Personal dictionary</h2>
        <p className="text-sm text-muted-foreground">
          Terms and pronunciations that travel with you — used today to correct how names and
          jargon are spoken back when AI Matrx reads to you, and to steer chat models toward your
          preferred spellings. Not yet used to improve speech-to-text transcription accuracy (no
          AI Matrx surface sends it to a transcription model yet). This is your private
          dictionary; organization and scope dictionaries are managed from their own settings.
        </p>
      </div>
      <DictionaryManager level="user" ownerId={userId} ownerName="Personal" canEdit />
    </div>
  );
}
