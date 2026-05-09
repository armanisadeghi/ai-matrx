"use client";
import React from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, Crown, Settings, Sun, Moon, Bug } from "lucide-react";
import { setMode } from "@/styles/themes/themeSlice";
import Image from "next/image";
import Link from "next/link";
import { navigationLinks } from "@/features/shell/navigation/navigationLinks";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { selectTaskFirstListenerId } from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import { selectResponseTextByListenerId } from "@/lib/redux/socket-io/selectors/socket-response-selectors";
import AdminMenu from "./AdminMenu";
import CreatorMenu from "./CreatorMenu";
import { useMenuAnimations } from "./useMenuAnimations";
interface NavigationItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  profileMenu?: boolean;
  dashboard?: boolean;
}

interface MenuSection {
  component: React.ComponentType<any>;
  props?: Record<string, any>;
  shouldRender?: boolean;
}

interface NavigationMenuProps {
  customLinks?: NavigationItem[];
  triggerClassName?: string;
  contentClassName?: string;
  itemClassName?: string;
  position?: "left" | "right";
  mobileBreakpoint?: "sm" | "md" | "lg";
  // New props for modularity
  additionalMenuSections?: MenuSection[];
  showCreatorFeatures?: boolean;
  showAdminFeatures?: boolean;
  // Animation props
  enableAnimations?: boolean;
  animationTrigger?: string | null;
}

export const NavigationMenu: React.FC<NavigationMenuProps> = ({
  customLinks,
  triggerClassName = "",
  contentClassName = "",
  itemClassName = "",
  position = "right",
  mobileBreakpoint = "md",
  additionalMenuSections = [],
  showCreatorFeatures = true,
  showAdminFeatures = true,
  enableAnimations = true,
  animationTrigger = null,
}) => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const isMobile = useIsMobile();
  const theme = useAppSelector((s) => s.theme.mode);
  const setTheme = (t: "light" | "dark") => dispatch(setMode(t));
  const user = useAppSelector(selectUser);
  const displayName =
    user.userMetadata.name ||
    user.userMetadata.fullName ||
    user.email?.split("@")[0] ||
    "User";
  const profilePhoto = user.userMetadata.picture || null;
  // Creator and admin status
  const userIsCreator = useAppSelector((state) =>
    brokerSelectors.selectValue(state, "APPLET_USER_IS_ADMIN"),
  );
  const isAdmin = useAppSelector((state) =>
    brokerSelectors.selectValue(state, "GLOBAL_USER_IS_ADMIN"),
  );

  const handleThemeToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleFeedbackClick = () => {
    dispatch(openOverlay({ overlayId: "feedbackDialog", data: null }));
  };

  // Get current task information from redux state (only for applet-specific animations)
  const currentTaskId = useAppSelector((state) =>
    brokerSelectors.selectValue(state, "CURRENT_TASK_ID"),
  );
  const firstListenerId = useAppSelector((state) =>
    currentTaskId ? selectTaskFirstListenerId(state, currentTaskId) : null,
  );
  const textResponse = useAppSelector((state) =>
    firstListenerId
      ? selectResponseTextByListenerId(firstListenerId)(state)
      : "",
  );

  // Use the custom hook for animations
  const { shouldShowAnimation, creatorAnimClass, creatorButtonClass } =
    useMenuAnimations({
      enabled: enableAnimations,
      userIsCreator,
      firstListenerId,
      customTrigger: animationTrigger,
    });

  // Filter navigation links to only show those with profileMenu: true
  const defaultFilteredLinks = navigationLinks.filter(
    (link) => link.profileMenu,
  );

  // Use custom links if provided, otherwise use default filtered links
  const menuLinks = customLinks || defaultFilteredLinks;

  // Determine which menu sections to show
  const shouldShowCreatorMenu =
    showCreatorFeatures && (userIsCreator || isAdmin);
  const shouldShowAdminMenu = showAdminFeatures && isAdmin;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex items-center rounded-full pl-2 pr-1 matrx-glass-thin-border shadow-sm hover:shadow-md transition cursor-pointer focus:outline-none ${creatorButtonClass} ${triggerClassName}`}
          >
            {userIsCreator && (
              <Crown size={16} className="mr-1 text-amber-400" />
            )}
            <Menu size={18} className="ml-2 text-gray-600 dark:text-gray-400" />
            {profilePhoto ? (
              <div className="relative w-8 h-8 rounded-full ml-3 overflow-hidden">
                <Image
                  src={profilePhoto}
                  alt={displayName}
                  fill
                  className="object-cover"
                  sizes="32px"
                />
              </div>
            ) : (
              <div className="w-8 h-8 bg-gray-500 dark:bg-gray-600 rounded-full ml-3 flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={`w-72 ${contentClassName} ${creatorAnimClass} max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden`}
          align={position === "right" ? "end" : "start"}
        >
          {/* User info section - Fixed at top, clickable to profile */}
          <Link href="/settings/profile" className="block flex-shrink-0">
            <div className="px-2 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-t-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer">
              <div className="flex items-center gap-3 min-w-0">
                {profilePhoto ? (
                  <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                      src={profilePhoto}
                      alt={displayName}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-gray-500 dark:bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
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
                  {userIsCreator && (
                    <span className="text-xs font-medium text-amber-500 dark:text-amber-400 flex items-center mt-1">
                      <Crown size={12} className="mr-1 flex-shrink-0" /> Creator
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
          <DropdownMenuSeparator className="flex-shrink-0" />

          {/* Scrollable middle section */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
            {/* Navigation links */}
            {menuLinks.map((link, index) => (
              <DropdownMenuItem key={link.href} asChild>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 w-full px-2 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${itemClassName}`}
                >
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {link.icon}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                    {link.label}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}

            {/* Creator Menu - conditionally rendered */}
            {shouldShowCreatorMenu && <CreatorMenu />}

            {/* Admin Menu - conditionally rendered */}
            {shouldShowAdminMenu && (
              <AdminMenu isAdmin={isAdmin} itemClassName={itemClassName} />
            )}

            {/* Additional Menu Sections */}
            {additionalMenuSections.map((section, index) => {
              if (section.shouldRender === false) return null;

              const Component = section.component;
              return (
                <Component
                  key={`additional-section-${index}`}
                  {...section.props}
                />
              );
            })}
          </div>

          {/* Fixed bottom section */}
          <div className="flex-shrink-0">
            <DropdownMenuSeparator />

            {/* Feedback - Only show on mobile */}
            {isMobile && (
              <DropdownMenuItem onClick={handleFeedbackClick}>
                <div className="flex items-center gap-3 w-full">
                  <Bug className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    Send Feedback
                  </span>
                </div>
              </DropdownMenuItem>
            )}

            {/* Theme toggle */}
            <DropdownMenuItem onClick={handleThemeToggle}>
              <div className="flex items-center gap-3 w-full">
                {theme === "dark" ? (
                  <Sun className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </span>
              </div>
            </DropdownMenuItem>

            {/* Preferences */}
            <DropdownMenuItem asChild>
              <Link
                href="/settings/preferences"
                className="flex items-center gap-3 w-full px-2 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  Preferences
                </span>
              </Link>
            </DropdownMenuItem>

            {/* Sign out section */}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/sign-out"
                className="flex items-center gap-3 w-full px-2 py-2 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span className="text-sm font-medium">Sign out</span>
              </Link>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export default NavigationMenu;
