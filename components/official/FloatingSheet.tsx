"use client";
import React, { useState, useEffect, ReactNode, useCallback, useRef } from "react";

// Define type for the component props
interface FloatingSheetProps {
    children: ReactNode;
    isOpen: boolean;
    onClose: () => void;
    title?: string | ReactNode;
    description?: string | ReactNode;
    footer?: ReactNode;
    footerContent?: ReactNode; // Alternative to footer for consistency with headerContent
    headerContent?: ReactNode; // Additional content to render in the header
    position?: "right" | "left" | "top" | "bottom" | "center";
    showCloseButton?: boolean;
    closeOnBackdropClick?: boolean;
    closeOnEsc?: boolean; // Close the sheet when ESC key is pressed
    width?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";
    height?: "auto" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";
    spacing?: string;
    rounded?: string;
    className?: string;
    contentClassName?: string;
    headerClassName?: string; // Class name for the header
    footerClassName?: string; // Class name for the footer
    backdropClassName?: string; // Class name for the backdrop
    initialFocus?: boolean; // Automatically focus the sheet when opened
    lockScroll?: boolean; // Whether to lock body scroll when opened
    animationDuration?: number; // Custom animation duration in ms
    preserveScrollPosition?: boolean; // Preserve scroll position when reopening
    closeButton?: ReactNode; // Custom close button element
    role?: string; // ARIA role (defaults to "dialog")
    hasBackdrop?: boolean; // Whether to show a backdrop behind the sheet
    onBackdropClick?: () => void; // Handler for backdrop clicks
    isMobile?: boolean; // Flag to enable mobile-friendly mode
    respectHeader?: boolean; // Whether to position below the app header (default: true)
}

