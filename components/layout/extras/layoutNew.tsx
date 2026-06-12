"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, createContext, useContext, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { Settings, User } from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/MatrixLogo";
// @ts-ignore - constants module exists but TypeScript may not resolve it correctly
import { appSidebarLinks } from "@/features/shell/navigation/navigationLinks";
import { ThemeSwitcher } from "@/styles/themes/ThemeSwitcher";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CollapseToggleButton } from "../CollapseToggleButton";

type NavLink = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

type SidebarContextValue = {
  open: boolean;
  setOpen: (value: boolean) => void;
  isNavigating: boolean;
};

const SidebarContext = createContext<SidebarContextValue | undefined>(
  undefined,
);

const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context)
    throw new Error("useSidebar must be used within SidebarProvider");
  return context;
};

export function LayoutWithSidebar({
  primaryLinks = appSidebarLinks,
  secondaryLinks,
  children,
  initialOpen = false,
}: {
  primaryLinks?: NavLink[];
  secondaryLinks?: NavLink[];
  children?: React.ReactNode;
  initialOpen?: boolean;
}) {
  const user = useSelector(selectUser);
  const displayName =
    user.userMetadata.name ||
    user.userMetadata.fullName ||
    user.email?.split("@")[0] ||
    "User";
  const profilePhoto = user.userMetadata.picture || null;

  const defaultSecondaryLinks: NavLink[] = [
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

  const [open, setOpen] = useState(initialOpen);
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
    setIsNavigating(false);
  }, [pathname]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, isNavigating }}>
      <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col overflow-hidden rounded-md border border-neutral-200 bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800 md:flex-row h-dvh">
        <NavSidebar
          primaryLinks={primaryLinks}
          secondaryLinks={secondaryLinks || defaultSecondaryLinks}
          userProfile={{
            name: displayName,
            photo: profilePhoto,
          }}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex h-full w-full flex-1 flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-background/80 md:p-3 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

function NavSidebar({
  primaryLinks,
  secondaryLinks,
  userProfile,
}: {
  primaryLinks: NavLink[];
  secondaryLinks: NavLink[];
  userProfile: { name: string; photo: string | null };
}) {
  const { open, setOpen, isNavigating } = useSidebar();

  const sidebarContent = (
    <div className="flex flex-1 flex-col justify-between gap-10">
      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-hide">
        <Logo open={open} />
        <nav className="mt-8 flex flex-col">
          {primaryLinks.map((link) => (
            <NavLink key={link.href} {...link} />
          ))}
        </nav>
        <div className="my-4 h-px w-full bg-gradient-to-r from-neutral-200 via-neutral-200 to-transparent dark:from-neutral-700" />
        <nav className="flex flex-col">
          {secondaryLinks.map((link) => (
            <NavLink key={link.href} {...link} />
          ))}
        </nav>
      </div>
      <div>
        <ThemeSwitcher open={open} />
        <NavLink
          href="#"
          label={userProfile.name}
          icon={
            <div
              className={cn(
                "relative overflow-hidden rounded-full flex-shrink-0",
                open ? "h-7 w-7" : "h-5 w-5",
              )}
            >
              <Image
                src={userProfile.photo || "/happy-robot-avatar.jpg"}
                alt="Avatar"
                fill
                className="object-cover"
                sizes="28px"
              />
            </div>
          }
        />
      </div>
    </div>
  );

  return (
    <>
      <motion.aside
        className="group/sidebar relative m-2 hidden h-full w-[235px] flex-shrink-0 rounded-xl bg-white px-4 py-4 dark:bg-neutral-900 md:flex md:flex-col hide-scrollbar"
        animate={{ width: open ? "235px" : "70px" }}
      >
        <CollapseToggleButton isOpen={open} onToggle={() => setOpen(!open)} />
        {sidebarContent}
      </motion.aside>

      <div className="flex h-10 w-full md:hidden">
        <button onClick={() => setOpen(true)} className="ml-auto p-4">
          <IconMenu2 className="text-neutral-800 dark:text-neutral-200" />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="fixed inset-0 z-[100] flex flex-col bg-white p-10 dark:bg-neutral-900"
            >
              {isNavigating ? (
                <div className="animate-pulse space-y-4 mt-16">
                  <div className="h-8 bg-muted rounded w-3/4" />
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-4 bg-muted rounded w-full" />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setOpen(false)}
                    className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200"
                  >
                    <IconX />
                  </button>
                  {sidebarContent}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function NavLink({ href, label, icon }: NavLink) {
  const { open } = useSidebar();
  const pathname = usePathname();
  const isActive = pathname === href;

  const linkContent = (
    <>
      {icon}
      <motion.span
        animate={{
          opacity: open ? 1 : 0,
          display: open ? "inline-block" : "none",
        }}
        className="ml-2 text-sm text-neutral-700 dark:text-neutral-200"
      >
        {label}
      </motion.span>
    </>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className={cn(
            "group/sidebar flex items-center gap-2 rounded-sm px-2 py-2",
            "hover:bg-neutral-100 dark:hover:bg-neutral-700",
            "transition-colors duration-200",
            isActive && "bg-neutral-100 dark:bg-neutral-700",
          )}
        >
          {linkContent}
        </Link>
      </TooltipTrigger>
      {!open && (
        <TooltipContent side="right">
          <p>{label}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}
