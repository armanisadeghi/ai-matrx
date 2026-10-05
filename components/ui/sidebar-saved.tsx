"use client";

import {cn} from "@/lib/utils";
import Link, {LinkProps} from "next/link";
import React, {useState, createContext, useContext, useCallback} from "react";
import {AnimatePresence, motion, HTMLMotionProps} from "motion/react";
import {IconMenu2, IconX} from "@tabler/icons-react";

interface Links {
    label: string;
    href: string;
    icon: React.ReactNode;
}

interface SidebarContextProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
};

interface SidebarProviderProps {
    children: React.ReactNode;
    open?: boolean;
    setOpen?: (open: boolean) => void;
    animate?: boolean;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = (
    {
        children,
        open: openProp,
        setOpen: setOpenProp,
        animate = true,
    }) => {
    const [openState, setOpenState] = useState(false);

    const open = openProp !== undefined ? openProp : openState;
    const setOpen = useCallback((value: boolean) => {
        if (setOpenProp) {
            setOpenProp(value);
        } else {
            setOpenState(value);
        }
    }, [setOpenProp]);

    return (
        <SidebarContext.Provider value={{open, setOpen, animate}}>
            {children}
        </SidebarContext.Provider>
    );
};

interface SidebarProps extends Omit<SidebarProviderProps, 'setOpen'> {
    setOpen?: (open: boolean) => void;
}

export const SidebarSaved: React.FC<SidebarProps> = (
    {
        children,
        open,
        setOpen,
        animate,
    }) => {
    return (
        <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
            {children}
        </SidebarProvider>
    );
};

interface SidebarBodyProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const SidebarBody: React.FC<SidebarBodyProps> = ({children, ...props}) => {
    return (
        <>
            {/* @ts-ignore */}
            <DesktopSidebar {...props}>{children}</DesktopSidebar>
            <MobileSidebar {...props}>{children}</MobileSidebar>
        </>
    );
};

interface DesktopSidebarProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = (
    {
        className,
        children,
        ...props
    }) => {
    const {open, setOpen, animate} = useSidebar();

    return (
        <motion.div
            className={cn(
                "h-full px-4 py-4 hidden md:flex md:flex-col",
                "bg-gray-300 dark:bg-neutral-700 flex-shrink-0",
                open ? "overflow-y-auto" : "overflow-hidden",
                className
            )}
            animate={{
                width: animate ? (open ? "300px" : "60px") : "300px",
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            {...props}
        >
            <div className={cn("flex flex-col", open ? "" : "items-center")}>
                {children}
            </div>
        </motion.div>
    );
};

interface MobileSidebarProps extends React.ComponentProps<"div"> {
    children: React.ReactNode;
}

export const MobileSidebar: React.FC<MobileSidebarProps> = (
    {
        className,
        children,
        ...props
    }) => {
    const {open, setOpen} = useSidebar();
    return (
        <>
            <div
                className={cn(
                    "h-10 px-4 py-4 flex flex-row md:hidden items-center justify-between bg-neutral-100 dark:bg-neutral-800 w-full"
                )}
                {...props}
            >
                <div className="flex justify-end z-20 w-full">
                    <IconMenu2
                        className="text-neutral-800 dark:text-neutral-200"
                        onClick={() => setOpen(!open)}
                    />
                </div>
                <AnimatePresence>
                    {open && (
                        <motion.div
                            initial={{x: "-100%", opacity: 0}}
                            animate={{x: 0, opacity: 1}}
                            exit={{x: "-100%", opacity: 0}}
                            transition={{
                                duration: 0.3,
                                ease: "easeInOut",
                            }}
                            className={cn(
                                "fixed h-full w-full inset-0 bg-white dark:bg-neutral-900 p-10 z-[100] flex flex-col justify-between",
                                className
                            )}
                        >
                            <div
                                className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200"
                                onClick={() => setOpen(!open)}
                            >
                                <IconX/>
                            </div>
                            {children}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};

interface SidebarLinkProps extends Omit<LinkProps, 'href'> {
    link: Links;
    className?: string;
}

export const SidebarLink: React.FC<SidebarLinkProps> = (
    {
        link,
        className,
        ...props
    }) => {
    const {open, animate} = useSidebar();
    return (
        <Link
            href={link.href}
            className={cn(
                "flex items-center justify-start gap-2 group/sidebar py-2",
                className
            )}
            {...props}
        >
            {link.icon}
            <motion.span
                animate={{
                    display: animate ? (open ? "inline-block" : "none") : "inline-block",
                    opacity: animate ? (open ? 1 : 0) : 1,
                }}
                className="text-neutral-700 dark:text-neutral-200 type-body group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
            >
                {link.label}
            </motion.span>
        </Link>
    );
};
