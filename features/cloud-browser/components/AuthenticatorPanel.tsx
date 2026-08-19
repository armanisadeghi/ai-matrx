"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import {
  fillAuthenticatorCode,
  getSavedLoginChoices,
  type SavedLoginChoice,
} from "../service";

export function AuthenticatorPanel({
  runId,
  pageUrl,
}: {
  runId: string;
  pageUrl: string;
}) {
  const [choices, setChoices] = useState<SavedLoginChoice[]>([]);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    void getSavedLoginChoices(pageUrl)
      .then((items) => {
        if (active) setChoices(items);
      })
      .catch(() => {
        if (active) setChoices([]);
      });
    return () => {
      active = false;
    };
  }, [pageUrl]);

  async function enterCode(choice: SavedLoginChoice) {
    setWorking(true);
    try {
      await fillAuthenticatorCode({
        runId,
        pageUrl,
        itemId: choice.itemId,
      });
      toast.success("Verification code entered in the private browser.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not enter the verification code.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <div>
        <p className="text-sm font-medium">Verification needed</p>
        <p className="text-xs text-muted-foreground">
          Choose the saved sign-in whose authenticator should enter the current
          code. The code is generated and typed privately.
        </p>
      </div>
      {choices.length > 0 ? (
        choices.map((choice) => (
          <Button
            key={choice.itemId}
            size="sm"
            disabled={working}
            onClick={() => void enterCode(choice)}
          >
            {working ? "Entering code…" : `Use ${choice.displayName}`}
          </Button>
        ))
      ) : (
        <p className="text-xs text-muted-foreground">
          No matching saved sign-in with an authenticator is available.
        </p>
      )}
    </div>
  );
}
