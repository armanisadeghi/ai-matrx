"use client";

import React from "react";
import Image from "next/image";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/selectors/userSelectors";

interface UserAvatarProps {
  size?: number;
  className?: string;
  showBackground?: boolean;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  size = 20,
  className = "",
  showBackground = true,
}) => {
  // Get user data from Redux store
  const user = useSelector(selectUser);

  // Determine display name using the same logic from your original component
  const displayName =
    user.userMetadata?.name ||
    user.userMetadata?.fullName ||
    user.email?.split("@")[0] ||
    "User";

  // Get profile photo URL
  const profilePhoto = user.userMetadata?.picture || null;

  // Calculate text size based on avatar size
  const textSize = Math.max(Math.floor(size * 0.4), 8); // Minimum text size of 8px

  return (
    <div
      className={`${showBackground ? "bg-zinc-200 dark:bg-zinc-800" : ""} relative overflow-hidden rounded-full flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
      }}
    >
      {profilePhoto ? (
        <Image
          src={profilePhoto}
          alt={`${displayName}'s profile`}
          fill
          className="object-cover"
          sizes={`${size}px`}
          unoptimized
        />
      ) : (
        <div className="flex items-center justify-center h-full w-full">
          <span
            className="font-medium text-gray-800 dark:text-gray-200"
            style={{ fontSize: `${textSize}px` }}
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
};

export default UserAvatar;
