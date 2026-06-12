"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import Link, { LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useState, createContext, useContext, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX, IconLogout, IconUser } from "@tabler/icons-react";
import { Logo } from "@/components/layout/MatrixLogo";
// @ts-ignore - constants module exists but TypeScript may not resolve it correctly
import { appSidebarLinks } from "@/features/shell/navigation/navigationLinks";
import { Settings, User, ChevronLeft, ChevronRight } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";
import { ThemeSwitcher } from "@/styles/themes/ThemeSwitcher";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/utils/supabase/client";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

export interface DirectLayoutProps {
  primaryLinks?: Links[];
  secondaryLinks?: Links[];
  initialOpen?: boolean;
  children?: React.ReactNode;
  isAdmin: boolean;
}

// Sidebar toggle component
function SidebarToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onToggle}
          className={cn(
            "group/sidebar flex items-center rounded-sm transition-colors duration-200 ease-in-out hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-ew-resize",
            open
              ? "justify-start gap-2 px-2 py-2"
              : "justify-center px-1 py-1.5",
          )}
        >
          {open ? (
            <ChevronLeft className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          )}
          {open && (
            <motion.span
              initial={{
                display: "none",
                opacity: 0,
              }}
              animate={{
                display: open ? "inline-block" : "none",
                opacity: open ? 1 : 0,
              }}
              className="!m-0 inline-block whitespace-pre !p-0 text-xs text-neutral-700 transition duration-150 dark:text-neutral-200"
            >
              Collapse
            </motion.span>
          )}
        </button>
      </TooltipTrigger>
      {!open && <TooltipContent side="right">Expand sidebar</TooltipContent>}
    </Tooltip>
  );
}

// Logout function component to handle user logout
function LogoutAction() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <DropdownMenuItem
      onClick={handleLogout}
      className="text-red-500 dark:text-red-400"
    >
      <IconLogout className="mr-2 h-4 w-4" />
      <span>Log out</span>
    </DropdownMenuItem>
  );
}

// User profile dropdown component
function UserProfileDropdown({
  userName,
  userProfilePhoto,
  open,
}: {
  userName: string;
  userProfilePhoto: string | null;
  open: boolean;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "group/sidebar flex w-full items-center rounded-sm transition-colors duration-200 ease-in-out hover:bg-neutral-100 dark:hover:bg-neutral-700",
                open
                  ? "justify-start gap-2 px-2 py-2"
                  : "justify-center px-1 py-1.5",
              )}
            >
              <div
                className={cn(
                  "relative overflow-hidden rounded-full flex-shrink-0",
                  open ? "h-7 w-7" : "h-5 w-5",
                )}
              >
                <Image
                  src={userProfilePhoto || "/happy-robot-avatar.jpg"}
                  alt="Avatar"
                  fill
                  className="object-cover"
                  sizes="28px"
                />
              </div>
              {open && (
                <div className="inline-block text-neutral-700 dark:text-neutral-200 text-xs">
                  {userName}
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {!open && <TooltipContent side="right">{userName}</TooltipContent>}
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="flex items-center">
            <IconUser className="mr-2 h-4 w-4" />
            <span>Profile Settings</span>
          </Link>
        </DropdownMenuItem>
        <LogoutAction />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined,
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const [openState, setOpenState] = useState(openProp ?? false);
  const pathname = usePathname();

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  // Close sidebar on route changes only on mobile
  useEffect(() => {
    if (window.innerWidth < 768) {
      setOpen(false);
    }
  }, [pathname, setOpen]);

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...props} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen } = useSidebar();
  return (
    <motion.div
      className={cn(
        "fixed left-0 top-0 z-50 hidden h-full flex-shrink-0 bg-white dark:bg-neutral-800 md:flex md:flex-col hide-scrollbar border-r border-neutral-200 dark:border-neutral-700",
        open
          ? "overflow-y-auto scrollbar-hide px-1 py-4"
          : "overflow-hidden px-0 py-3",
        className,
      )}
      initial={{
        width: "32px",
      }}
      animate={{
        width: open ? "196px" : "32px",
      }}
      {...props}
    >
      {children as React.ReactNode}
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen } = useSidebar();
  return (
    <motion.div
      className={cn(
        "flex h-10 w-full flex-row items-center justify-between bg-neutral-100 px-4 py-4 dark:bg-neutral-800 md:hidden",
      )}
      {...props}
    >
      <div className="z-20 flex w-full justify-end">
        <IconMenu2
          className="text-neutral-800 dark:text-neutral-200"
          onClick={() => setOpen(!open)}
        />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: "easeInOut",
            }}
            className={cn(
              "fixed inset-0 z-[100] flex h-full w-full flex-col justify-between bg-white p-10 dark:bg-neutral-900",
              className,
            )}
          >
            <div
              className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200"
              onClick={() => setOpen(!open)}
            >
              <IconX />
            </div>
            {children as React.ReactNode}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const SidebarLink: React.FC<{
  link: Links;
  className?: string;
  props?: LinkProps;
}> = ({ link, className, ...props }) => {
  const { open } = useSidebar();
  const pathname = usePathname();
  const isActive = pathname === link.href;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={link.href}
          className={cn(
            "group/sidebar flex items-center rounded-sm transition-colors duration-200 ease-in-out hover:bg-neutral-100 dark:hover:bg-neutral-700",
            open
              ? "justify-start gap-2 px-2 py-2"
              : "justify-center px-1 py-1.5",
            isActive && "bg-neutral-100 dark:bg-neutral-700",
            className,
          )}
          {...props}
        >
          {link.icon}
          {open && (
            <div className="inline-block text-neutral-700 dark:text-neutral-200 text-xs">
              {link.label}
            </div>
          )}
        </Link>
      </TooltipTrigger>
      {!open && <TooltipContent side="right">{link.label}</TooltipContent>}
    </Tooltip>
  );
};

