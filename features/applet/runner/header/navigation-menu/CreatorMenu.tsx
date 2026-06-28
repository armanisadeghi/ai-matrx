"use client";
import React, { useMemo } from "react";
import {
  openOverlay,
  selectIsOverlayOpen,
} from "@/lib/redux/slices/overlaySlice";
import { appletLayoutOptionsArray } from "@/features/applet/constants/layout-options";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/styles/themes/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
// Custom SubTrigger without the right chevron
const CustomSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {children}
  </DropdownMenuPrimitive.SubTrigger>
));
CustomSubTrigger.displayName = "CustomSubTrigger";

// Creator Menu component
export const CreatorMenu: React.FC = () => {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if we're on an applet page
  const isAppletPage = pathname.startsWith("/apps/custom/");

  // Parse the current path to get slug and appletSlug if we're on an applet page
  const pathParts = isAppletPage ? pathname.split("/").filter(Boolean) : [];
  const currentApp = pathParts.length >= 3 ? pathParts[2] : "";
  const currentApplet = pathParts.length >= 4 ? pathParts[3] : "";

  // Function to navigate to the same page with a different layout
  const changeLayout = (layout: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("lt", layout);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Get user role information from Redux
  const userIsCreator = useAppSelector((state) =>
    brokerSelectors.selectValue(state, "APPLET_USER_IS_ADMIN"),
  );
  const isAdmin = useAppSelector((state) =>
    brokerSelectors.selectValue(state, "GLOBAL_USER_IS_ADMIN"),
  );

  // If user is neither a creator nor admin, don't render anything
  if (!userIsCreator && !isAdmin) return null;

  // Get the current task ID and its first listener
  const currentTaskId = useAppSelector(selectCurrentTaskId);
  const firstListenerId = useAppSelector(selectCurrentTaskFirstListenerId);
  const textResponse = "";
  const isTaskComplete = true;

  // Determine if we have valid context for context-sensitive tools
  const hasValidContext = Boolean(firstListenerId && textResponse);

  // All menu items combined in a single array
  const menuItems = [
    // Creator links
    {
      id: "brokerState",
      icon: <Cpu className="h-4 w-4 text-teal-500" />,
      label: "Broker State",
      type: "overlay",
      onClick: () => {
        dispatch(
          openOverlay({
            overlayId: "brokerState",
            data: null,
          }),
        );
      },
    },
    {
      id: "markdownEditor",
      icon: <FileText className="h-4 w-4 text-purple-500" />,
      label: "Applet Content",
      type: "overlay",
      disabled: !hasValidContext,
      onClick: () => {
        if (!hasValidContext) return;
        dispatch(
          openOverlay({
            overlayId: "markdownEditor",
            data: {
              initialMarkdown: textResponse,
              showSampleSelector: true,
              showConfigSelector: true,
            },
          }),
        );
      },
    },
    {
      id: "socketAccordion",
      icon: <Server className="h-4 w-4 text-orange-500" />,
      label: "Server Admin",
      type: "overlay",
      disabled: !hasValidContext,
      onClick: () => {
        if (!hasValidContext) return;
        dispatch(
          openOverlay({
            overlayId: "socketAccordion",
            data: { taskId: currentTaskId },
          }),
        );
      },
    },
    {
      id: "manage",
      icon: <Code className="h-4 w-4 text-emerald-500" />,
      label: "Manage Applets",
      type: "link",
      href: "/apps/builder",
    },
    {
      id: "edit",
      icon: <Paintbrush className="h-4 w-4 text-violet-500" />,
      label: "Edit Content",
      type: "link",
      href: "#",
    },
    // Layout variations now handled separately as a submenu
    {
      id: "settings",
      icon: <Database className="h-4 w-4 text-blue-500" />,
      label: "Creator Settings",
      type: "link",
      href: "#",
    },
  ];

  return (
    <>
      <DropdownMenuSeparator />
      <div className="px-2 py-2">
        <span className="text-xs font-semibold text-amber-500 dark:text-amber-400 uppercase flex items-center">
          <Crown size={12} className="mr-1" /> Creator Menu
        </span>
      </div>

      {menuItems.map((item) => {
        if (item.type === "overlay") {
          return (
            <DropdownMenuItem key={item.id} asChild>
              <div
                className={`flex items-center gap-3 w-full px-2 py-2 cursor-pointer ${
                  item.disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                } group`}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent dropdown from closing
                  if (!item.disabled) {
                    item.onClick();
                  }
                }}
              >
                <div className="w-5 h-5 flex items-center justify-center transition-transform group-hover:scale-110">
                  {item.icon}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  {item.label}
                </span>
              </div>
            </DropdownMenuItem>
          );
        } else if (item.type === "link") {
          return (
            <DropdownMenuItem key={item.id} asChild>
              <Link
                href={item.href}
                className="flex items-center gap-3 w-full px-2 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 group"
              >
                <div className="w-5 h-5 flex items-center justify-center transition-transform group-hover:scale-110">
                  {item.icon}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  {item.label}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        }
        return null;
      })}

      {/* Layout Variations Submenu - Only show if we're on an applet page */}
      {isAppletPage && (
        <DropdownMenuSub>
          <CustomSubTrigger className="px-2 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 group">
            <div className="flex items-center gap-3 w-full">
              <div className="w-5 h-5 flex items-center justify-center transition-transform group-hover:scale-110">
                <Layout className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                Layout Variations
              </span>
            </div>
          </CustomSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              className="w-64"
              sideOffset={2}
              alignOffset={-5}
            >
              <ScrollArea className="h-[400px] w-full p-1">
                {appletLayoutOptionsArray.map((layout) => (
                  <DropdownMenuItem key={layout.value} asChild>
                    <div
                      className="flex items-center gap-3 w-full px-2 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent dropdown from closing
                        changeLayout(layout.value);
                      }}
                    >
                      <div className="w-5 h-5 flex items-center justify-center">
                        {layout.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                          {layout.title}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {layout.description}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </ScrollArea>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      )}
    </>
  );
};

export default CreatorMenu;
