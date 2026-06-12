'use client';

import React, { useEffect, useRef, useState } from "react";
import { useBackgroundPosition, useWindowSize } from "@/components/matrx/next-windows/parts/utils";
import { AnimatePresence, motion } from "motion/react";
import Window from "@/components/matrx/next-windows/parts/Window";
import { Command, Minimize2 } from "lucide-react";
import CommandPalette from "@/components/matrx/next-windows/CommandPallet";

interface WindowData {
    id: string;
    title: string;
    content: string;
    images: string[];
    href: string;
    minimized?: boolean;
}

interface NextWindowManagerProps {
    windows: WindowData[];
}

const NextWindowManager: React.FC<NextWindowManagerProps> = ({ windows: initialWindows }) => {
    const [windows, setWindows] = useState<WindowData[]>(initialWindows);
    const [fullScreenWindow, setFullScreenWindow] = useState<string | null>(null);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const windowSize = useWindowSize(containerRef);
    const { backgroundPosition, setBackgroundPosition } = useBackgroundPosition();

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === 'k' && e.metaKey) {
                e.preventDefault();
                setIsCommandPaletteOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, []);

    const closeWindow = (id: string) => {
        setWindows(windows.filter(window => window.id !== id));
        if (fullScreenWindow === id) setFullScreenWindow(null);
    };

    const minimizeWindow = (id: string) => {
        setWindows(windows.map(window =>
            window.id === id ? { ...window, minimized: !window.minimized } : window
        ));
        if (fullScreenWindow === id) setFullScreenWindow(null);
    };

    const maximizeWindow = (id: string) => {
        setFullScreenWindow(fullScreenWindow === id ? null : id);
    };

    const handleWindowClick = (id: string) => {
        setFullScreenWindow(id);
    };

    const handleCommand = (command: string) => {
        // Implement command handling logic here
        console.log('Executing command:', command);
    };

    return (
        <motion.div
            ref={containerRef}
            className="relative w-full h-dvh overflow-auto bg-background p-8"
            onMouseMove={(e) => {
                setBackgroundPosition({ x: e.clientX / 100, y: e.clientY / 100 });
            }}
            animate={{
                backgroundPosition: `${backgroundPosition.x}px ${backgroundPosition.y}px`,
            }}
            transition={{ type: 'spring', stiffness: 50, damping: 20 }}
        >
            <CommandPalette
                isOpen={isCommandPaletteOpen}
                onClose={() => setIsCommandPaletteOpen(false)}
                onCommand={handleCommand}
            />
            <div className="flex flex-wrap gap-4">
                <AnimatePresence>
                    {windows.map((window) => (
                        <Window
                            key={window.id}
                            {...window}
                            onClose={closeWindow}
                            onMinimize={minimizeWindow}
                            onMaximize={maximizeWindow}
                            onClick={handleWindowClick}
                            isFullScreen={fullScreenWindow === window.id}
                            windowSize={windowSize}
                        />
                    ))}
                </AnimatePresence>
            </div>
            {fullScreenWindow && (
                <motion.div
                    className="fixed bottom-4 right-4 bg-popover text-popover-foreground p-2 rounded-full shadow-lg cursor-pointer z-50"
                    onClick={() => setFullScreenWindow(null)}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <Minimize2 size={24}/>
                </motion.div>
            )}
            <motion.button
                className="fixed bottom-4 left-4 bg-popover text-popover-foreground p-2 rounded-full shadow-lg cursor-pointer z-50"
                onClick={() => setIsCommandPaletteOpen(prev => !prev)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
            >
                <Command size={24}/>
            </motion.button>
        </motion.div>
    );
};

export default NextWindowManager;
