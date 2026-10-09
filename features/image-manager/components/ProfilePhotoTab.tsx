"use client";

/**
 * features/image-manager/components/ProfilePhotoTab.tsx
 *
 * Profile photo manager. Wraps `<ImageAssetUploader preset="avatar">` and,
 * when an upload completes, saves through the ONE profile-photo door
 * (`PATCH /api/user/profile`: auth metadata + user.profiles) and dispatches
 * the shared `setUserMetadata`, so every avatar updates at once — the same
 * path as Settings → Profile.
 */

import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";
import React, { useState } from "react";
import { Loader2, ShieldAlert, User } from "lucide-react";
import {
  ImageAssetUploader,
  type ImageUploaderResult,
} from "@/components/official/ImageAssetUploader";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setUserMetadata } from "@/lib/redux/slices/userProfileSlice";
import {
  selectUserAvatarUrl,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function ProfilePhotoTab() {
  const currentAvatar = useAppSelector(selectUserAvatarUrl);
  const userId = useAppSelector(selectUserId);
  const dispatch = useAppDispatch();
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
      // The ONE profile-photo door (same as Settings → Profile): auth
      // metadata AND user.profiles (the chat-visible avatar), then the shared
      // Redux metadata so every avatar on the page updates at once.
      const res = await fetchWithOrganization("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatar_url: avatarUrl,
          picture: avatarUrl,
          avatar_file_id: result.file_id || null,
        }),
      });
      if (!res.ok) throw new Error("Couldn't update profile photo");
      dispatch(setUserMetadata({ avatarUrl, picture: avatarUrl }));
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
            <InlineMediaRef
              ref={currentAvatar}
              alt="Current avatar"
              size="fill"
              fit="cover"
              rounded="full"
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
              // read-gate-exempt: the signed-in user's avatar from the auth session, not a list read
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
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive-ink">
          <ShieldAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{persistError}</span>
          <ErrorAlchemyMenu error={persistError} />
        </div>
      ) : null}

      {savedUrl ? (
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success-ink">
          Profile photo saved.
        </div>
      ) : null}
    </div>
  );
}
