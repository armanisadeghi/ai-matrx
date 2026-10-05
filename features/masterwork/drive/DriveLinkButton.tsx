"use client";

// features/masterwork/drive/DriveLinkButton.tsx
//
// The door a person texts themselves. It lives in its OWN module, not beside
// the drive page: the record screen renders it, and importing it from
// `DriveInterviewPage` would drag the whole voice relay, the mandate
// resolution and the audio stack into that screen's chunk for one button
// (THE FRAGMENTATION LAW, `code-splitting` skill).
//
// The link it copies is the SHORT one — `/drive?r=<id>` — because it is going
// into a text message that has to be tappable with one thumb in a parked car.

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

export function DriveLinkButton({ rulebookId }: { rulebookId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      icon={copied ? (
        <Check />
      ) : (
        <Link2 />
      )}
      variant="outline"
      onClick={() => {
        const url = `${window.location.origin}/drive?r=${rulebookId}`;
        void navigator.clipboard
          .writeText(url)
          .then(() => {
            setCopied(true);
            toast.success("Link copied — text it to yourself.");
            setTimeout(() => setCopied(false), 2500);
          })
          .catch(() => {
            // Never a silent failure: if the clipboard is unavailable the
            // person still gets the address they came for.
            toast.error(`Copy this and text it to yourself: ${url}`);
          });
      }}
    >
      Text myself the link
    </Button>
  );
}
