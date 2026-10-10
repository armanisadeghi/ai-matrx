"use client";

/**
 * Track account (UI-SPEC §3): paste a handle or link, pick a role, confirm.
 * The first ingest runs on confirm and its progress streams into the reserved
 * status line (plain JSON today -> one "Fetching…" line; the stream lights up
 * the per-step lines with no change here). A pasted POST link is saved
 * instead and opens that post.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Select, type SelectOption } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { closeAllInstancesOfOverlay, selectOpenInstances } from "@/lib/redux/slices/overlaySlice";
import { toast } from "@/lib/toast";

import { useInvalidateSocial } from "../hooks";
import { RefusedReadOffer } from "../gated/RefusedReadOffer";
import { SocialAccountInput, useSocialAccountInput } from "./SocialAccountInput";
import { useSocialSpend } from "../cost";
import {
  ingestPost,
  socialErrorCode,
  socialErrorMessage,
  trackAccount,
} from "../server";
import {
  SOCIAL_PLATFORM_LABELS,
  TRACKED_ROLES,
  TRACKED_ROLE_LABELS,
  type SocialPlatform,
  type TrackedRole,
} from "../types";

const ROLE_OPTIONS: SelectOption<TrackedRole>[] = TRACKED_ROLES.map((r) => ({
  value: r,
  label: TRACKED_ROLE_LABELS[r],
}));

export function TrackAccountDialog({
  open,
  onOpenChange,
  organizationId,
  brandId,
  brandSeg,
  defaultRole = "competitor",
  initialText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  brandId: string;
  brandSeg: string;
  defaultRole?: TrackedRole;
  /** A link or handle to start with (a deep link's `?track=`). */
  initialText?: string;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  // A dialog is the one thing in front. On a phone a post panel is a full sheet that would sit over it, so it closes.
  const openPosts = useAppSelector((state) => selectOpenInstances(state, "socialPostWindow")).length;
  useEffect(() => {
    if (open && openPosts > 0 && typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      dispatch(closeAllInstancesOfOverlay({ overlayId: "socialPostWindow" }));
    }
  }, [open, openPosts, dispatch]);
  const invalidate = useInvalidateSocial();
  const { costText } = useSocialSpend(organizationId);
  const input = useSocialAccountInput({ initialText, organizationId });
  const text = input.text;
  const [role, setRole] = useState<TrackedRole>(defaultRole);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<unknown>(null);
  // The server refused an account with no posts (almost always the wrong
  // handle); the person may still track it on purpose (a brand-new own account).
  const emptyRefused = socialErrorCode(failure) === "social_profile_empty";
  // The provider could not read it (private, restricted, blocked): the person's own browser still can.
  const failCode = socialErrorCode(failure);

  const { parsed } = input;
  // A new address starts clean: the last refusal belonged to the old one.
  useEffect(() => {
    setError("");
    setFailure(null);
  }, [input.text]);
  const isPost = parsed.status === "post";
  const effectivePlatform: SocialPlatform | null =
    parsed.status === "ok" || parsed.status === "post" ? parsed.platform : null;
  const canSubmit = (isPost || parsed.status === "ok") && !busy;

  async function submit(allowEmpty = false) {
    setBusy(true);
    setError("");
    setFailure(null);
    setStatus("Fetching…");
    const opts = { organizationId, onProgress: (p: { message: string; step?: number; total?: number }) =>
        setStatus(p.step && p.total ? `${p.message} · ${p.step} of ${p.total}` : p.message) };
    try {
      if (isPost) {
        const result = await ingestPost({ url: text.trim() }, opts);
        await invalidate();
        toast.success("Post saved");
        onOpenChange(false);
        router.push(`/marketing/${brandSeg}/socials/post/${result.post_id}`);
      } else {
        const result = await trackAccount(
          {
            handleOrUrl: parsed.status === "ok" ? parsed.url : text.trim(),
            platform: effectivePlatform ?? undefined,
            role,
            brandId,
            pages: 1,
            allowEmpty,
          },
          opts,
        );
        await invalidate();
        toast.success(result.created ? "Account tracked" : "Already tracked");
        onOpenChange(false);
      }
      input.reset();
    } catch (err) {
      setFailure(err);
      setError(socialErrorMessage(err, "Couldn't track that account"));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Track account</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <SocialAccountInput
            input={input}
            autoFocus
            disabled={busy}
          />
          <Select
            aria-label="Role"
            value={role}
            options={ROLE_OPTIONS}
            onValueChange={(v) => setRole(v)}
            disabled={isPost}
          />
          <p className="h-8 overflow-hidden text-xs text-muted-foreground" aria-live="polite">
            {error ? (
              <span className="text-destructive">
                {error}
                <ErrorAlchemyMenu error={failure} operation="track social account" />
              </span>
            ) : status ? (
              status
            ) : isPost ? (
              "Post link — it will be saved"
            ) : parsed.status === "ok" ? (
              (costText("track") ?? "")
            ) : (
              ""
            )}
          </p>
          {failure && !busy && effectivePlatform ? (
            <RefusedReadOffer
              organizationId={organizationId}
              error={failure}
              target={{ platform: effectivePlatform, handleOrUrl: text.trim(), brandId, target: isPost ? "post" : "profile" }}
              onCaptured={() => void invalidate()}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {emptyRefused && !busy ? (
            <Button variant="quiet" onClick={() => void submit(true)}>
              Track anyway
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? "Working…" : isPost ? "Save post" : "Track"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
