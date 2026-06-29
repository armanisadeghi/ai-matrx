"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectCanvasIsOpen, selectCanvasContent, setCanvasAvailable } from "@/features/canvas/redux/canvasSlice";
import dynamic from "next/dynamic";

const CanvasRenderer = dynamic(
  () => import("@/features/canvas/core/CanvasRenderer").then(m => ({ default: m.CanvasRenderer })),
  { ssr: false }
);

interface AdaptiveLayoutProps {
    header?: React.ReactNode;
    leftPanel?: React.ReactNode; // Optional - if not provided, content takes full width
    rightPanel: React.ReactNode;
    canvasPanel?: React.ReactNode; // Optional override - if not provided, uses Redux canvas
    className?: string;
    // Optional: custom breakpoint for mobile stacking (default: 950px)
    mobileBreakpoint?: number;
    // Optional: max width for left panel (default: 640px)
    leftPanelMaxWidth?: number;
    // Optional: disable automatic canvas rendering (default: false)
    disableAutoCanvas?: boolean;
}

/**
 * AdaptiveLayout - A flexible, unopinionated two-column layout with optional canvas panel
 * 
 * Features:
 * - Left panel: configurable max width (default 640px), proportional shrinking
 * - Right panel: flexible width with centered content (max 800px)
 * - Canvas panel: optional right-side panel with resizable divider
 * - Fully responsive with mobile stacking at configurable breakpoint
 * - Proportional shrinking: both panels reduce equally until mobile breakpoint
 * - NO opinionated styling (borders, padding, backgrounds) - purely structural
 */
