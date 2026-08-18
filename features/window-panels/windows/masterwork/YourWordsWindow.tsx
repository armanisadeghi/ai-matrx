"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpertRecordPage } from "@/features/masterwork/record/ExpertRecordPage";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

const OVERLAY_ID = "masterworkYourWordsWindow";

export interface YourWordsWindowProps {
  isOpen: boolean;
  onClose: () => void;
  rulebookId: string;
}

/** Large, non-blocking home for the canonical Rulebook record experience. */
export default function YourWordsWindow({
  isOpen,
  onClose,
  rulebookId,
}: YourWordsWindowProps) {
  if (!isOpen || !rulebookId) return null;

  return (
    <WindowPanel
      title="Your words"
      id="masterwork-your-words-window"
      overlayId={OVERLAY_ID}
      minWidth={640}
      minHeight={480}
      width={1040}
      height="88dvh"
      position="center"
      onClose={onClose}
      actionsRight={
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Open Your words in a new tab"
        >
          <Link
            href={`/masterwork/${rulebookId}/record`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open Your words in a new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      }
      bodyClassName="bg-textured p-0"
    >
      <ExpertRecordPage rulebookId={rulebookId} variant="window" />
    </WindowPanel>
  );
}
