import { cn } from "@/lib/utils";
import CleanupPad from "@/features/transcription-cleanup/components/CleanupPad";

export default function TranscriptionCleanupPage() {
  return (
    <div
      className={cn(
        "flex h-dvh w-full flex-col overflow-hidden bg-textured",
        // Below 1024px the app shell shows a floating bottom dock; reserve
        // space for it so the body/Clean Up button never hide behind it.
        "pb-[calc(var(--shell-dock-h)+var(--shell-dock-bottom)+var(--shell-safe-area-bottom)+0.5rem)] lg:pb-0",
      )}
    >
      {/* Clear the fixed app shell header */}
      <div
        style={{ height: "var(--shell-header-h, 2.75rem)" }}
        className="shrink-0"
      />
      <div className="min-h-0 flex-1">
        <CleanupPad />
      </div>
    </div>
  );
}
