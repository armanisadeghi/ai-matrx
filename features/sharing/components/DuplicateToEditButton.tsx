"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MessageSquare, GraduationCap, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { forkSharedResource } from "@/utils/permissions/shareLinks";

/**
 * Duplicate-to-edit — the canonical "Make a copy & use it" action for a resource
 * the viewer can SEE but not edit (a view-only sharee, a public deck, an anon
 * visitor). It forks the resource into the caller's own account and drops them
 * into their editable copy. If the viewer isn't signed in, it routes them to
 * sign-up and returns them here to finish the copy (the acquisition flywheel P7
 * unblocks for P6-C's community library and P10's shared rooms).
 *
 * ONE component for every surface: the /s/[token] link viewer, the /p/e public
 * viewer, and any in-app view where `useAccess` returns `view`. The fork is a
 * SECURITY DEFINER RPC per resource family (utils/permissions/shareLinks
 * #forkSharedResource) that gates on the resource actually being shared/public —
 * you can only copy what you were allowed to see.
 */
export function DuplicateToEditButton({
  resourceType,
  resourceId,
  returnPath,
  shareToken,
  label,
  size = "lg",
  variant = "default",
  className,
}: {
  resourceType: string;
  resourceId: string;
  /** Where to return the viewer after sign-up (they finish the copy here). */
  returnPath: string;
  /**
   * The no-login share-link token, passed ONLY on the `/s/[token]` link lane.
   * It authorizes forking a resource shared purely by no-login link (a private
   * resource with an active link). Omit on public/`/p/e` and in-app view
   * surfaces — those fork token-less via public/link visibility or a grant.
   */
  shareToken?: string;
  /** Override the default per-type verb ("Study these flashcards", …). */
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const resolvedLabel =
    label ??
    (resourceType === "conversation"
      ? "Continue this chat"
      : resourceType === "fc_set"
        ? "Study these flashcards"
        : resourceType === "quiz_sessions"
          ? "Take this quiz"
          : "Make a copy");

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
        router.push(`/sign-up?redirectTo=${encodeURIComponent(returnPath)}`);
        return;
      }
      const result = await forkSharedResource(resourceType, resourceId, shareToken);
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
    <Button size={size} variant={variant} onClick={onClick} disabled={busy} className={className}>
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Icon className="mr-2 h-4 w-4" />
      )}
      {resolvedLabel}
    </Button>
  );
}
