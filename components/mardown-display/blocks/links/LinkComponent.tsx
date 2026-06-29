import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Copy, Check, Bookmark, ExternalLink, FileText } from "lucide-react";
import { addUtmSource } from "@/utils/url-utm";

// Error Boundary for Link Component
class LinkErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    href?: string;
    fallbackChildren?: React.ReactNode;
  },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("LinkComponent Error:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      // Graceful fallback to a simple link
      const { href, fallbackChildren } = this.props;
      const safeHref = href ? addUtmSource(href) : "#";
      return (
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 underline"
        >
          {fallbackChildren || "Link"}
        </a>
      );
    }

    return this.props.children;
  }
}

// Global state management for ensuring only one popup is open at a time
let activePopupId: string | null = null;
const popupListeners = new Set<(activeId: string | null) => void>();

/** Match agent hover previews (`WebpageHoverPreview`, etc.). */
const LINK_MENU_OPEN_DELAY_MS = 250;

const setActivePopup = (id: string | null) => {
  activePopupId = id;
  popupListeners.forEach((listener) => listener(id));
};

const useGlobalPopupState = (componentId: string) => {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const listener = (activeId: string | null) => {
      setIsActive(activeId === componentId);
    };

    popupListeners.add(listener);
    // Set initial state
    setIsActive(activePopupId === componentId);

    return () => {
      popupListeners.delete(listener);
    };
  }, [componentId]);

  const openPopup = useCallback(
    () => setActivePopup(componentId),
    [componentId],
  );
  const closePopup = useCallback(() => setActivePopup(null), []);

  return { isActive, openPopup, closePopup };
};

