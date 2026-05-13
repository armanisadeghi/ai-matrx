"use client";

/**
 * features/image-manager/components/ProfilePhotoTab.tsx
 *
 * Profile photo manager. Wraps `<ImageAssetUploader preset="avatar">`
 * and, when an upload completes, updates the user's Supabase auth
 * metadata (`avatar_url` + `picture` for OAuth-style consumers) so the
 * new image becomes the canonical avatar across the app.
 *
 * Note: there's no pre-existing avatar-update flow elsewhere in the
 * codebase (we audited the inventory before building this) — this tab
 * is the first place that writes `avatar_url` into auth metadata. If a
 * dedicated server action lands later, we should replace the direct
 * client call here with that action.
 */

import React, { useState } from "react";
import { Loader2, ShieldAlert, User } from "lucide-react";
import {
  ImageAssetUploader,
  type ImageUploaderResult,
} from "@/components/official/ImageAssetUploader";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectUserAvatarUrl,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { supabase } from "@/utils/supabase/client";
import { toast } from "sonner";
import { CloudFolders } from "@/features/files/utils/folder-conventions";

export function ProfilePhotoTab() {
  const currentAvatar = useAppSelector(selectUserAvatarUrl);
  const userId = useAppSelector(selectUserId);
  const [persisting, setPersisting] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);

  const handleComplete = async (result: ImageUploaderResult | null) => {
    if (!result) return;
    const avatarUrl = result.primary_url;
    if (!avatarUrl) return;

    setPersisting(true);
    setPersistError(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          avatar_url: avatarUrl,
          picture: avatarUrl,
        },
      });
      if (error) throw error;
      setSavedUrl(avatarUrl);
      toast.success("Profile photo updated");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't update profile photo";
      setPersistError(message);
      toast.error(message);
    } finally {
      setPersisting(false);
    }
  };

  return (
    <div className="h-full overflow-auto overscroll-contain p-3 md:p-4 space-y-4">
      <header className="flex items-center gap-3 rounded-lg border border-border bg-card/40 p-3">
        <div className="h-12 w-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
          {currentAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentAvatar}
              alt="Current avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <User className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Profile photo</div>
          <div className="text-xs text-muted-foreground truncate">
            {currentAvatar
              ? "Replace your current avatar by uploading a new image."
              : "No avatar set yet — upload one and we'll save it."}
          </div>
        </div>
      </header>

      <ImageAssetUploader
        preset="avatar"
        folder={
          userId
            ? `${CloudFolders.IMAGES_AVATARS}/${userId}`
            : CloudFolders.IMAGES_AVATARS
        }
        currentUrl={savedUrl ?? currentAvatar}
        visibility="public"
        enableViewerAction
        onComplete={handleComplete}
        label="New avatar"
      />

      {persisting ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving to your profile…
        </div>
      ) : null}

      {persistError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <ShieldAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{persistError}</span>
        </div>
      ) : null}

      {savedUrl ? (
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
          Profile photo saved. The new avatar will appear everywhere on next
          page-load — sign out and back in to refresh other tabs.
        </div>
      ) : null}
    </div>
  );
}
