"use client";

/**
 * Voice on a PERSON brand: the person's own voice is the brand's voice.
 *
 *   - the signed-in user is that person → "This is you"; measure it as THEIR
 *     own fingerprint (only a person makes their own fingerprint), linked here;
 *   - nobody is named yet → "This is me" names the signed-in user (the
 *     database refuses anyone else's id), then measures;
 *   - someone else is named → the brand voice is measured from their posts.
 */

import { useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { Card } from "@/components/ui/card";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { claimPersonBrand } from "@/features/marketing/lib/person-brand-claim";

export function PersonVoiceBar({
  brandId,
  brandName,
  personUserId,
  onClaimed,
  onMeasureMine,
}: {
  brandId: string;
  brandName: string;
  personUserId: string | null;
  onClaimed: (userId: string) => void;
  onMeasureMine: () => void;
}) {
  const userId = useAppSelector(selectUserId);
  const [busy, setBusy] = useState(false);
  const isMe = Boolean(userId && personUserId === userId);

  const claim = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await claimPersonBrand(brandId, userId);
      onClaimed(userId);
      onMeasureMine();
      toast.success(`${brandName} is now you`);
    } catch (error) {
      toast.error("Not marked as you", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-wrap items-center gap-2 p-3" data-testid="person-voice-bar">
      <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="text-sm text-foreground">
        {isMe ? "This is you" : personUserId ? `Spokesperson: ${brandName}` : `Are you ${brandName}?`}
      </span>
      <span className="text-xs text-muted-foreground">
        {isMe ? "Your own voice is this brand's voice" : personUserId ? "Measured from their posts and talks" : "Make this voice your own"}
      </span>
      <div className="ml-auto">
        {isMe ? (
          <Button variant="outline" onClick={onMeasureMine}>
            Measure my voice
          </Button>
        ) : !personUserId && userId ? (
          <Button
            variant="outline"
            disabled={busy}
            icon={busy ? <Loader2 className="animate-spin" /> : null}
            onClick={() => void claim()}
          >
            This is me
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