// Main Direct Layout Component
export function MatrxLayoutDirect({
  primaryLinks,
  secondaryLinks,
  children,
  initialOpen = false,
  isAdmin,
}: DirectLayoutProps) {
  const user = useSelector(selectUser);
  const displayName =
    user.userMetadata.name ||
    user.userMetadata.fullName ||
    user.email?.split("@")[0] ||
    "User";
  const profilePhoto = user.userMetadata.picture || null;
  const defaultSecondaryLinks = [
    {
      label: "Settings",
      href: "/use/settings",
      icon: <Settings className="h-5 w-5 text-foreground" />,
    },
    {
      label: displayName,
      href: "/settings/profile",
      icon: <User className="h-5 w-5 text-foreground" />,
    },
  ];

  if (!primaryLinks) primaryLinks = appSidebarLinks;
  if (!secondaryLinks) secondaryLinks = defaultSecondaryLinks;

  const [open, setOpen] = useState(initialOpen);

  return (
    <>
      {/* Sidebar */}
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody
          className={cn("justify-between", open ? "gap-10" : "gap-6")}
        >
          <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-hide">
            <Logo open={open} />
            <SidebarToggle open={open} onToggle={() => setOpen(!open)} />
            <div className={cn("flex flex-col", open ? "mt-8" : "mt-4")}>
              {primaryLinks.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
            <div className={cn(open ? "mt-4" : "mt-3")}>
              <div className="h-px w-full bg-neutral-200 dark:bg-neutral-700"></div>
              <div className="h-px w-full bg-white dark:bg-neutral-900"></div>
            </div>
            <div className={cn("flex flex-col", open ? "mt-4" : "mt-3")}>
              {isAdmin && open && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Admin
                </div>
              )}
              {secondaryLinks.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
          </div>
          <div>
            <ThemeSwitcher open={open} />
            <UserProfileDropdown
              userName={displayName}
              userProfilePhoto={profilePhoto}
              open={open}
            />
          </div>
        </SidebarBody>
      </Sidebar>

      {/* Main Content - with dynamic left margin based on sidebar state */}
      <motion.div
        className="min-h-dvh bg-white dark:bg-background"
        initial={{
          marginLeft: "32px",
        }}
        animate={{
          marginLeft: open ? "196px" : "32px",
        }}
        transition={{
          duration: 0.2,
          ease: "easeInOut",
        }}
      >
        {children}
      </motion.div>
    </>
  );
}

export default MatrxLayoutDirect;
