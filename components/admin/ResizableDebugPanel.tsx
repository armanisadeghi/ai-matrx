import React, { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue } from 'motion/react';
import { Eye, EyeOff, MaximizeIcon, MinimizeIcon } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface Position {
    x: number;
    y: number;
}

interface Size {
    width: number;
    height: number;
}

interface ViewState {
    position: Position;
    size: Size;
}

// Default sizes without window reference
const CONSTANTS = {
    PADDING: 10,
    MIN_VISIBLE: 100,
    DEFAULT_WIDTH: 550,
    DEFAULT_HEIGHT: 650,
    MIN_WIDTH: 400,
    MIN_HEIGHT: 300
};

const STATES = {
    NORMAL: {
        size: { width: CONSTANTS.DEFAULT_WIDTH, height: CONSTANTS.DEFAULT_HEIGHT }
    },
    MINIMIZED: {
        size: { width: 40, height: 40 }
    },
    MAXIMIZED: {
        size: { width: 0, height: 0 }
    }
};

interface ResizableDebugPanelProps {
    children: React.ReactNode;
}

export default function ResizableDebugPanel({ children }: ResizableDebugPanelProps) {
    const [viewState, setViewState] = useState<'NORMAL' | 'MINIMIZED' | 'MAXIMIZED'>('NORMAL');
    const [size, setSize] = useState<Size>(STATES.NORMAL.size);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [lastNormalState, setLastNormalState] = useState<ViewState | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const resizeHandleRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateWindowDimensions = () => {
            // Use screen width instead of innerWidth
            setWindowDimensions({
                width: window.screen.availWidth,  // or window.screen.width
                height: window.screen.availHeight  // or window.screen.height
            });

            // Log to see what we're getting
            console.log({
                screenWidth: window.screen.width,
                screenAvailWidth: window.screen.availWidth,
                innerWidth: window.innerWidth,
                outerWidth: window.outerWidth
            });
        };

        updateWindowDimensions();
        window.addEventListener('resize', updateWindowDimensions);

        return () => window.removeEventListener('resize', updateWindowDimensions);
    }, []);

    // Initialize position after we have window dimensions
    useEffect(() => {
        if (windowDimensions.width === 0) return;

        const initialX = (windowDimensions.width - STATES.NORMAL.size.width);
        const initialY = windowDimensions.height - STATES.NORMAL.size.height - CONSTANTS.PADDING;
        const constrained = constrainPosition(initialX, initialY);
        x.set(constrained.x);
        y.set(constrained.y);
    }, [windowDimensions]);

    const constrainPosition = (posX: number, posY: number): Position => {
        if (windowDimensions.width === 0) return { x: posX, y: posY };

        const minX = 0; // Don't allow dragging off left
        const maxX = windowDimensions.width - size.width; // Don't allow dragging off right
        const minY = 0;
        const maxY = windowDimensions.height - size.height;

        return {
            x: Math.min(Math.max(posX, minX), maxX),
            y: Math.min(Math.max(posY, minY), maxY)
        };
    };

    const handleResize = (e: MouseEvent) => {
        if (!isResizing) return;

        const rect = panelRef.current?.getBoundingClientRect();
        if (!rect) return;

        const newWidth = Math.max(CONSTANTS.MIN_WIDTH, e.clientX - rect.left);
        const newHeight = Math.max(CONSTANTS.MIN_HEIGHT, e.clientY - rect.top);

        setSize({
            width: Math.min(newWidth, windowDimensions.width - rect.left),
            height: Math.min(newHeight, windowDimensions.height - rect.top)
        });
    };

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleResize);
            window.addEventListener('mouseup', () => setIsResizing(false));
        }

        return () => {
            window.removeEventListener('mousemove', handleResize);
            window.removeEventListener('mouseup', () => setIsResizing(false));
        };
    }, [isResizing]);

    const handleDragStart = (event: MouseEvent) => {
        setIsDragging(true);
        const rect = panelRef.current?.getBoundingClientRect();
        if (rect) {
            setMousePos({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            });
        }
    };

    const handleDrag = (event: MouseEvent, info: any) => {
        if (!isDragging) return;

        const newX = event.clientX - mousePos.x;
        const newY = event.clientY - mousePos.y;

        const constrained = constrainPosition(newX, newY);
        x.set(constrained.x);
        y.set(constrained.y);
    };

    const toggleViewState = () => {
        if (viewState === 'MAXIMIZED') {
            setViewState('NORMAL');
            if (lastNormalState) {
                x.set(lastNormalState.position.x);
                y.set(lastNormalState.position.y);
                setSize(lastNormalState.size);
            }
        } else {
            setLastNormalState({
                position: { x: x.get(), y: y.get() },
                size
            });
            setViewState('MAXIMIZED');
            x.set(CONSTANTS.PADDING);
            y.set(CONSTANTS.PADDING);
            setSize({
                width: windowDimensions.width - (CONSTANTS.PADDING * 2),
                height: windowDimensions.height - (CONSTANTS.PADDING * 2)
            });
        }
    };

    const toggleMinimize = () => {
        if (viewState === 'MINIMIZED') {
            setViewState('NORMAL');
            if (lastNormalState) {
                x.set(lastNormalState.position.x);
                y.set(lastNormalState.position.y);
                setSize(lastNormalState.size);
            }
        } else {
            setLastNormalState({
                position: { x: x.get(), y: y.get() },
                size
            });
            setViewState('MINIMIZED');
            x.set(windowDimensions.width - 60);
            y.set(windowDimensions.height - 60);
            setSize(STATES.MINIMIZED.size);
        }
    };

    return (
        <motion.div
            ref={panelRef}
            style={{
                position: 'fixed',
                x,
                y,
                width: size.width,
                height: size.height,
                touchAction: 'none',
                zIndex: 50,
                left: 0,  // Add this
                top: 0,   // Add this
                transform: 'none'  // Add this to prevent any inherited transforms
            }}
            drag={!isResizing && viewState !== 'MAXIMIZED'}
            dragMomentum={false}
            dragElastic={0}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={() => setIsDragging(false)}
            dragConstraints={{
                left: 0,
                top: 0,
                right: windowDimensions.width - size.width,
                bottom: windowDimensions.height - size.height
            }}
            className="bg-background border rounded-lg shadow-lg overflow-hidden"
        >
            {/* Debug Overlay */}
{/*
            <div className="absolute top-150 left-0 bg-black/50 text-white p-2 text-xs font-mono z-50">
                <div>Panel X: {Math.round(x.get())}</div>
                <div>Panel Y: {Math.round(y.get())}</div>
                <div>Mouse X: {mousePos.x}</div>
                <div>Mouse Y: {mousePos.y}</div>
                <div>Window Width: {windowDimensions.width}</div>
                <div>Window Height: {windowDimensions.height}</div>
                <div>Panel Width: {size.width}</div>
                <div>State: {viewState}</div>
            </div>
*/}

            {viewState === 'MINIMIZED' ? (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleMinimize}
                    className="w-10 h-10"
                >
                    <Eye className="w-4 h-4" />
                </Button>
            ) : (
                 <>
                     <div className="absolute top-2 right-2 flex items-center gap-2">
                         <Button
                             variant="ghost"
                             size="icon"
                             onClick={toggleMinimize}
                             className="h-8 w-8"
                         >
                             <EyeOff className="h-4 w-4" />
                         </Button>
                         <Button
                             variant="ghost"
                             size="icon"
                             onClick={toggleViewState}
                             className="h-8 w-8"
                         >
                             {viewState === 'MAXIMIZED' ? (
                                 <MinimizeIcon className="h-4 w-4" />
                             ) : (
                                  <MaximizeIcon className="h-4 w-4" />
                              )}
                         </Button>
                     </div>

                     <div className="h-full overflow-hidden pt-12">
                         {children}
                     </div>

                     {viewState !== 'MAXIMIZED' && (
                         <div
                             ref={resizeHandleRef}
                             className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                             onMouseDown={() => setIsResizing(true)}
                             style={{
                                 background: 'linear-gradient(135deg, transparent 50%, rgba(100,100,100,0.3) 50%)'
                             }}
                         />
                     )}
                 </>
             )}
        </motion.div>
    );
}
