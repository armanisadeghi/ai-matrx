"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MessageSquare, GraduationCap, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { forkSharedResource } from "@/utils/permissions/shareLinks";

/**
 * "Save a copy & use it" for a shared resource. If the viewer is signed in it
 * forks the resource into their account and opens their copy; if not, it sends
 * them to sign-up and returns them here afterward (new-user acquisition — the
 * whole point of no-login sharing).
 */
export function ForkAndUseButton({
  resourceType,
  resourceId,
  returnPath,
}: {
  resourceType: string;
  resourceId: string;
  /** The /s/[token] path to return to after sign-up. */
  returnPath: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const label =
    resourceType === "conversation"
      ? "Continue this chat"
      : resourceType === "fc_set"
        ? "Study these flashcards"
        : resourceType === "quiz_sessions"
          ? "Take this quiz"
          : "Save a copy";

  const Icon =
    resourceType === "conversation"
      ? MessageSquare
      : resourceType === "fc_set"
        ? GraduationCap
        : resourceType === "quiz_sessions"
          ? ListChecks
          : Copy;

  const onClick = async () => {
    setBusy(true);
    try {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (!user) {
        // Sign up, then come back here to finish saving the copy.
        router.push(`/sign-up?redirectTo=${encodeURIComponent(returnPath)}`);
        return;
      }
      const result = await forkSharedResource(resourceType, resourceId);
      if (result.success && result.path) {
        toast.success("Saved to your account");
        router.push(result.path);
      } else {
        toast.error(result.error ?? "Couldn't save a copy");
        setBusy(false);
      }
    } catch {
      toast.error("Couldn't save a copy");
      setBusy(false);
    }
  };

  return (
    <Button size="lg" onClick={onClick} disabled={busy}>
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Icon className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
