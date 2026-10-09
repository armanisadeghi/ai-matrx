"use client";

/**
 * Track account (UI-SPEC §3): paste a handle or link, pick a role, confirm.
 * The first ingest runs on confirm and its progress streams into the reserved
 * status line (plain JSON today -> one "Fetching…" line; the stream lights up
 * the per-step lines with no change here). A pasted POST link is saved
 * instead and opens that post.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, Select, type SelectOption } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";

import { useInvalidateSocial } from "../hooks";
import { detectPlatform, handleFromInput, looksLikePostUrl } from "../link";
import { useSocialSpend } from "../cost";
import {
  ingestPost,
  socialErrorCode,
  socialErrorMessage,
  trackAccount,
} from "../server";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  TRACKED_ROLES,
  TRACKED_ROLE_LABELS,
  isSocialPlatform,
  type SocialPlatform,
  type TrackedRole,
} from "../types";

const PLATFORM_OPTIONS: SelectOption[] = [
  { value: "auto", label: "Detect from link" },
  ...SOCIAL_PLATFORMS.map((p) => ({ value: p, label: SOCIAL_PLATFORM_LABELS[p] })),
];
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
  const invalidate = useInvalidateSocial();
  const { costText } = useSocialSpend(organizationId);
  const [text, setText] = useState(initialText ?? "");
  const [platform, setPlatform] = useState<string>("auto");
  const [role, setRole] = useState<TrackedRole>(defaultRole);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<unknown>(null);
  // The server refused an account with no posts (almost always the wrong
  // handle); the person may still track it on purpose (a brand-new own account).
  const emptyRefused = socialErrorCode(failure) === "social_profile_empty";

  const isPost = looksLikePostUrl(text);
  const detected = detectPlatform(text);
  const effectivePlatform: SocialPlatform | null =
    platform !== "auto" && isSocialPlatform(platform) ? platform : detected;
  const handle = handleFromInput(text);
  const canSubmit = text.trim().length > 2 && (isPost || effectivePlatform !== null) && !busy;

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
            handleOrUrl: text.trim(),
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
      setText("");
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
          <Field
            aria-label="Handle or link"
            placeholder="Handle or profile link"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
              setFailure(null);
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <Select
              aria-label="Platform"
              value={platform}
              options={PLATFORM_OPTIONS}
              onValueChange={setPlatform}
              className="flex-1"
            />
            <Select
              aria-label="Role"
              value={role}
              options={ROLE_OPTIONS}
              onValueChange={(v) => setRole(v)}
              disabled={isPost}
              className="flex-1"
            />
          </div>
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
            ) : text.trim() && !effectivePlatform ? (
              "Pick a platform"
            ) : handle ? (
              [`@${handle}${effectivePlatform ? ` on ${SOCIAL_PLATFORM_LABELS[effectivePlatform]}` : ""}`, costText("track")].filter(Boolean).join(" · ")
            ) : (
              ""
            )}
          </p>
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