export function AdaptiveLayout({
    header,
    leftPanel,
    rightPanel,
    canvasPanel,
    className,
    mobileBreakpoint = 950,
    leftPanelMaxWidth = 640,
    disableAutoCanvas = false,
}: AdaptiveLayoutProps) {
    const dispatch = useAppDispatch();
    const [isResizing, setIsResizing] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [canvasWidth, setCanvasWidth] = useState(1000); // Local state for canvas width
    const containerRef = useRef<HTMLDivElement>(null);
    const mainContainerRef = useRef<HTMLDivElement>(null);
    const leftPanelRef = useRef<HTMLDivElement>(null);
    const rightPanelRef = useRef<HTMLDivElement>(null);

    // Get canvas state from Redux
    const isCanvasOpen = useAppSelector(selectCanvasIsOpen);
    const canvasContent = useAppSelector(selectCanvasContent);
    
    // Set canvas availability based on disableAutoCanvas prop
    useEffect(() => {
        dispatch(setCanvasAvailable(!disableAutoCanvas));
        
        // Clean up: disable canvas when component unmounts
        return () => {
            dispatch(setCanvasAvailable(false));
        };
    }, [disableAutoCanvas, dispatch]);

    // Determine which canvas to show: explicit prop or Redux canvas
    const effectiveCanvasPanel = canvasPanel || 
      (!disableAutoCanvas && isCanvasOpen ? <CanvasRenderer content={canvasContent} /> : undefined);
    
    const hasCanvas = !!effectiveCanvasPanel;

    // Track window width to determine mobile vs desktop
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < mobileBreakpoint);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [mobileBreakpoint]);

    // Intelligently set canvas width when it first opens
    useEffect(() => {
        if (!hasCanvas) return;

        const windowWidth = window.innerWidth;
        const targetWidth = 1200;
        const minMainContentWidth = 700;
        const leftPanelWidth = leftPanel ? leftPanelMaxWidth : 0;
        
        // Calculate available space: window - leftPanel
        const availableForCanvasAndMain = windowWidth - leftPanelWidth;
        
        // If we have enough space for target + min main content, use target
        if (availableForCanvasAndMain >= targetWidth + minMainContentWidth) {
            setCanvasWidth(targetWidth);
        } else {
            // Otherwise, maximize canvas while keeping main content readable
            const maxPossibleWidth = Math.max(
                400, // Absolute minimum canvas width
                availableForCanvasAndMain - minMainContentWidth
            );
            // Cap at 1200px max
            setCanvasWidth(Math.min(maxPossibleWidth, 1200));
        }
    }, [hasCanvas, leftPanel, leftPanelMaxWidth]);

    // Prevent ALL auto-scrolling behavior - AGGRESSIVE approach
    useEffect(() => {
        const panels = [leftPanelRef, rightPanelRef];
        const scrollPositions = new Map<HTMLDivElement, number>();
        let isRestoring = false;

        // Continuously monitor and lock scroll positions
        const lockScrollPosition = (panel: HTMLDivElement) => {
            if (!scrollPositions.has(panel)) {
                scrollPositions.set(panel, panel.scrollTop);
            }
        };

        // Aggressively restore scroll position
        const restoreScroll = (panel: HTMLDivElement) => {
            const savedPosition = scrollPositions.get(panel);
            if (savedPosition !== undefined && panel.scrollTop !== savedPosition) {
                isRestoring = true;
                panel.scrollTop = savedPosition;
                requestAnimationFrame(() => {
                    if (panel.scrollTop !== savedPosition) {
                        panel.scrollTop = savedPosition;
                    }
                    isRestoring = false;
                });
            }
        };

        // Update saved position only during manual scrolling
        const handleScroll = (e: Event) => {
            if (isRestoring) return;
            
            const panel = e.target as HTMLDivElement;
            if (panel === leftPanelRef.current || panel === rightPanelRef.current) {
                // This is manual scrolling - update the saved position
                scrollPositions.set(panel, panel.scrollTop);
            }
        };

        // AGGRESSIVE: Lock position before focus can cause scroll
        const handleFocusCapture = (e: FocusEvent) => {
            panels.forEach(panelRef => {
                const panel = panelRef.current;
                if (panel && panel.contains(e.target as Node)) {
                    lockScrollPosition(panel);
                    
                    // Restore immediately and repeatedly to override browser scroll
                    restoreScroll(panel);
                    requestAnimationFrame(() => restoreScroll(panel));
                    setTimeout(() => restoreScroll(panel), 0);
                    setTimeout(() => restoreScroll(panel), 10);
                    setTimeout(() => restoreScroll(panel), 50);
                }
            });
        };

        // Prevent scrollIntoView calls
        const originalScrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function(this: Element, arg?: boolean | ScrollIntoViewOptions) {
            const isInPanel = panels.some(panelRef => panelRef.current?.contains(this));
            if (!isInPanel) {
                originalScrollIntoView.call(this, arg);
            }
        };

        // Add listeners with capture phase for earliest possible interception
        document.addEventListener('scroll', handleScroll, true);
        document.addEventListener('focusin', handleFocusCapture, true);

        return () => {
            document.removeEventListener('scroll', handleScroll, true);
            document.removeEventListener('focusin', handleFocusCapture, true);
            Element.prototype.scrollIntoView = originalScrollIntoView;
        };
    }, []);

    // Handle mouse drag for resizing canvas panel - optimized with useCallback
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        
        // Calculate width from the right edge
        const newWidth = containerRect.right - e.clientX;
        
        // Constrain canvas width between 400px min and 1200px max
        const minWidth = 400;
        const maxWidth = 1200;
        const constrainedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
        
        // Update local state directly - much faster than Redux
        setCanvasWidth(constrainedWidth);
    }, []);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    // Handle mouse drag for resizing canvas panel
    useEffect(() => {
        if (!isResizing) return undefined;

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    // Prevent text selection during resize
    useEffect(() => {
        if (isResizing) {
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        } else {
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    }, [isResizing]);

    return (
        <div ref={mainContainerRef} className={cn("h-full flex flex-col", className)}>
            {/* Header */}
            {header && (
                <div className="flex-shrink-0">
                    {header}
                </div>
            )}

            {/* Main Content Area */}
            <div 
                className={cn(
                    "flex-1 flex",
                    isMobile ? "flex-col overflow-y-auto" : "flex-row overflow-hidden"
                )}
            >
                {/* Left Panel - equal shrinking with right panel, max at leftPanelMaxWidth (optional) */}
                {leftPanel && (
                    <div 
                        ref={leftPanelRef}
                        className={cn(
                            isMobile ? "w-full" : "overflow-y-auto"
                        )}
                        style={isMobile ? undefined : {
                            flex: `1 1 0`,
                            maxWidth: `${leftPanelMaxWidth}px`,
                            minWidth: '300px', // Minimum width before switching to mobile
                            overflowAnchor: 'none', // Prevent browser auto-scroll
                            scrollPaddingTop: '0px', // Prevent scroll-into-view padding
                        }}
                    >
                        {leftPanel}
                    </div>
                )}

                {/* Right Panel - equal shrinking with left panel (or full width if no left panel) */}
                <div 
                    ref={containerRef}
                    className={cn(
                        "relative flex",
                        !isMobile && "overflow-hidden",
                        !leftPanel && "flex-1" // Take full width if no left panel
                    )}
                    style={isMobile ? undefined : (leftPanel ? {
                        flex: `1 1 0`,
                        minWidth: '400px', // Minimum width to keep content readable
                    } : undefined)}
                >
                    {/* Content Area */}
                    <div 
                        ref={rightPanelRef}
                        className={cn(
                            "flex-1",
                            !isMobile && "overflow-y-auto"
                        )}
                        style={{
                            ...(hasCanvas && !isMobile ? { marginRight: `${canvasWidth}px` } : {}),
                            ...(!isMobile ? {
                                overflowAnchor: 'none',
                                scrollPaddingTop: '0px',
                            } : {})
                        }}
                    >
                        {/* Content wrapper - Always enforce max-width for readability */}
                        <div className="h-full max-w-[800px] mx-auto">
                            {rightPanel}
                        </div>
                    </div>

                    {/* Canvas Panel - optional, right side (desktop only) */}
                    {hasCanvas && !isMobile && (
                        <>
                            {/* Resizer Handle - Wider hit area with visible handle */}
                            <div
                                className={cn(
                                    "group absolute top-0 bottom-0 cursor-col-resize z-10",
                                    "flex items-center justify-center"
                                )}
                                style={{
                                    right: `${canvasWidth}px`,
                                    width: '16px', // Wider hit area
                                    marginRight: '-8px', // Center on the border
                                }}
                                onMouseDown={() => setIsResizing(true)}
                            >
                                {/* Visual separator line - hidden in top rounded area */}
                                <div className={cn(
                                    "absolute bottom-0 w-px left-1/2 transform -translate-x-1/2",
                                    "bg-gray-300 dark:bg-gray-700",
                                    "group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600 transition-colors"
                                )}
                                style={{
                                    top: '4rem', // Start below the rounded corner (rounded-tl-2xl)
                                }}
                                />
                                
                                {/* Drag Handle - always visible, more prominent on hover */}
                                <div className={cn(
                                    "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
                                    "w-1.5 h-16 rounded-full",
                                    "bg-gray-400 dark:bg-gray-600",
                                    "opacity-60 group-hover:opacity-100",
                                    "group-hover:bg-zinc-500 dark:group-hover:bg-zinc-500",
                                    "transition-all duration-200",
                                    "shadow-md"
                                )}>
                                    {/* Grip lines */}
                                    <div className="absolute inset-0 flex items-center justify-center gap-0.5">
                                        <div className="w-px h-8 bg-white dark:bg-gray-200 rounded-full opacity-60" />
                                        <div className="w-px h-8 bg-white dark:bg-gray-200 rounded-full opacity-60" />
                                    </div>
                                </div>
                            </div>

                            {/* Canvas Panel */}
                            <div
                                className="absolute top-0 bottom-0 right-0 overflow-hidden shadow-lg border-l border-t border-zinc-200 dark:border-zinc-800 rounded-tl-2xl"
                                style={{
                                    width: `${canvasWidth}px`,
                                    pointerEvents: isResizing ? 'none' : 'auto', // Disable interaction during resize
                                }}
                            >
                                {effectiveCanvasPanel}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

