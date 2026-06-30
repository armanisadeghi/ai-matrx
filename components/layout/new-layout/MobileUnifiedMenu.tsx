"use client";

import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StickyNote,
  CheckSquare,
  Database,
  LayoutGrid,
  Bell,
  MessageSquare,
  Crown,
  LogOut,
  Sun,
  Moon,
  FolderOpen,
  Rainbow,
  Bug,
  Mic,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { setMode } from "@/styles/themes/themeSlice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { Notification } from "@/types/notification.types";
import { useQuickActions } from "@/features/quick-actions/hooks/useQuickActions";

export function MobileUnifiedMenu() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.theme.mode);
  const setTheme = (t: "light" | "dark") => dispatch(setMode(t));
  const user = useAppSelector(selectUser);
  const displayName =
    user.userMetadata.name ||
    user.userMetadata.fullName ||
    user.email?.split("@")[0] ||
    "User";
  const profilePhoto = user.userMetadata.picture || null;
  const userIsCreator = useAppSelector((state) =>
    brokerSelectors.selectValue(state, "APPLET_USER_IS_ADMIN"),
  );

  // Quick Actions via Redux
  const {
    openQuickNotes,
    openQuickTasks,
    openQuickChat,
    openQuickData,
    openQuickFiles,
    openQuickUtilities,
    openQuickChatHistory,
    openVoicePad,
  } = useQuickActions();

  // Notifications state (placeholder)
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const handleThemeToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleFeedbackClick = () => {
    dispatch(openOverlay({ overlayId: "feedbackDialog", data: null }));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center rounded-full p-1 matrx-glass-thin-border transition focus:outline-none"
            aria-label="Open menu"
          >
            {profilePhoto ? (
              <div className="relative w-7 h-7 rounded-full overflow-hidden">
                <Image
                  src={profilePhoto}
                  alt={displayName}
                  fill
                  className="object-cover"
                  sizes="28px"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-7 h-7 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-medium">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="end">
          {/* User info section - Clickable to profile */}
          <Link href="/settings/profile" className="block">
            <div className="px-3 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-t-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                {profilePhoto ? (
                  <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                      src={profilePhoto}
                      alt={displayName}
                      fill
                      className="object-cover"
                      sizes="40px"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-medium">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {displayName}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {user.email}
                  </span>
                  {Boolean(userIsCreator) && (
                    <span className="text-xs font-medium text-amber-500 dark:text-amber-400 flex items-center mt-1">
                      <Crown size={12} className="mr-1" /> Creator
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
          <DropdownMenuSeparator />

          {/* Quick Actions */}
          <DropdownMenuItem onClick={() => openQuickNotes()}>
            <StickyNote className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Quick Note</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openQuickTasks()}>
            <CheckSquare className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Quick Task</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openQuickChat()}>
            <MessageSquare className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Quick Chat</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openQuickData()}>
            <Database className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Quick Data</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openQuickFiles()}>
            <FolderOpen className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Quick Files</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openQuickChatHistory()}>
            <Rainbow className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Chat History</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openQuickUtilities()}>
            <LayoutGrid className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Utilities Hub</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => openVoicePad()}>
            <Mic className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Voice Input</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* System Actions */}
          <DropdownMenuItem onClick={handleFeedbackClick}>
            <Bug className="h-4 w-4 mr-3 text-blue-600 dark:text-blue-400" />
            <span className="text-sm">Feedback</span>
          </DropdownMenuItem>

          <DropdownMenuItem>
            <Bell className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm">Notifications</span>
            {notifications.filter((n) => !n.isRead).length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                {notifications.filter((n) => !n.isRead).length}
              </span>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleThemeToggle}>
            {theme === "dark" ? (
              <Sun className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            ) : (
              <Moon className="h-4 w-4 mr-3 text-gray-600 dark:text-gray-400" />
            )}
            <span className="text-sm">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* User Settings */}
          <DropdownMenuItem asChild>
            <Link
              href="/settings/preferences"
              className="flex items-center gap-3 w-full cursor-pointer"
            >
              <svg
                className="h-4 w-4 text-gray-600 dark:text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-sm">Preferences</span>
            </Link>
          </DropdownMenuItem>

          {/* Sign out section */}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              href="/sign-out"
              className="flex items-center gap-3 w-full cursor-pointer text-red-600 dark:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">Sign out</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