const FloatingSheet: React.FC<FloatingSheetProps> = ({
    children,
    isOpen,
    onClose,
    title = "Sheet Title",
    description,
    footer,
    footerContent,
    headerContent,
    position = "right",
    showCloseButton = true,
    closeOnBackdropClick = true,
    closeOnEsc = true,
    width = "md",
    height = "auto",
    spacing = "0",
    rounded = "2xl",
    className = "",
    contentClassName = "",
    headerClassName = "",
    footerClassName = "",
    backdropClassName = "",
    initialFocus = true,
    lockScroll = true,
    animationDuration = 300,
    preserveScrollPosition = true,
    closeButton,
    role = "dialog",
    hasBackdrop = true,
    onBackdropClick,
    isMobile = false,
    respectHeader = true, // Default to true - sheets should respect the header by default
}) => {
    // Create a state to track if the component has been initially rendered
    const [hasRendered, setHasRendered] = useState(false);
    // Refs for focusing and scroll preservation
    const sheetRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [scrollPosition, setScrollPosition] = useState(0);
    
    // Handle initial render
    useEffect(() => {
        if (!hasRendered) {
            setHasRendered(true);
        }
    }, []);
    
    // Handle body scroll locking when sheet is open
    useEffect(() => {
        if (!lockScroll) return undefined;
        if (isOpen) {
            // Store current scroll position before locking
            const scrollY = window.scrollY;
            document.body.style.position = "fixed";
            document.body.style.width = "100%";
            document.body.style.top = `-${scrollY}px`;
            document.body.style.overflow = "hidden";
        } else {
            // Restore scroll position after unlocking
            const scrollY = document.body.style.top;
            document.body.style.position = "";
            document.body.style.width = "";
            document.body.style.top = "";
            document.body.style.overflow = "";
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || "0", 10) * -1);
            }
        }
        return () => {
            document.body.style.position = "";
            document.body.style.width = "";
            document.body.style.top = "";
            document.body.style.overflow = "";
        };
    }, [isOpen, lockScroll]);
    
    // Handle ESC key press
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen && closeOnEsc) {
                onClose();
            }
        };
        if (isOpen && closeOnEsc) {
            document.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, closeOnEsc, onClose]);
    
    // Handle focus management for accessibility
    useEffect(() => {
        if (isOpen && initialFocus && sheetRef.current) {
            sheetRef.current.focus();
        }
    }, [isOpen, initialFocus]);
    
    // Handle scroll position preservation
    useEffect(() => {
        if (isOpen && contentRef.current && preserveScrollPosition) {
            contentRef.current.scrollTop = scrollPosition;
        }
    }, [isOpen, preserveScrollPosition, scrollPosition]);
    
    // Save scroll position when closing
    useEffect(() => {
        if (!isOpen && contentRef.current && preserveScrollPosition) {
            setScrollPosition(contentRef.current.scrollTop);
        }
    }, [isOpen, preserveScrollPosition]);
    
    // Function to close the sheet when clicking backdrop
    const handleBackdropClick = useCallback(() => {
        if (onBackdropClick) {
            onBackdropClick();
        } else if (closeOnBackdropClick) {
            onClose();
        }
    }, [closeOnBackdropClick, onClose, onBackdropClick]);
    
    // Determine max width based on the width prop
    const getWidthClass = () => {
        // For mobile mode, ignore width prop and use full width
        if (isMobile) {
            return "max-w-full w-full";
        }
        
        const widthMap: Record<string, string> = {
            sm: "max-w-sm",
            md: "max-w-md",
            lg: "max-w-lg",
            xl: "max-w-xl",
            "2xl": "max-w-2xl",
            "3xl": "max-w-3xl",
            "4xl": "max-w-4xl",
            full: "max-w-full",
        };
        
        // For top/bottom positions, use full width by default unless explicitly set
        if ((position === "top" || position === "bottom") && width === "md") {
            return "max-w-full";
        }
        
        return widthMap[width] || "max-w-md";
    };
    
    // Determine height for top/bottom/center positions
    const getHeightClass = () => {
        // For mobile mode with bottom position, use dvh and account for safe area
        if (isMobile && position === "bottom") {
            return "max-h-[90dvh]";
        }
        
        // For mobile mode with full screen (other positions), use dvh units
        if (isMobile && position !== "bottom") {
            // If respecting header, height is already constrained by top-10 bottom-0
            return respectHeader ? "" : "h-dvh";
        }
        
        // For right/left positions, height is controlled by top/bottom positioning
        // No explicit height class needed as it stretches between top and bottom
        if (position === "right" || position === "left") {
            return "";
        }
        
        // For top/bottom/center positions, use dvh units
        // When respectHeader is true, available height is 100dvh - 2.5rem (header height)
        const heightMap: Record<string, string> = {
            sm: "max-h-[20dvh]",
            md: "max-h-[40dvh]",
            lg: "max-h-[60dvh]",
            xl: "max-h-[70dvh]",
            "2xl": "max-h-[80dvh]",
            "3xl": "max-h-[85dvh]",
            "4xl": "max-h-[90dvh]",
            full: respectHeader ? "max-h-[calc(100dvh-2.5rem)]" : "max-h-dvh",
            auto: position === "center" 
                ? (respectHeader ? "max-h-[calc(85dvh-2.5rem)]" : "max-h-[85dvh]")
                : (respectHeader ? "max-h-[calc(50dvh-2.5rem)]" : "max-h-[50dvh]"),
        };
        
        return heightMap[height] || heightMap.auto;
    };
    
    // Determine position classes
    const getPositionClasses = () => {
        // For mobile mode, use full screen positioning
        if (isMobile) {
            // For bottom sheet on mobile, position at the bottom with no spacing
            if (position === "bottom") {
                return "inset-x-0 bottom-0";
            }
            
            // For other positions on mobile, respect header if enabled
            if (respectHeader) {
                return "inset-x-0 top-10 bottom-0";
            }
            return "inset-0";
        }
        
        // Map spacing values to actual Tailwind classes
        // When respectHeader is true, use top-10 (header height) instead of regular top spacing
        const spacingClasses: Record<string, { top: string; bottom: string; left: string; right: string }> = {
            "0": { 
                top: respectHeader ? "top-10" : "top-0", 
                bottom: "bottom-0", 
                left: "left-0", 
                right: "right-0" 
            },
            "1": { 
                top: respectHeader ? "top-[2.75rem]" : "top-1", 
                bottom: "bottom-1", 
                left: "left-1", 
                right: "right-1" 
            },
            "2": { 
                top: respectHeader ? "top-[3rem]" : "top-2", 
                bottom: "bottom-2", 
                left: "left-2", 
                right: "right-2" 
            },
            "3": { 
                top: respectHeader ? "top-[3.25rem]" : "top-3", 
                bottom: "bottom-3", 
                left: "left-3", 
                right: "right-3" 
            },
            "4": { 
                top: respectHeader ? "top-[3.5rem]" : "top-4", 
                bottom: "bottom-4", 
                left: "left-4", 
                right: "right-4" 
            },
            "5": { 
                top: respectHeader ? "top-[3.75rem]" : "top-5", 
                bottom: "bottom-5", 
                left: "left-5", 
                right: "right-5" 
            },
            "6": { 
                top: respectHeader ? "top-[4rem]" : "top-6", 
                bottom: "bottom-6", 
                left: "left-6", 
                right: "right-6" 
            },
            "8": { 
                top: respectHeader ? "top-[4.5rem]" : "top-8", 
                bottom: "bottom-8", 
                left: "left-8", 
                right: "right-8" 
            },
        };
        
        const classes = spacingClasses[spacing] || spacingClasses["0"];
        
        const positionMap: Record<string, string> = {
            right: `${classes.top} ${classes.bottom} ${classes.right}`,
            left: `${classes.top} ${classes.bottom} ${classes.left}`,
            top: `${classes.top} ${classes.left} ${classes.right}`,
            bottom: `${classes.bottom} ${classes.left} ${classes.right}`,
            center: respectHeader ? "left-0 right-0 top-10 bottom-0 flex items-center justify-center" : "inset-0 flex items-center justify-center",
        };
        
        return positionMap[position] || `${classes.top} ${classes.bottom} ${classes.right}`;
    };
    
    // Determine transform classes for animations
    const getTransformClass = () => {
        // For mobile mode
        if (isMobile) {
            // For bottom sheet on mobile, slide up from bottom
            if (position === "bottom") {
                return isOpen ? "translate-y-0" : "translate-y-full";
            }
            
            // For other positions on mobile, fade in/out
            return isOpen ? "opacity-100" : "opacity-0";
        }
        
        const transformMap: Record<string, string> = {
            right: isOpen ? "translate-x-0" : "translate-x-full",
            left: isOpen ? "translate-x-0" : "-translate-x-full",
            top: isOpen ? "translate-y-0" : "-translate-y-full",
            bottom: isOpen ? "translate-y-0" : "translate-y-full",
            center: isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0", // Scale + fade for center modal
        };
        
        return transformMap[position] || (isOpen ? "translate-x-0" : "translate-x-full");
    };
    
    // Determine rounded corners for mobile
    const getRoundedClass = () => {
        if (isMobile) {
            // For bottom sheet, only round the top corners
            if (position === "bottom") {
                return "rounded-t-xl";
            }
            
            // For full screen on mobile, no rounded corners
            return "";
        }
        
        // When spacing is 0 (flush against edges), only round the corners that don't touch edges
        if (spacing === "0") {
            const positionRoundedMap: Record<string, string> = {
                "right": "rounded-l-2xl",  // Only round left side
                "left": "rounded-r-2xl",   // Only round right side
                "top": "rounded-b-2xl",    // Only round bottom
                "bottom": "rounded-t-2xl", // Only round top
                "center": "rounded-2xl",   // Center modals get all corners rounded
            };
            return positionRoundedMap[position] || "rounded-l-2xl";
        }
        
        // Map rounded values to actual Tailwind classes for floating sheets (with spacing)
        const roundedMap: Record<string, string> = {
            "none": "rounded-none",
            "sm": "rounded-sm",
            "md": "rounded-md",
            "lg": "rounded-lg",
            "xl": "rounded-xl",
            "2xl": "rounded-2xl",
            "3xl": "rounded-3xl",
            "full": "rounded-full",
        };
        
        return roundedMap[rounded] || "rounded-2xl";
    };
    
    // Get duration class for animations
    const getDurationClass = () => {
        // Map animation duration (ms) to Tailwind duration classes
        const durationMap: Record<number, string> = {
            75: "duration-75",
            100: "duration-100",
            150: "duration-150",
            200: "duration-200",
            300: "duration-300",
            500: "duration-500",
            700: "duration-700",
            1000: "duration-1000",
        };
        
        return durationMap[animationDuration] || "duration-300";
    };
    
    const positionClasses = getPositionClasses();
    const widthClass = getWidthClass();
    const heightClass = getHeightClass();
    const transformClass = getTransformClass();
    const roundedClass = getRoundedClass();
    const durationClass = getDurationClass();
    
    // Determine if we need to show the header
    const showHeader = title || showCloseButton || headerContent;
    // Determine if we need to show the footer
    const showFooter = footer || footerContent;
    
    // Determine explicit height class for the sheet container
    // For right/left positions with top/bottom positioning, height is implicit
    // For other positions or when height is explicitly set, use the height class
    const getSheetHeightClass = () => {
        // For right/left positions, height is controlled by top/bottom positioning
        if ((position === "right" || position === "left") && respectHeader) {
            return ""; // No explicit height - let top/bottom control it
        }
        
        // For mobile full-screen (not bottom sheet)
        if (isMobile && position !== "bottom") {
            return "h-full";
        }
        
        // For bottom sheets on mobile or other positions, height is controlled differently
        return "h-full";
    };
    
    // Mobile-specific header styles
    const getMobileHeaderClass = () => {
        if (isMobile) {
            return "sticky top-0 bg-zinc-100 dark:bg-zinc-850 z-10 px-4 py-4";
        }
        return "px-4 py-3";
    };
    
    // Mobile-specific footer styles
    const getMobileFooterClass = () => {
        if (isMobile) {
            return "sticky bottom-0 bg-zinc-100 dark:bg-zinc-850 z-10 px-4 py-4 pb-safe mt-auto";
        }
        return "px-4 pt-2 pb-6 pb-safe";
    };
    
    // Content padding - add pb-safe when there's no footer
    const getContentPaddingClass = () => {
        const basePadding = isMobile ? "px-4 py-4" : "";
        const bottomPadding = showFooter ? "" : "pb-safe";
        return `${basePadding} ${bottomPadding}`.trim();
    };
    
    // CRITICAL: We always render the sheet regardless of isOpen state
    // This ensures state is preserved inside sheet contents
    return (
        <>
            {/* Backdrop - Only shown when open, respects header if enabled */}
            {isOpen && hasBackdrop && (
                <div
                    className={`fixed ${respectHeader ? "left-0 right-0 top-10 bottom-0" : "inset-0"} bg-black/50 z-40 ${isMobile ? "backdrop-blur-sm" : ""} transition-opacity ${durationClass} ${backdropClassName}`}
                    onClick={handleBackdropClick}
                    aria-hidden="true"
                    data-testid="floating-sheet-backdrop"
                />
            )}
            
            {/* Sheet - Always rendered but visibility and position controlled by CSS */}
            <div
                ref={sheetRef}
                className={`fixed ${positionClasses} z-50 ${
                    isMobile || position === "center" ? "" : "w-full"
                } ${widthClass} ${heightClass} ${roundedClass} bg-textured shadow-xl transition-all ${durationClass} ease-out ${transformClass} ${
                    isOpen ? "pointer-events-auto" : "pointer-events-none"
                } ${getSheetHeightClass()} outline-none ${className}`}
                role={role}
                aria-modal={isOpen}
                aria-hidden={!isOpen}
                aria-labelledby="sheet-title"
                tabIndex={-1}
                data-testid="floating-sheet"
            >
                <div className="flex flex-col h-full overflow-hidden">
                    {/* Header - Only show if title exists or showCloseButton is true or headerContent exists */}
                    {showHeader && (
                        <div
                            className={`flex items-center justify-between border-b border-border ${getMobileHeaderClass()} ${headerClassName}`}
                        >
                            <div className="flex-1 min-w-0">
                                {typeof title === "string" ? (
                                    <h2 id="sheet-title" className={`${isMobile ? "text-xl" : "text-lg"} font-semibold text-gray-900 dark:text-gray-100`}>
                                        {title}
                                    </h2>
                                ) : (
                                    <div id="sheet-title">{title}</div>
                                )}
                                {description &&
                                    (typeof description === "string" ? (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
                                    ) : (
                                        <div className="mt-1">{description}</div>
                                    ))}
                            </div>
                            {headerContent && <div className="ml-4 flex items-center">{headerContent}</div>}
                            {showCloseButton && (
                                <button
                                    onClick={onClose}
                                    className={`ml-4 rounded-full ${isMobile ? "p-2" : "p-1.5"} text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600`}
                                    aria-label="Close"
                                    data-testid="floating-sheet-close"
                                >
                                    {closeButton || (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className={`${isMobile ? "h-6 w-6" : "h-5 w-5"}`}
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                    
                    {/* Content area */}
                    <div 
                        ref={contentRef} 
                        className={`flex-1 overflow-y-auto ${getContentPaddingClass()} ${contentClassName}`} 
                        data-testid="floating-sheet-content"
                    >
                        {children}
                    </div>
                    
                    {/* Footer - Only render if provided */}
                    {showFooter && (
                        <div
                            className={`border-t border-border ${getMobileFooterClass()} ${footerClassName}`}
                            data-testid="floating-sheet-footer"
                        >
                            {footer || footerContent}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default FloatingSheet;