const LinkComponentCore = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => {
  // Validate props early
  if (!href || typeof href !== "string") {
    return (
      <span className="text-blue-600 dark:text-blue-400">
        {children || "Invalid Link"}
      </span>
    );
  }

  // Add UTM source to all external links
  const finalHref = addUtmSource(href);

  // Generate stable component ID using useMemo equivalent
  const componentIdRef = useRef<string | null>(null);
  if (!componentIdRef.current) {
    componentIdRef.current = `link-popup-${Math.random().toString(36).substr(2, 9)}`;
  }
  const componentId = componentIdRef.current as string;

  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const isMountedRef = useRef(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mouseTrackingRef = useRef(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use global popup state
  const {
    isActive: isPopupActive,
    openPopup,
    closePopup,
  } = useGlobalPopupState(componentId);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  // Set isMounted to true on mount (for SSR safety) - STABLE, runs once
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearOpenTimer();
      // Clean up any active popup on unmount
      if (activePopupId === componentId) {
        setActivePopup(null);
      }
    };
  }, [clearOpenTimer, componentId]);

  // Handle mouse move - stable callback
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!menuRef.current || !mouseTrackingRef.current) return;

      try {
        const menuRect = menuRef.current.getBoundingClientRect();

        // Check if mouse is within menu boundaries or close to it
        const isMouseNearMenu =
          e.clientX >= menuRect.left - 20 &&
          e.clientX <= menuRect.right + 20 &&
          e.clientY >= menuRect.top - 20 &&
          e.clientY <= menuRect.bottom + 20;

        // Also check if mouse is over the link itself
        const linkRect = linkRef.current?.getBoundingClientRect();
        const isMouseNearLink =
          linkRect &&
          e.clientX >= linkRect.left - 5 &&
          e.clientX <= linkRect.right + 5 &&
          e.clientY >= linkRect.top - 5 &&
          e.clientY <= linkRect.bottom + 5;

        // Keep the menu open if mouse is over or near it, or near the link
        if (!isMouseNearMenu && !isMouseNearLink) {
          mouseTrackingRef.current = false;
          setIsHovered(false);
          closePopup();
        }
      } catch (error) {
        console.error("Error in handleMouseMove:", error);
        // Fail gracefully
        mouseTrackingRef.current = false;
        setIsHovered(false);
        closePopup();
      }
    },
    [closePopup],
  );

  // Add/remove mouse move listener - FIXED: removed menuRef.current from dependencies
  useEffect(() => {
    if (isPopupActive && isHovered) {
      mouseTrackingRef.current = true;
      document.addEventListener("mousemove", handleMouseMove);
    } else {
      mouseTrackingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
    }

    return () => {
      mouseTrackingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isPopupActive, isHovered, handleMouseMove]); // Removed menuRef.current and isMounted

  // Sync local hover state with global popup state
  useEffect(() => {
    if (!isPopupActive && isHovered) {
      setIsHovered(false);
    }
  }, [isPopupActive, isHovered]);

  // Handle mouse enter on the link - stable callback
  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      try {
        clearOpenTimer();
        setMenuPosition({ x: e.clientX, y: e.clientY });
        openTimerRef.current = setTimeout(() => {
          openTimerRef.current = null;
          setIsHovered(true);
          openPopup();
        }, LINK_MENU_OPEN_DELAY_MS);
      } catch (error) {
        console.error("Error in handleMouseEnter:", error);
      }
    },
    [clearOpenTimer, openPopup],
  );

  const handleMouseLeave = useCallback(() => {
    // Cancel a pending open when the cursor leaves before the delay elapses.
    // Once open, global mouse tracking + closePopup() own teardown.
    clearOpenTimer();
  }, [clearOpenTimer]);

  const handleCopyLink = useCallback(() => {
    if (!navigator.clipboard) {
      console.error("Clipboard API not available");
      return;
    }

    navigator.clipboard
      .writeText(finalHref)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy link:", err);
      });
  }, [finalHref]);

  const handleOpenInNewTab = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        window.open(finalHref, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.error("Failed to open link:", error);
      }
    },
    [finalHref],
  );

  const handleAddToFavorites = useCallback(() => {
    console.log("Added to favorites:", { url: finalHref, title: children });
    // Could be expanded to save to localStorage or Redux
  }, [finalHref, children]);

  const handleGetContent = useCallback(() => {
    console.log("Getting content from:", finalHref);
    // Could be expanded later
  }, [finalHref]);

  // Calculate menu position - stable function
  const getMenuStyle = useCallback(() => {
    if (!menuPosition || !isMountedRef.current) return {};

    try {
      const menuWidth = 300;
      const menuHeight = 200;

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let left = menuPosition.x;
      let top = menuPosition.y;

      if (left + menuWidth > windowWidth) {
        left = Math.max(10, windowWidth - menuWidth - 10);
      }

      if (top + menuHeight > windowHeight) {
        top = Math.max(10, windowHeight - menuHeight - 10);
      }

      return {
        position: "fixed" as const,
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 100,
      };
    } catch (error) {
      console.error("Error calculating menu position:", error);
      return {};
    }
  }, [menuPosition]);

  // Function to truncate URL if it's too long
  const truncateUrl = useCallback((url: string, maxLength = 40) => {
    if (!url || url.length <= maxLength) return url;
    const start = url.substring(0, maxLength / 2);
    const end = url.substring(url.length - maxLength / 2);
    return `${start}...${end}`;
  }, []);

  // Get display text for children
  const displayText = typeof children === "string" ? children : "Link";

  // Create the popup menu component - only show if this popup is globally active
  const popupMenu = isPopupActive && isHovered && isMountedRef.current && (
    <div
      ref={menuRef}
      className="bg-white dark:bg-gray-900 border-border rounded-lg shadow-2xl backdrop-blur-sm py-0 w-[280px] text-gray-700 dark:text-gray-200 text-sm overflow-hidden"
      style={getMenuStyle()}
    >
      {/* Title Section */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div
          className="font-semibold text-base truncate text-gray-900 dark:text-gray-100"
          title={displayText}
        >
          {displayText}
        </div>
      </div>

      {/* Action Items */}
      <div className="py-2">
        <div
          className="px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer flex items-center gap-3 transition-colors duration-150 group"
          onClick={handleCopyLink}
        >
          {copied ? (
            <Check
              size={16}
              className="text-green-600 dark:text-green-400 flex-shrink-0"
            />
          ) : (
            <Copy
              size={16}
              className="text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 transition-colors"
            />
          )}
          <span
            className={`${copied ? "text-green-700 dark:text-green-300" : "text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100"}`}
          >
            {copied ? "Copied!" : "Copy link"}
          </span>
        </div>

        <div
          className="px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer flex items-center gap-3 transition-colors duration-150 group"
          onClick={handleOpenInNewTab}
        >
          <ExternalLink
            size={16}
            className="text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 transition-colors"
          />
          <span className="text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 truncate">
            Open in new tab
          </span>
        </div>

        <div
          className="px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer flex items-center gap-3 transition-colors duration-150 group"
          onClick={handleAddToFavorites}
        >
          <Bookmark
            size={16}
            className="text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 transition-colors"
          />
          <span className="text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 truncate">
            Add to favorites
          </span>
        </div>

        <div
          className="px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer flex items-center gap-3 transition-colors duration-150 group"
          onClick={handleGetContent}
        >
          <FileText
            size={16}
            className="text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0 transition-colors"
          />
          <span className="text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 truncate">
            Get content
          </span>
        </div>
      </div>

      {/* URL Footer */}
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
        <div
          className="text-[11px] text-gray-500 dark:text-gray-400 truncate font-mono"
          title={finalHref}
        >
          {truncateUrl(finalHref, 40)}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <a
        ref={linkRef}
        href={finalHref}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "relative inline text-blue-600 dark:text-blue-400 underline font-medium",
          "transition-all duration-200 hover:text-blue-700 dark:hover:text-blue-300",
          isHovered && isPopupActive && "text-blue-800 dark:text-blue-200",
        )}
      >
        {children}
      </a>

      {/* Render popup menu using portal to avoid nesting issues */}
      {popupMenu &&
        typeof document !== "undefined" &&
        createPortal(popupMenu, document.body)}
    </>
  );
};

// Memoized core component to prevent unnecessary re-renders during streaming
const MemoizedLinkComponentCore = memo(
  LinkComponentCore,
  (prevProps, nextProps) => {
    // Only re-render if href or children actually change
    return (
      prevProps.href === nextProps.href &&
      prevProps.children === nextProps.children
    );
  },
);

// Main export with error boundary
export const LinkComponent = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => {
  return (
    <LinkErrorBoundary href={href} fallbackChildren={children}>
      <MemoizedLinkComponentCore href={href}>
        {children}
      </MemoizedLinkComponentCore>
    </LinkErrorBoundary>
  );
};

export default LinkComponent;
