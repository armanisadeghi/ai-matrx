"use client";

import React, { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { setUserMetadata } from "@/lib/redux/slices/userProfileSlice";
import { User, Check, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { FaGoogle, FaGithub } from "react-icons/fa";
import { toast } from "sonner";
import { ImageCropUploader } from "@/components/official/ImageCropUploader";
import type { ImageUploaderResult } from "@/components/official/ImageAssetUploader";

// Map of provider names to their icons and colors
const providerStyles: Record<
  string,
  {
    icon: React.ReactNode;
    color: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  google: {
    icon: <FaGoogle size={14} />,
    color: "text-red-600 dark:text-red-400",
    variant: "outline",
  },
  github: {
    icon: <FaGithub size={14} />,
    color: "text-gray-800 dark:text-gray-200",
    variant: "outline",
  },
};

// Default provider style for unknown providers
const defaultProviderStyle = {
  icon: <User size={14} />,
  color: "text-blue-600 dark:text-blue-400",
  variant: "outline" as const,
};

export default function ProfilePage() {
  const user = useAppSelector(selectUser);
  const dispatch = useAppDispatch();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPhoto, setIsChangingPhoto] = useState(false);

  const currentPhotoUrl = user.userMetadata.avatarUrl ?? user.userMetadata.picture ?? null;

  const handlePhotoComplete = async (result: ImageUploaderResult | null) => {
    const url = result?.primary_url ?? null;
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: url, picture: url }),
      });
      if (!res.ok) throw new Error("Failed to save photo");
      dispatch(setUserMetadata({ avatarUrl: url, picture: url }));
      toast.success(url ? "Profile photo updated" : "Profile photo removed");
      setIsChangingPhoto(false);
    } catch {
      toast.error("Could not save profile photo — please try again");
    }
  };

  // Helper function to get provider style
  const getProviderStyle = (provider: string) => {
    return providerStyles[provider.toLowerCase()] || defaultProviderStyle;
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Profile Header Card */}
      <Card className="mb-4 md:mb-6">
        <CardContent className="pt-4 md:pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
            <div className="flex flex-col items-center gap-2 mx-auto md:mx-0">
              <button
                type="button"
                onClick={() => setIsChangingPhoto((v) => !v)}
                className="relative group h-20 w-20 md:h-24 md:w-24 rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-zinc-600 bg-gray-200 dark:bg-zinc-700 flex items-center justify-center shrink-0"
                title="Change profile photo"
              >
                {currentPhotoUrl ? (
                  <Image
                    src={currentPhotoUrl}
                    alt="Profile"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 80px, 96px"
                  />
                ) : (
                  <User size={40} className="text-gray-400 dark:text-gray-500" />
                )}
                <span className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-medium text-white leading-tight text-center px-1">
                    {isChangingPhoto ? "Cancel" : "Change"}
                  </span>
                </span>
              </button>

              {isChangingPhoto && (
                <div className="w-full max-w-xs mt-1">
                  <ImageCropUploader
                    preset="avatar"
                    currentUrl={currentPhotoUrl}
                    label="Profile photo"
                    defaultAspect={1}
                    visibility="public"
                    onComplete={(result) => void handlePhotoComplete(result)}
                    onError={(msg) => toast.error(msg)}
                  />
                  <button
                    type="button"
                    onClick={() => setIsChangingPhoto(false)}
                    className="mt-1 text-xs text-muted-foreground hover:text-foreground w-full text-center"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                {user.userMetadata.fullName || user.userMetadata.name || "User"}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {user.email}
              </p>
              <div className="flex items-center justify-center md:justify-start gap-2 mt-2">
                {user.emailConfirmedAt && (
                  <Badge
                    variant="outline"
                    className="text-green-600 dark:text-green-400 border-green-600 dark:border-green-400"
                  >
                    <Check size={12} className="mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant={isEditing ? "outline" : "default"}
              onClick={() => setIsEditing(!isEditing)}
              className="w-full md:w-auto"
            >
              {isEditing ? "Cancel" : "Edit Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="mb-4 md:mb-6">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your personal details and information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                value={user.userMetadata.fullName || ""}
                readOnly={!isEditing}
                className={!isEditing ? "bg-muted cursor-not-allowed" : ""}
              />
            </div>
            <div>
              <Label htmlFor="preferredUsername">Preferred Username</Label>
              <Input
                id="preferredUsername"
                type="text"
                value={user.userMetadata.preferredUsername || ""}
                readOnly={!isEditing}
                className={!isEditing ? "bg-muted cursor-not-allowed" : ""}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={user.email || ""}
                  readOnly
                  className="bg-muted cursor-not-allowed flex-1"
                />
              </div>
            </div>
          </div>
          {isEditing && (
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button>Save Changes</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            View your account details and security information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                User ID
              </Label>
              <p className="mt-1 text-sm font-mono text-gray-600 dark:text-gray-400 bg-muted px-3 py-2 rounded-md break-all">
                {user.id}
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Sign In
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Clock size={16} className="text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {user.lastSignInAt
                    ? new Date(user.lastSignInAt).toLocaleString()
                    : "Never"}
                </span>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                Auth Providers
              </Label>
              <div className="flex flex-wrap gap-2">
                {user.appMetadata.providers?.map((provider, index) => {
                  const style = getProviderStyle(provider);
                  return (
                    <Badge
                      key={index}
                      variant={style.variant}
                      className="gap-1.5"
                    >
                      <span className={style.color}>{style.icon}</span>
                      <span className="capitalize">{provider}</span>
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
